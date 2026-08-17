import { AUTHORITY_DEV, AUTHORITY_MICROSOFT, AuthorityMetadata } from '@xmcl/runtime-api'
import { describe, expect, it } from 'vitest'
import { buildAuthorityItems } from './login'

const ELY = 'https://authserver.ely.by/api/authlib-injector'

/** i18n stub: return the key so assertions stay locale-independent. */
const t = (key: string) => key

function authority(overrides: Partial<AuthorityMetadata> & { authority: string }): AuthorityMetadata {
  return { flow: ['password'], kind: 'yggdrasil', ...overrides }
}

describe('buildAuthorityItems', () => {
  it('offers the offline account', () => {
    const items = buildAuthorityItems([
      authority({ authority: AUTHORITY_MICROSOFT, flow: ['grant-code'], kind: 'builtin' }),
      authority({ authority: AUTHORITY_DEV, flow: ['anonymous'], kind: 'builtin' }),
    ], t)

    expect(items.map(i => i.value)).toEqual([AUTHORITY_MICROSOFT, AUTHORITY_DEV])
    expect(items[1].text).toBe('userServices.offline.name')
  })

  it('offers third-party services alongside Microsoft', () => {
    const items = buildAuthorityItems([
      authority({ authority: AUTHORITY_MICROSOFT, kind: 'builtin' }),
      authority({ authority: ELY }),
    ], t)

    expect(items.map(i => i.value)).toContain(ELY)
  })

  it('names a service from its authlib-injector metadata', () => {
    const [item] = buildAuthorityItems([
      authority({
        authority: ELY,
        authlibInjector: {
          meta: {
            serverName: 'Ely.by',
            implementationName: '',
            implementationVersion: '',
            links: { homepage: 'https://ely.by', register: 'https://account.ely.by/register' },
            'feature.non_email_login': true,
          },
          signaturePublickey: '',
          skinDomains: ['ely.by'],
        },
      }),
    ], t)

    expect(item.text).toBe('Ely.by')
  })

  it('falls back to the host when the service reports no name', () => {
    const withEmptyName = buildAuthorityItems([
      authority({
        authority: ELY,
        authlibInjector: {
          meta: {
            serverName: '',
            implementationName: '',
            implementationVersion: '',
            links: { homepage: '', register: '' },
            'feature.non_email_login': false,
          },
          signaturePublickey: '',
          skinDomains: [],
        },
      }),
    ], t)
    const withNoMetadata = buildAuthorityItems([authority({ authority: ELY })], t)

    expect(withEmptyName[0].text).toBe('authserver.ely.by')
    expect(withNoMetadata[0].text).toBe('authserver.ely.by')
  })

  it('gives Ely.by an icon when the service has no favicon', () => {
    const [item] = buildAuthorityItems([authority({ authority: ELY })], t)

    expect(item.icon).toMatch(/^data:image\/svg\+xml/)
  })

  it('prefers the favicon the service advertises', () => {
    const [item] = buildAuthorityItems([
      authority({ authority: ELY, favicon: 'https://ely.by/favicon.ico' }),
    ], t)

    expect(item.icon).toBe('https://ely.by/favicon.ico')
  })
})
