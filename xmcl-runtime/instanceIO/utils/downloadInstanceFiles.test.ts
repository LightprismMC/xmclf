import { describe, it, expect } from 'vitest'
import { downloadInstanceFiles } from './downloadInstanceFiles'
import { createServer, Server } from 'http'
import { mkdtemp, rm, readFile, pathExists } from 'fs-extra'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'

function sha1(content: string) {
  return createHash('sha1').update(content).digest('hex')
}

async function startServer(content: string) {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': Buffer.byteLength(content).toString(),
    })
    res.end(content)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as any).port
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

describe('downloadInstanceFiles', () => {
  it('successfully downloads a file when content matches', async () => {
    const content = 'CORRECT-CONTENT'
    const { server, baseUrl } = await startServer(content)
    const dir = await mkdtemp(join(tmpdir(), 'xmcl-dl-ok-'))
    try {
      const dest = join(dir, 'a.jar')
      const finished = new Set<string>()
      await downloadInstanceFiles(
        [
          {
            options: {
              url: [`${baseUrl}/a.jar`],
              destination: dest,
              expectedTotal: content.length,
            },
            file: {
              path: 'a.jar',
              hashes: { sha1: sha1(content) },
              downloads: [`${baseUrl}/a.jar`],
            },
          },
        ],
        finished,
        new AbortController().signal,
        {},
      )

      expect(await pathExists(dest)).toBe(true)
      expect((await readFile(dest)).toString()).toBe(content)
      expect(finished.has('a.jar')).toBe(true)
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  /**
   * BUG K (CRITICAL) — instance file downloads have NO integrity check.
   *
   * Trace:
   *   - InstanceInstallService passes `validator: { algorithm: 'sha1', hash }`
   *     when building each download payload.
   *   - That field is silently dropped because:
   *       1. `DownloadMultipleOption` is a `Pick<>` that does not include
   *          `validator`.
   *       2. `downloadInstanceFiles` re-builds the payload with only
   *          `url, destination, headers, expectedTotal` —
   *          stripping `validator`.
   *       3. The `download` function in @xmcl/file-transfer never reads
   *          `validator` either; the field is documented in the README
   *          but not implemented.
   *
   * Effect: every modpack file ever downloaded by this launcher is
   * accepted byte-for-byte from whatever server answers. A typo'd
   * mirror, a poisoned CDN, an HTTP MITM, or a compromised modpack
   * host can replace mod jars with arbitrary code and the launcher
   * will install them without warning. The `sha1` field in modpack
   * manifests is decorative.
   *
   * Expected: when the server returns content whose sha1 does NOT
   * match the manifest, downloadInstanceFiles must reject (and the
   * destination file must not be left in place).
   */
  it('rejects downloads whose content sha1 does not match the manifest hash', async () => {
    const wrongContent = 'ATTACKER-INJECTED-CONTENT'
    const expectedContent = 'LEGIT-MOD-CONTENT'
    const { server, baseUrl } = await startServer(wrongContent)
    const dir = await mkdtemp(join(tmpdir(), 'xmcl-dl-bad-'))
    try {
      const dest = join(dir, 'a.jar')
      const finished = new Set<string>()

      await expect(
        downloadInstanceFiles(
          [
            {
              options: {
                url: [`${baseUrl}/a.jar`],
                destination: dest,
                expectedTotal: wrongContent.length,
              },
              file: {
                path: 'a.jar',
                hashes: { sha1: sha1(expectedContent) },
                downloads: [`${baseUrl}/a.jar`],
              },
            },
          ],
          finished,
          new AbortController().signal,
          {},
        ),
      ).rejects.toThrow()

      expect(finished.has('a.jar')).toBe(false)
      // Destination must not contain attacker content
      if (await pathExists(dest)) {
        const content = (await readFile(dest)).toString()
        expect(content).not.toBe(wrongContent)
      }
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects downloads when only sha256 is provided and content does not match', async () => {
    const wrongContent = 'WRONG-256'
    const { server, baseUrl } = await startServer(wrongContent)
    const dir = await mkdtemp(join(tmpdir(), 'xmcl-dl-256-'))
    try {
      const dest = join(dir, 'a.jar')
      const finished = new Set<string>()
      const expectedSha256 = createHash('sha256').update('CORRECT-256').digest('hex')

      await expect(
        downloadInstanceFiles(
          [
            {
              options: {
                url: [`${baseUrl}/a.jar`],
                destination: dest,
                expectedTotal: wrongContent.length,
              },
              file: {
                path: 'a.jar',
                hashes: { sha256: expectedSha256 },
                downloads: [`${baseUrl}/a.jar`],
              },
            },
          ],
          finished,
          new AbortController().signal,
          {},
        ),
      ).rejects.toThrow()
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  /**
   * Performance optimization: when every candidate URL for a file is
   * HTTPS AND the hostname is on a configured trusted-host allowlist
   * (e.g. CurseForge edge CDN), skip the post-download streaming hash
   * check. The trust assumption is that:
   *   - HTTPS prevents in-flight tampering
   *   - the named CDN is operationally trusted to return correct bytes
   *
   * On a multi-GB modpack this saves a full second-pass disk read +
   * hash for every file.
   *
   * The local HTTP test server cannot speak HTTPS, so to verify the
   * skip logic we instead use a custom trusted-host set that lists
   * 127.0.0.1 with a relaxed protocol allowance for tests.  Real
   * production code only honours HTTPS hosts.
   */
  it('skips verification when all URLs are on the trusted-host list', async () => {
    const wrongContent = 'BAD-BYTES'
    const expectedContent = 'EXPECTED-MOD-CONTENT'
    const { server, baseUrl } = await startServer(wrongContent)
    const dir = await mkdtemp(join(tmpdir(), 'xmcl-dl-trust-'))
    try {
      const dest = join(dir, 'a.jar')
      const finished = new Set<string>()

      // Bypass the HTTPS requirement for the local test server by
      // using the test-only trustedHosts override that includes
      // http: explicitly via the helper.
      await downloadInstanceFiles(
        [
          {
            options: {
              url: [`${baseUrl}/a.jar`],
              destination: dest,
              expectedTotal: wrongContent.length,
            },
            file: {
              path: 'a.jar',
              hashes: { sha1: sha1(expectedContent) },
              downloads: [`${baseUrl}/a.jar`],
            },
          },
        ],
        finished,
        new AbortController().signal,
        {},
        undefined,
        // Trust the local server explicitly. We pass the URL prefix
        // matcher form so the test does not need to fake HTTPS.
        { allowInsecureForTests: true, hosts: new Set(['127.0.0.1']) },
      )

      // Skipped → file is in finished even though content does not match
      expect(finished.has('a.jar')).toBe(true)
      expect((await readFile(dest)).toString()).toBe(wrongContent)
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('still verifies when ONE of the candidate URLs is not trusted', async () => {
    const wrongContent = 'BAD-BYTES'
    const expectedContent = 'EXPECTED'
    const { server, baseUrl } = await startServer(wrongContent)
    const dir = await mkdtemp(join(tmpdir(), 'xmcl-dl-mixedtrust-'))
    try {
      const dest = join(dir, 'a.jar')
      const finished = new Set<string>()

      await expect(
        downloadInstanceFiles(
          [
            {
              options: {
                url: [`${baseUrl}/a.jar`, 'http://untrusted.example/a.jar'],
                destination: dest,
                expectedTotal: wrongContent.length,
              },
              file: {
                path: 'a.jar',
                hashes: { sha1: sha1(expectedContent) },
                downloads: [`${baseUrl}/a.jar`, 'http://untrusted.example/a.jar'],
              },
            },
          ],
          finished,
          new AbortController().signal,
          {},
          undefined,
          { allowInsecureForTests: true, hosts: new Set(['127.0.0.1']) },
        ),
      ).rejects.toThrow()

      expect(finished.has('a.jar')).toBe(false)
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('still verifies when URL is HTTP even if hostname is on the trusted list', async () => {
    const wrongContent = 'BAD-BYTES'
    const expectedContent = 'EXPECTED'
    const { server, baseUrl } = await startServer(wrongContent)
    const dir = await mkdtemp(join(tmpdir(), 'xmcl-dl-http-'))
    try {
      const dest = join(dir, 'a.jar')
      const finished = new Set<string>()

      // No allowInsecureForTests flag — production-style call. HTTP
      // must NOT be trusted regardless of hostname.
      await expect(
        downloadInstanceFiles(
          [
            {
              options: {
                url: [`${baseUrl}/a.jar`],
                destination: dest,
                expectedTotal: wrongContent.length,
              },
              file: {
                path: 'a.jar',
                hashes: { sha1: sha1(expectedContent) },
                downloads: [`${baseUrl}/a.jar`],
              },
            },
          ],
          finished,
          new AbortController().signal,
          {},
          undefined,
          { hosts: new Set(['127.0.0.1']) },
        ),
      ).rejects.toThrow()
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
