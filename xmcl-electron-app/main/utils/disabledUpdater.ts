import { ElectronUpdateOperation, ReleaseInfo } from '@xmcl/runtime-api'
import { LauncherAppUpdater } from '@xmcl/runtime/app'

/**
 * The updater XMCLF ships with: it never checks, downloads, or installs
 * anything.
 *
 * Upstream's {@link ElectronUpdater} resolves releases from
 * `github.com/voxelum/x-minecraft-launcher` and `api.xmcl.app`, so leaving it
 * wired up in a fork would quietly replace XMCLF with X Minecraft Launcher on
 * the next update. The whole implementation is still in `./utils/updater.ts`:
 * to bring updates back, point `publish` in build/electron-builder.config.ts at
 * your own repo, hand `ElectronUpdater` to `super()` in ElectronLauncherApp
 * again, and drop the early return in pluginAutoUpdate.
 */
export class DisabledUpdater implements LauncherAppUpdater {
  async checkUpdateTask(): Promise<ReleaseInfo> {
    return {
      name: '',
      body: '',
      date: new Date(0).toISOString(),
      files: [],
      newUpdate: false,
      operation: ElectronUpdateOperation.Manual,
    }
  }

  async downloadUpdate(): Promise<void> {
    throw new Error('Auto update is disabled in this build')
  }

  async installUpdateAndQuit(): Promise<void> {
    throw new Error('Auto update is disabled in this build')
  }
}
