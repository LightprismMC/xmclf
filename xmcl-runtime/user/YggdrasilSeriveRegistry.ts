import { YggdrasilApi, YggdrasilSchema } from '@xmcl/runtime-api'
import { readJson, writeJson } from 'fs-extra'
import { join } from 'path'
import { InjectionKey, LauncherApp } from '~/app'
import { kFlights, Logger } from '~/infra'
import { loadYggdrasilApiProfile } from './user'

const BUILTIN_CLIENT = {
  'open.littleskin.cn': '393'
} as Record<string, string>

/**
 * The services shipped with the launcher, with enough metadata baked in to be
 * usable before -- or without -- a successful call to their api root.
 *
 * {@link loadYggdrasilApiProfile} never rejects: a failed request just yields a
 * bare `{ url }`, which would leave the account picker showing a raw host name
 * and no register link. Falling back to these keeps a first launch on a slow or
 * blocked network looking the same as a healthy one.
 *
 * `signaturePublickey` is deliberately left empty rather than pinned here: it
 * is only surfaced for information, and a stale copy of a rotated key would be
 * worse than no copy. A successful fetch fills it in and is then persisted.
 */
const BUILTIN_SERVICES: Array<{
  fallback: YggdrasilApi
  /** Advertises `feature.openid_configuration_url`, so a cached entry without
   * an {@link YggdrasilApi.ocidConfig} is incomplete and worth re-fetching. */
  ocid?: boolean
}> = [{
  fallback: {
    url: 'https://authserver.ely.by/api/authlib-injector',
    authlibInjector: {
      meta: {
        serverName: 'Ely.by',
        implementationName: 'Account Ely.by adapter for the authlib-injector library',
        implementationVersion: '',
        links: {
          homepage: 'https://ely.by',
          register: 'https://account.ely.by/register',
        },
        'feature.non_email_login': true,
      },
      signaturePublickey: '',
      skinDomains: ['ely.by', '.ely.by'],
    },
  },
}, {
  ocid: true,
  fallback: {
    url: 'https://littleskin.cn/api/yggdrasil',
    authlibInjector: {
      meta: {
        serverName: 'LittleSkin',
        implementationName: 'Yggdrasil Connect',
        implementationVersion: '',
        links: {
          homepage: 'https://littleskin.cn',
          register: 'https://littleskin.cn/auth/register',
        },
        'feature.non_email_login': true,
      },
      signaturePublickey: '',
      skinDomains: ['littleskin.cn'],
    },
  },
}]

export const kYggdrasilSeriveRegistry: InjectionKey<YggdrasilSeriveRegistry> = Symbol('YggdrasilSeriveRegistry')

export class YggdrasilSeriveRegistry {
  private yggdrasilServices: YggdrasilApi[] = []

  private yggdrasilJsonPath: string

  private logger: Logger

  constructor(private app: LauncherApp) {
    this.logger = app.getLogger('YggdrasilSeriveRegistry')
    this.yggdrasilJsonPath = join(app.appDataPath, 'yggdrasil.json')

    app.protocol.registerHandler('authlib-injector', ({ request, response }) => {
      this.addYggdrasilService(request.url.pathname)
    })

    app.registry.get(kFlights).then((flights) => {
      const clients = flights['yggdrasilClients']
      if (clients && typeof clients === 'object') {
        for (const [host, clientId] of Object.entries(clients)) {
          if (typeof clientId === 'string') {
            BUILTIN_CLIENT[host] = clientId
          }
        }
      }
    })
  }

  /**
   * Fetch a built-in service's live profile, backfilling anything the request
   * could not supply from {@link BUILTIN_SERVICES}.
   */
  private async loadBuiltinService({ fallback }: (typeof BUILTIN_SERVICES)[number]): Promise<YggdrasilApi> {
    const api = await loadYggdrasilApiProfile(fallback.url, this.app.fetch)
    return { ...fallback, ...api, authlibInjector: api.authlibInjector ?? fallback.authlibInjector }
  }

  private async getDefaultYggdrasilServices(): Promise<YggdrasilSchema> {
    const yggdrasilServices = await Promise.all(BUILTIN_SERVICES.map(s => this.loadBuiltinService(s)))
    return { yggdrasilServices }
  }

  private async save() {
    const data = YggdrasilSchema.parse({ yggdrasilServices: this.yggdrasilServices })
    await writeJson(this.yggdrasilJsonPath, data, { spaces: 2 })
  }

  async load() {
    let apis: YggdrasilSchema
    let persisted = true
    try {
      apis = YggdrasilSchema.parse(await readJson(this.yggdrasilJsonPath))
    } catch (e) {
      this.logger.warn('Failed to load Yggdrasil services. Falling back to defaults.', e)
      apis = await this.getDefaultYggdrasilServices()
      persisted = false
    }

    // A built-in cached from a launch that could not reach the network sits
    // there as a bare `{ url }` forever, so re-fetch any whose metadata is
    // still incomplete. Services the user deleted stay deleted -- only entries
    // that are actually present get repaired.
    for (const builtin of BUILTIN_SERVICES) {
      const host = new URL(builtin.fallback.url).host
      const existed = apis.yggdrasilServices.find(a => new URL(a.url).host === host)
      if (!existed) continue
      if (existed.authlibInjector && (!builtin.ocid || existed.ocidConfig)) continue
      apis.yggdrasilServices.splice(apis.yggdrasilServices.indexOf(existed), 1)
      apis.yggdrasilServices.push(await this.loadBuiltinService(builtin))
    }

    this.yggdrasilServices.push(...apis.yggdrasilServices)

    if (!persisted) {
      // Cache the resolved defaults. Without this the built-in services were
      // re-fetched on every single launch and vanished entirely whenever that
      // fetch failed.
      await this.save().catch((e) => {
        this.logger.warn('Failed to persist the default Yggdrasil services.', e)
      })
    }
  }

  getYggdrasilServices(): YggdrasilApi[] {
    return this.yggdrasilServices
  }

  getClientId(authServer: string) {
    const host = new URL(authServer).host
    return BUILTIN_CLIENT[host]
  }

  async addYggdrasilService(url: string): Promise<void> {
    if (url.startsWith('authlib-injector:')) url = url.substring('authlib-injector:'.length)
    if (url.startsWith('yggdrasil-server:')) url = url.substring('yggdrasil-server:'.length)
    url = decodeURIComponent(url)
    const parsed = new URL(url)
    const domain = parsed.host

    this.logger.log(`Add ${url} as yggdrasil (authlib-injector) api service ${domain}`)

    const api = await loadYggdrasilApiProfile(url)
    // check dup
    const existed = this.yggdrasilServices.find(a => new URL(a.url).host === new URL(url).host)
    if (existed) {
      if (existed.authlibInjector && !api.authlibInjector) {
        return
      }
      if (!existed.authlibInjector && api.authlibInjector) {
        this.yggdrasilServices = this.yggdrasilServices.filter(a => new URL(a.url).host !== new URL(url).host)
      }
    }

    this.yggdrasilServices.push(api)
    await this.save()
  }

  async removeYggdrasilService(url: string): Promise<void> {
    this.yggdrasilServices = this.yggdrasilServices.filter(a => a.url !== url)
    await this.save()
  }
}
