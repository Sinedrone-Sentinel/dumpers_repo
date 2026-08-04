import dumperVersionData from '../data/bp-dumper-version.json'

export const GITHUB_RELEASES_PAGE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases' as const

export const GITHUB_LATEST_DOWNLOAD_BASE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download' as const

/** Python watcher sources for macOS / Linux / manual Windows runs. */
export const BP_DUMPER_SCRIPTS_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/tree/main/scripts/bp-dumper-py' as const

export const BP_DUMPER_VERSION = dumperVersionData.version

/** Stable Windows download filename — no version suffix so browsers overwrite on re-download. */
export const DUMPER_APPS_EXE_FILENAME = 'DumperApps.exe' as const

/** Windows portable asset name for the current bundled dumper version. */
export function getDumperAppsPortableFilename(_version: string = BP_DUMPER_VERSION): string {
  return DUMPER_APPS_EXE_FILENAME
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
  /** GitHub Release asset filename when type is release-asset */
  filename?: string
  /** Absolute URL when type is external (e.g. script folder) */
  url?: string
  kind: 'release-asset' | 'external'
}

/** Member-facing BP Dumper downloads (Windows exe + cross-platform scripts). */
export const BP_DUMPER_DOWNLOADS: BpDumperDownloadOption[] = [
  {
    id: 'windows-portable',
    kind: 'release-asset',
    label: 'Windows portable exe',
    description:
      'Download and run DumperApps.exe — double-click to start blueprint sync and Live Mission Tracker. Python is bundled; no install wizard or zip extractor.',
    filename: getDumperAppsPortableFilename(),
  },
  {
    id: 'python-scripts',
    kind: 'external',
    label: 'Python scripts (macOS / Linux / Windows)',
    description:
      'Run the watcher with your own Python 3 install — open the scripts folder on GitHub, install requirements, then run dumper.py (see README there).',
    url: BP_DUMPER_SCRIPTS_URL,
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
