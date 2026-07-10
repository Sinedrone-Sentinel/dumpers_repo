import dumperVersionData from '../data/bp-dumper-version.json'

export const GITHUB_RELEASES_PAGE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases' as const

export const GITHUB_LATEST_DOWNLOAD_BASE =
  'https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download' as const

export const BP_DUMPER_VERSION = dumperVersionData.version

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
    id: 'windows',
    label: 'Windows',
    description: '64-bit executable',
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
    label: 'Python script',
    description: 'Cross-platform zip',
    filename: 'bp-dumper-py.zip',
  },
]

export function getBpDumperDownloadUrl(filename: string): string {
  return `${GITHUB_LATEST_DOWNLOAD_BASE}/${filename}`
}
