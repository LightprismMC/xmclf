/* eslint-disable no-template-curly-in-string */
import { config as dotenv } from 'dotenv'
import type { Configuration } from 'electron-builder'

dotenv()

export const config = {
  productName: 'XMCLF',
  appId: 'xmclf',
  directories: {
    output: 'build/output',
    buildResources: 'build',
    app: '.',
  },
  protocols: {
    name: 'XMCLF',
    // `xmclf` is this launcher's own scheme; `xmcl` is kept so links that
    // already exist in the wild still open it. See LAUNCHER_PROTOCOL /
    // INTERNAL_PROTOCOL in xmcl-runtime/constant.ts.
    schemes: ['xmclf', 'xmcl'],
  },
  // No `publish` target: auto-update is disabled for this fork. Pointing it at
  // upstream's repo would make XMCLF update itself into X Minecraft Launcher.
  // To turn updates back on, set this to your own repo and re-enable
  // pluginAutoUpdate in xmcl-electron-app/main/definedPlugins.ts.
  publish: null,
  files: [{
    from: 'dist',
    to: '.',
    filter: ['**/*.js', '**/*.ico', '**/*.png', '**/*.webp', '**/*.svg', '*.node', '*.dll', '**/*.html', '**/*.css', '**/*.woff2', '**/*.wasm'],
  }, {
    from: '.',
    to: '.',
    filter: 'package.json',
  }],
  extraResources: [{
    from: 'main/agent-documents',
    to: 'agent-documents',
    filter: ['**/*.md'],
  }],
  artifactName: 'xmclf-${version}-${platform}-${arch}.${ext}',
  appx: {
    displayName: 'XMCLF',
    applicationId: 'xmclf',
    identityName: 'xmclf',
    backgroundColor: 'transparent',
    publisher: process.env.PUBLISHER,
    publisherDisplayName: 'XMCLF',
    setBuildNumber: true,
  },
  dmg: {
    artifactName: 'xmclf-${version}-${arch}.${ext}',
    contents: [
      {
        x: 410,
        y: 150,
        type: 'link',
        path: '/Applications',
      },
      {
        x: 130,
        y: 150,
        type: 'file',
      },
    ],
  },
  mac: {
    icon: 'icons/dark.icns',
    darkModeSupport: true,
    target: [
      {
        target: 'dmg',
        arch: ['arm64', 'x64'],
      },
    ],
    extendInfo: {
      NSMicrophoneUsageDescription: 'A Minecraft mod wants to access your microphone.',
      NSCameraUsageDescription: 'Please give us access to your camera',
      'com.apple.security.device.audio-input': true,
      'com.apple.security.device.camera': true,
    },
  },
  win: {
    certificateFile: undefined as string | undefined,
    publisherName: 'XMCLF',
    icon: 'icons/dark.ico',
    electronLanguages: ['en-US'],
    target: [
      {
        target: 'zip',
        arch: [
          'x64',
          'ia32',
        ],
      },
      'appx',
    ],
  },
  linux: {
    executableName: 'xmclf',
    electronLanguages: ['en-US'],
    desktop: {
      MimeType: 'x-scheme-handler/xmclf;x-scheme-handler/xmcl',
      StartupWMClass: 'xmclf',
    },
    category: 'Game',
    icon: 'icons/dark.icns',
    artifactName: 'xmclf-${version}-${arch}.${ext}',
    target: [
      { target: 'deb', arch: ['x64', 'arm64'] },
      { target: 'rpm', arch: ['x64', 'arm64'] },
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'tar.xz', arch: ['x64', 'arm64'] },
      { target: 'pacman', arch: ['x64', 'arm64'] },
    ],
  },
} satisfies Configuration
