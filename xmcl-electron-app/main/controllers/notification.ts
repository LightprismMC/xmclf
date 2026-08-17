import { ElectronController } from '@/ElectronController'
import { LAUNCHER_DISPLAY_NAME } from '@xmcl/runtime/constant'
import { app } from 'electron'
import { ControllerPlugin } from './plugin'

export const notificationSetupPlugin: ControllerPlugin = function (this: ElectronController) {
  this.app.waitEngineReady().then(() => {
    if (this.app.platform.os === 'windows') {
      app.setAppUserModelId(LAUNCHER_DISPLAY_NAME)
    }
  })
}
