<p align="center">
  <img alt="XMCLF" width="100" src="assets/branding/xmclf-logo.png">
</p>

<h1 align="center">XMCLF</h1>

<p align="center">X Minecraft Launcher Freedoom</p>

<p align="center">
  <a href="https://lightprismmc.github.io/xmclf/">Website</a> ·
  <a href="https://github.com/LightprismMC/xmclf/releases/latest">Download</a>
</p>

A fork of [X Minecraft Launcher](https://xmcl.app) 0.66.2 that ships offline
and [Ely.by](https://ely.by) accounts as ordinary, always-available login
options.

Everything else X Minecraft Launcher does — instance management, mod and
modpack installation from CurseForge and Modrinth, Java management, multiplayer
— is unchanged. See [README.upstream.md](README.upstream.md) for the full
feature list and the credits of everyone who built it.

## What is different from upstream

**Offline accounts are always offered.** Upstream hid the offline authority,
and every third-party Yggdrasil service, behind a check that returned false for
a list of locales unless you had already signed in with a Microsoft account or
turned on developer mode. XMCLF removes that check.

**Ely.by handles two-factor auth.** Yggdrasil has no field for a one-time code,
so services that support 2FA expect it appended to the password as
`<password>:<code>`. Upstream surfaced Ely.by's "account protected with two
factor auth" as a raw untranslated error with no way to continue. XMCLF
recognises it, asks for the code, and joins it to the password itself.

**Built-in auth services survive a bad network.** Ely.by and LittleSkin carry
baked-in metadata and their resolved profiles are cached to disk, so they no
longer vanish when the launcher cannot reach their API on startup.

**Auto update is off.** Upstream's updater resolves releases from
`voxelum/x-minecraft-launcher` and `api.xmcl.app`; left wired up, XMCLF would
have replaced itself with X Minecraft Launcher. See
[disabledUpdater.ts](xmcl-electron-app/main/utils/disabledUpdater.ts) for how to
point it at your own release feed instead.

**Separate identity.** The app is named XMCLF, keeps its data in
`%APPDATA%/xmclf` (`~/.config/xmclf` on Linux), and registers `xmclf://`. Both
launchers can be installed at once. `xmcl://` stays registered too, so links
that already exist in the wild still open XMCLF when upstream is not installed.

## Building

Requires Node 22.16+ and pnpm 11.

```bash
pnpm install
```

Run it in development — this needs two terminals, one for each half:

```bash
pnpm dev:renderer
```

```bash
pnpm dev:main
```

Produce an unpacked build in `xmcl-electron-app/build/output`:

```bash
pnpm build:renderer && pnpm build
```

Check types across every package, and run the unit tests:

```bash
pnpm check
```

```bash
pnpm test
```

`xmcl-electron-app/main/ozonePlatform.test.ts` fails on Windows — it asserts a
POSIX path — and does so on unmodified upstream too.

## Artwork

Every icon (`.ico`, `.icns`, tray, appx tiles) is generated from a single
source image:

```bash
node scripts/gen-icons.mjs
```

It reads `assets/branding/xmclf-logo.png` and writes
`xmcl-electron-app/icons`. The script has no dependencies. Replace the source
image and re-run it to rebrand again; a square image of at least 1024px will
give crisper store tiles than the current 256px source.

## Naming

Internal package names (`@xmcl/*`) and source folders (`xmcl-runtime`,
`xmcl-keystone-ui`, …) are deliberately unchanged. They are upstream library
names that nothing displays, and renaming them would make merging upstream
changes far harder for no visible benefit.

## License

MIT, inherited from X Minecraft Launcher. The upstream copyright notice in
[LICENSE](LICENSE) stays as it is — this fork adds to that work, it does not
replace it.
