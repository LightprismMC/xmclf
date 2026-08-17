import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readJson, writeJson } from 'fs-extra'
import { join } from 'path'
import { YggdrasilSeriveRegistry } from './YggdrasilSeriveRegistry'
import { loadYggdrasilApiProfile } from './user'

vi.mock('fs-extra', () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
}))

vi.mock('~/infra', () => ({
  kFlights: Symbol('kFlights'),
}))

vi.mock('./user', () => ({
  loadYggdrasilApiProfile: vi.fn(),
}))

describe('YggdrasilSeriveRegistry', () => {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
  }
  const app = {
    appDataPath: '/mock/app/data',
    fetch: vi.fn(),
    getLogger: vi.fn(() => logger),
    protocol: { registerHandler: vi.fn() },
    registry: { get: vi.fn().mockResolvedValue({}) },
  } as any

  const ELY = 'https://authserver.ely.by/api/authlib-injector'
  const LITTLE_SKIN = 'https://littleskin.cn/api/yggdrasil'

  beforeEach(() => {
    vi.clearAllMocks()
    // A metadata request that fails resolves to a bare `{ url }`.
    vi.mocked(loadYggdrasilApiProfile).mockImplementation(async (url: string) => ({ url }))
  })

  it('falls back to defaults when persisted service metadata is invalid', async () => {
    vi.mocked(readJson).mockResolvedValue({
      yggdrasilServices: [{
        url: 'https://example.com/api/yggdrasil',
        authlibInjector: { meta: { links: { homepage: 42 } } },
      }],
    })

    const registry = new YggdrasilSeriveRegistry(app)

    await registry.load()

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to load Yggdrasil services. Falling back to defaults.',
      expect.anything(),
    )
    expect(registry.getYggdrasilServices().map(s => s.url)).toEqual([ELY, LITTLE_SKIN])
  })

  it('keeps the built-in metadata when the service api cannot be reached', async () => {
    vi.mocked(readJson).mockRejectedValue(new Error('ENOENT'))

    const registry = new YggdrasilSeriveRegistry(app)
    await registry.load()

    const ely = registry.getYggdrasilServices().find(s => s.url === ELY)
    expect(ely?.authlibInjector?.meta.serverName).toBe('Ely.by')
    expect(ely?.authlibInjector?.meta.links.register).toBe('https://account.ely.by/register')
  })

  it('persists the defaults so later launches do not depend on the network', async () => {
    vi.mocked(readJson).mockRejectedValue(new Error('ENOENT'))

    const registry = new YggdrasilSeriveRegistry(app)
    await registry.load()

    expect(writeJson).toHaveBeenCalledWith(
      join('/mock/app/data', 'yggdrasil.json'),
      { yggdrasilServices: registry.getYggdrasilServices() },
      { spaces: 2 },
    )
  })

  it('re-fetches a built-in that was cached without its metadata', async () => {
    vi.mocked(readJson).mockResolvedValue({ yggdrasilServices: [{ url: ELY }] })
    vi.mocked(loadYggdrasilApiProfile).mockResolvedValue({
      url: ELY,
      authlibInjector: {
        meta: {
          serverName: 'Ely.by',
          implementationName: '',
          implementationVersion: '2.0.0',
          links: { homepage: 'https://ely.by', register: 'https://account.ely.by/register' },
          'feature.non_email_login': true,
        },
        signaturePublickey: 'live-key',
        skinDomains: ['ely.by'],
      },
    })

    const registry = new YggdrasilSeriveRegistry(app)
    await registry.load()

    expect(loadYggdrasilApiProfile).toHaveBeenCalledWith(ELY, app.fetch)
    const ely = registry.getYggdrasilServices().find(s => s.url === ELY)
    expect(ely?.authlibInjector?.signaturePublickey).toBe('live-key')
  })

  it('leaves a built-in the user removed removed', async () => {
    vi.mocked(readJson).mockResolvedValue({ yggdrasilServices: [{ url: LITTLE_SKIN }] })

    const registry = new YggdrasilSeriveRegistry(app)
    await registry.load()

    expect(registry.getYggdrasilServices().map(s => s.url)).not.toContain(ELY)
  })
})