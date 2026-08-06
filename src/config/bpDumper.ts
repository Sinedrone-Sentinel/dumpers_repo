import dumperVersionData from '../data/bp-dumper-version.json'

export const GITHUB_RELEASES_PAGE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases' as const

export const GITHUB_LATEST_DOWNLOAD_BASE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download' as const

/** Python watcher sources for macOS / Linux / manual Windows runs. */
export const BP_DUMPER_SCRIPTS_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/tree/main/scripts/bp-dumper-py' as const

/** Microsoft Store product identity (Partner Center). */
export const BP_DUMPER_STORE_ID = '9PMR8CPSB04K' as const

/** Browser-friendly Store listing (opens Store app on Windows when available). */
export const BP_DUMPER_STORE_WEB_URL =
  `https://apps.microsoft.com/detail/${BP_DUMPER_STORE_ID}` as const

/** Deep link that opens the Store client directly on Windows. */
export const BP_DUMPER_STORE_PROTOCOL_URL =
  `ms-windows-store://pdp/?productid=${BP_DUMPER_STORE_ID}` as const

export const BP_DUMPER_VERSION = dumperVersionData.version

/**
 * Windows exe filename used by packaging / release tooling (MSIX payload, CI).
 * Not offered as a member download — Windows members install from the Microsoft Store.
 */
export const DUMPER_APPS_EXE_FILENAME = 'DumperApps.exe' as const

/** Packaging asset name for the current bundled dumper version. */
export function getDumperAppsPortableFilename(_version: string = BP_DUMPER_VERSION): string {
  return DUMPER_APPS_EXE_FILENAME
}

/** @deprecated Use getDumperAppsPortableFilename — kept for older release tooling. */
export function getDumperAppsInstallerFilename(version: string = BP_DUMPER_VERSION): string {
  return getDumperAppsPortableFilename(version)
}

/** Member-facing name for desktop tools (blueprint log watcher + Live Mission Tracker). */
export const DUMPER_APPS_DISPLAY_NAME = 'Dumper Apps' as const

export const BP_DUMPER_CALLOUT_DISMISS_KEY = 'dr_bp_dumper_callout_dismissed_v1' as const

export type BpDumperDownloadOption = {
  id: string
  label: string
  description: string
  url: string
  kind: 'external'
}

/** Member-facing install options — Store (Windows) + scripts (macOS / Linux). */
export const BP_DUMPER_DOWNLOADS: BpDumperDownloadOption[] = [
  {
    id: 'windows-store',
    kind: 'external',
    label: 'Microsoft Store (Windows)',
    description:
      'Install from the Microsoft Store. You choose your Star Citizen LIVE folder (no drive scan). Updates come through the Store; paste your API key on first run.',
    url: BP_DUMPER_STORE_WEB_URL,
  },
  {
    id: 'python-scripts',
    kind: 'external',
    label: 'Python scripts (macOS / Linux)',
    description:
      'Run the watcher with your own Python 3 install — open the scripts folder on GitHub, install requirements, then run dumper.py (see README there).',
    url: BP_DUMPER_SCRIPTS_URL,
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
