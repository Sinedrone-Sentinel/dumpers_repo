import dumperVersionData from '../data/bp-dumper-version.json'

export const GITHUB_RELEASES_PAGE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases' as const

export const GITHUB_LATEST_DOWNLOAD_BASE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download' as const

export const BP_DUMPER_VERSION = dumperVersionData.version

/** Windows portable asset name for the current bundled dumper version. */
export function getDumperAppsPortableFilename(version: string = BP_DUMPER_VERSION): string {
  return `DumperApps-${version}.exe`
}

/** @deprecated Use getDumperAppsPortableFilename — kept for older release links. */
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
  filename: string
}

/** Windows portable exe — the only member-facing BP Dumper download. */
export const BP_DUMPER_DOWNLOADS: BpDumperDownloadOption[] = [
  {
    id: 'windows-portable',
    label: 'Windows portable exe',
    description:
      'Download and run DumperApps.exe — it extracts beside itself and starts blueprint sync + Live Mission Tracker. Python is bundled; no install wizard.',
    filename: getDumperAppsPortableFilename(),
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
