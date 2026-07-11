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
  /** Groups cards in the Dumper Apps modal. */
  group: 'windows' | 'mac-linux' | 'advanced'
}

export const BP_DUMPER_DOWNLOADS: BpDumperDownloadOption[] = [
  {
    id: 'windows-installer',
    label: 'Windows installer',
    description: 'Recommended. Run the setup wizard, then open Dumper Apps from the Start Menu.',
    filename: getDumperAppsInstallerFilename(),
    group: 'windows',
  },
  {
    id: 'windows-portable',
    label: 'Windows portable zip',
    description: 'Same app as the installer — unzip the folder and double-click START-HERE.bat.',
    filename: 'bp-dumper-py.zip',
    group: 'windows',
  },
  {
    id: 'mac-intel',
    label: 'macOS (Intel)',
    description: 'Blueprint log sync only. Rock Calculator OCR is not available on Mac yet.',
    filename: 'bp-dumper-mac-intel',
    group: 'mac-linux',
  },
  {
    id: 'mac-silicon',
    label: 'macOS (Apple Silicon)',
    description: 'Blueprint log sync only. Rock Calculator OCR is not available on Mac yet.',
    filename: 'bp-dumper-mac-silicon',
    group: 'mac-linux',
  },
  {
    id: 'linux',
    label: 'Linux',
    description: 'Blueprint log sync only. Rock Calculator OCR is not available on Linux yet.',
    filename: 'bp-dumper-linux',
    group: 'mac-linux',
  },
  {
    id: 'windows',
    label: 'Windows .exe (blueprints only)',
    description: 'Smaller download. Syncs blueprint unlocks only — no Rock Calculator OCR.',
    filename: 'bp-dumper-windows.exe',
    group: 'advanced',
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
