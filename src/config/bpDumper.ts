import dumperVersionData from '../data/bp-dumper-version.json'

export const GITHUB_RELEASES_PAGE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases' as const

export const GITHUB_LATEST_DOWNLOAD_BASE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download' as const

export const BP_DUMPER_VERSION = dumperVersionData.version

/** Windows Inno Setup asset name for the current bundled dumper version. */
export function getDumperAppsInstallerFilename(version: string = BP_DUMPER_VERSION): string {
  return `DumperApps-Setup-${version}.exe`
}

/** Member-facing name for desktop tools (log watcher, rock-scan tray, downloads). */
export const DUMPER_APPS_DISPLAY_NAME = 'Dumper Apps' as const

export const BP_DUMPER_CALLOUT_DISMISS_KEY = 'dr_bp_dumper_callout_dismissed_v1' as const

export type BpDumperDownloadOption = {
  id: string
  label: string
  description: string
  filename: string
}

export const BP_DUMPER_DOWNLOADS: BpDumperDownloadOption[] = [
  {
    id: 'windows-installer',
    label: 'Windows (recommended)',
    description: 'Installer — next, next, paste API key, play',
    filename: getDumperAppsInstallerFilename(),
  },
  {
    id: 'windows-portable',
    label: 'Windows (portable zip)',
    description: 'No installer — unzip and run START-HERE.bat',
    filename: 'bp-dumper-py.zip',
  },
  {
    id: 'windows',
    label: 'Windows (blueprints only)',
    description: 'Log watcher only — no Rock Calculator OCR',
    filename: 'bp-dumper-windows.exe',
  },
  {
    id: 'mac-intel',
    label: 'macOS (Intel)',
    description: 'x64 binary',
    filename: 'bp-dumper-mac-intel',
  },
  {
    id: 'mac-silicon',
    label: 'macOS (Apple Silicon)',
    description: 'arm64 binary',
    filename: 'bp-dumper-mac-silicon',
  },
  {
    id: 'linux',
    label: 'Linux',
    description: 'x64 binary',
    filename: 'bp-dumper-linux',
  },
  {
    id: 'python',
    label: 'Python zip (all platforms)',
    description: 'Same kit as Windows recommended — macOS/Linux get log watcher only',
    filename: 'bp-dumper-py.zip',
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
