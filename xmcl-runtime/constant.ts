export const IS_DEV = process.env.NODE_ENV === 'development'
/**
 * Display name of the launcher, used wherever the product is named to the user
 * or to the OS (shortcuts, Steam entry, the name reported to the game).
 */
export const LAUNCHER_DISPLAY_NAME = 'XMCLF'
/**
 * Folder name under `%APPDATA%` / `~/.config` holding the launcher's own data.
 *
 * Deliberately distinct from upstream XMCL's `xmcl`, so both launchers can be
 * installed side by side without sharing a data directory or fighting over the
 * single-instance lock.
 */
export const LAUNCHER_NAME = 'xmclf'
/**
 * The url scheme this launcher registers with the OS for deep links.
 *
 * Note this is *not* the scheme the internal protocol handlers are keyed on --
 * those all use {@link INTERNAL_PROTOCOL}. Incoming deep links are rewritten to
 * that scheme by {@link LauncherProtocolHandler.handle}.
 */
export const LAUNCHER_PROTOCOL = 'xmclf'
/**
 * Scheme of the launcher's internal request bus. Every `registerHandler` call
 * and every relative-url base inside the runtime uses it, so it stays `xmcl`
 * rather than churning through the whole runtime for a name nothing displays.
 *
 * It is also still registered with the OS, so `xmcl://` links that already
 * exist out in the wild (modpack and authlib-injector links) keep working.
 */
export const INTERNAL_PROTOCOL = 'xmcl'
export const RESOURCE_FILE_VERSION = 2
export const HAS_DEV_SERVER = !!process.env.HAS_DEV_SERVER
