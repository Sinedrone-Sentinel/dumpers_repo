import dumperVersionData from '../data/bp-dumper-version.json'

export const GITHUB_RELEASES_PAGE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases' as const

export const GITHUB_LATEST_DOWNLOAD_BASE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download' as const

/** Python watcher sources for macOS / Linux / manual Windows runs. */
export const BP_DUMPER_SCRIPTS_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/tree/main/scripts/bp-dumper-py' as const

/** Microsoft Store product identity (Partner Center) — listing kept for now; not primary. */
export const BP_DUMPER_STORE_ID = '9PMR8CPSB04K' as const

export const BP_DUMPER_STORE_WEB_URL =
  `https://apps.microsoft.com/detail/${BP_DUMPER_STORE_ID}` as const

export const BP_DUMPER_STORE_PROTOCOL_URL =
  `ms-windows-store://pdp/?productid=${BP_DUMPER_STORE_ID}` as const

export const BP_DUMPER_VERSION = dumperVersionData.version

/** Windows exe built from scripts/bp-dumper-py via scripts/installer/build-exe.ps1 */
export const DUMPER_APPS_EXE_FILENAME = 'DumperApps.exe' as const

export function getDumperAppsPortableFilename(_version: string = BP_DUMPER_VERSION): string {
  return DUMPER_APPS_EXE_FILENAME
}

/** @deprecated Use getDumperAppsPortableFilename — kept for older release tooling. */
export function getDumperAppsInstallerFilename(version: string = BP_DUMPER_VERSION): string {
  return getDumperAppsPortableFilename(version)
}

export const DUMPER_APPS_DISPLAY_NAME = 'Dumper Apps' as const

export const BP_DUMPER_CALLOUT_DISMISS_KEY = 'dr_bp_dumper_callout_dismissed_v1' as const

export type BpDumperDownloadOption = {
  id: string
  label: string
  description: string
  url: string
  kind: 'external'
}

/**
 * Member-facing install options.
 * Primary: Python-built Windows exe (auto-detects Star Citizen install).
 * Store listing remains available until SignPath / OpenSSF trust path is solid.
 */
export const BP_DUMPER_DOWNLOADS: BpDumperDownloadOption[] = [
  {
    id: 'windows-exe',
    kind: 'external',
    label: 'Classic Windows exe (auto-detect)',
    description:
      'DumperApps.exe built from the original Python watcher — searches your drives for Star Citizen / LIVE, then asks for your API key. Use this if the Store build will not run.',
    url: `${GITHUB_LATEST_DOWNLOAD_BASE}/${DUMPER_APPS_EXE_FILENAME}`,
  },
  {
    id: 'python-scripts',
    kind: 'external',
    label: 'Python scripts (macOS / Linux / advanced)',
    description:
      'Same watcher as the classic exe — open the scripts folder on GitHub, install requirements, then run dumper.py (auto-detect works there too).',
    url: BP_DUMPER_SCRIPTS_URL,
  },
  {
    id: 'windows-store',
    kind: 'external',
    label: 'Microsoft Store (optional)',
    description:
      'Sandboxed Store build (pick LIVE folder). Prefer the classic Windows exe above if you want auto-detect or the Store app fails to start.',
    url: BP_DUMPER_STORE_WEB_URL,
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
