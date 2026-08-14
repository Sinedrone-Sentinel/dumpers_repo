import dumperVersionData from '../data/bp-dumper-version.json'

export const GITHUB_RELEASES_PAGE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases' as const

export const GITHUB_LATEST_DOWNLOAD_BASE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download' as const

/** Release asset: full Python watcher folder including lookup.json. */
export const DUMPER_PYTHON_SCRIPTS_ZIP = 'BPDumper-python-scripts.zip' as const

/** Direct download of the Python scripts zip (preferred for members). */
export const BP_DUMPER_SCRIPTS_URL =
  `${GITHUB_LATEST_DOWNLOAD_BASE}/${DUMPER_PYTHON_SCRIPTS_ZIP}` as const

/** Source tree (devs only — lookup.json is gitignored and not on GitHub). */
export const BP_DUMPER_SCRIPTS_SOURCE_URL =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/tree/main/scripts/bp-dumper-py' as const

export const BP_DUMPER_VERSION = dumperVersionData.version

/** Windows exe built from scripts/bp-dumper-go via scripts/installer/build-exe.ps1 */
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
 * Primary: native Go Windows exe (auto-detects Star Citizen install; path override OK).
 */
export const BP_DUMPER_DOWNLOADS: BpDumperDownloadOption[] = [
  {
    id: 'windows-exe',
    kind: 'external',
    label: 'Windows exe (DumperApps.exe)',
    description:
      'Native Windows build — searches your drives for Star Citizen / LIVE (or paste a path), then asks for your API key.',
    url: `${GITHUB_LATEST_DOWNLOAD_BASE}/${DUMPER_APPS_EXE_FILENAME}`,
  },
  {
    id: 'python-scripts',
    kind: 'external',
    label: 'Python scripts zip (macOS / Linux / advanced)',
    description:
      'Requires Python 3.8+ from python.org first. Then download BPDumper-python-scripts.zip (includes lookup.json), create a venv, install requirements, run dumper.py.',
    url: BP_DUMPER_SCRIPTS_URL,
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
