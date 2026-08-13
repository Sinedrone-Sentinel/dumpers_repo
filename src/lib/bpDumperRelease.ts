import {
  BP_DUMPER_DOWNLOADS,
  BP_DUMPER_VERSION,
  GITHUB_RELEASES_PAGE,
  getBpDumperDownloadUrl,
  getDumperAppsPortableFilename,
  type BpDumperDownloadOption,
} from '../config/bpDumper'

export { BP_DUMPER_DOWNLOADS }
export type { BpDumperDownloadOption }

const GITHUB_RELEASES_API =
  'https://api.github.com/repos/Sinedrone-Sentinel/dumpers_repo/releases?per_page=10'

type GitHubReleaseAsset = {
  name: string
  browser_download_url: string
}

type GitHubRelease = {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: GitHubReleaseAsset[]
}

/** Same-origin copy written by scripts/sync-dumper-virustotal.mjs (GitHub release assets block browser CORS). */
export const SITE_VIRUSTOTAL_JSON_PATH = '/dumper-apps/VIRUSTOTAL.json' as const

export type BpDumperVirusTotalReport = {
  permalink: string
  sha256: string
  gateMode: string
  gatedAt: string | null
  /** Present when served from the site copy (synced from the publish gate). */
  version: string | null
  stats: {
    malicious: number
    suspicious: number
    undetected: number
    harmless: number
  }
  namedMaliciousEngines: string[]
  genericMaliciousEngines: string[]
  suspiciousEngines: string[]
}

export type BpDumperReleaseInfo = {
  version: string
  tag: string
  htmlUrl: string
  /** Best Windows download for the resolved release (from GitHub assets when available). */
  primaryDownload: { name: string; url: string }
  /** VirusTotal GUI report for this release's exe when CI published VIRUSTOTAL.txt / .json. */
  virusTotalUrl: string | null
  /** Parsed CI gate report when VIRUSTOTAL.json is on the release. */
  virusTotalReport: BpDumperVirusTotalReport | null
  downloadUrlFor: (filename: string) => string
}

function stripVersionPrefix(tag: string): string {
  return tag.replace(/^v/i, '')
}

function releaseDownloadUrl(tag: string, filename: string): string {
  return `https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/download/${tag}/${filename}`
}

function pickReleaseWithAssets(releases: GitHubRelease[]): GitHubRelease | null {
  for (const release of releases) {
    if (release.draft || release.prerelease) continue
    if (release.assets?.length > 0) return release
  }
  return null
}

function pickPrimaryWindowsAsset(release: GitHubRelease): GitHubReleaseAsset | null {
  const version = stripVersionPrefix(release.tag_name)
  const preferredNames = [
    'DumperApps.exe',
    `DumperApps-${version}.exe`,
    `DumperApps-Setup-${version}.exe`,
  ]
  for (const name of preferredNames) {
    const asset = release.assets.find((entry) => entry.name === name)
    if (asset) return asset
  }
  return (
    release.assets.find((entry) => /^DumperApps.*\.exe$/i.test(entry.name)) ??
    release.assets[0] ??
    null
  )
}

function bundledPrimaryDownload(version: string = BP_DUMPER_VERSION) {
  const name = getDumperAppsPortableFilename(version)
  return { name, url: getBpDumperDownloadUrl(name) }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function parseVirusTotalReport(data: Record<string, unknown>): BpDumperVirusTotalReport | null {
  const permalink = typeof data.permalink === 'string' ? data.permalink.trim() : ''
  if (!permalink.startsWith('https://www.virustotal.com/')) return null
  const statsRaw = data.stats && typeof data.stats === 'object' ? (data.stats as Record<string, unknown>) : {}
  const versionRaw = typeof data.version === 'string' ? data.version.trim() : ''
  return {
    permalink,
    sha256: typeof data.sha256 === 'string' ? data.sha256 : '',
    gateMode: typeof data.gateMode === 'string' ? data.gateMode : 'named',
    gatedAt: typeof data.gatedAt === 'string' ? data.gatedAt : null,
    version: versionRaw || null,
    stats: {
      malicious: Number(statsRaw.malicious || 0),
      suspicious: Number(statsRaw.suspicious || 0),
      undetected: Number(statsRaw.undetected || 0),
      harmless: Number(statsRaw.harmless || 0),
    },
    namedMaliciousEngines: asStringArray(data.namedMaliciousEngines),
    genericMaliciousEngines: asStringArray(data.genericMaliciousEngines),
    suspiciousEngines: asStringArray(data.suspiciousEngines),
  }
}

/** Prefer same-origin site copy — GitHub release downloads are blocked by CORS in browsers. */
async function fetchSiteVirusTotalReport(): Promise<BpDumperVirusTotalReport | null> {
  try {
    const res = await fetch(SITE_VIRUSTOTAL_JSON_PATH, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return parseVirusTotalReport((await res.json()) as Record<string, unknown>)
  } catch {
    return null
  }
}

export function buildFallbackReleaseInfo(): BpDumperReleaseInfo {
  const primaryDownload = bundledPrimaryDownload()
  return {
    version: BP_DUMPER_VERSION,
    tag: `v${BP_DUMPER_VERSION}`,
    htmlUrl: GITHUB_RELEASES_PAGE,
    primaryDownload,
    virusTotalUrl: null,
    virusTotalReport: null,
    downloadUrlFor: (filename) => getBpDumperDownloadUrl(filename),
  }
}

export async function fetchBpDumperRelease(): Promise<BpDumperReleaseInfo> {
  const virusTotalReport = await fetchSiteVirusTotalReport()

  try {
    const response = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      throw new Error(`GitHub releases API returned ${response.status}`)
    }

    const releases = (await response.json()) as GitHubRelease[]
    const release = pickReleaseWithAssets(releases)
    if (!release) {
      const fallback = buildFallbackReleaseInfo()
      return {
        ...fallback,
        version: virusTotalReport?.version ?? fallback.version,
        tag: virusTotalReport?.version ? `v${virusTotalReport.version}` : fallback.tag,
        virusTotalUrl: virusTotalReport?.permalink ?? null,
        virusTotalReport,
      }
    }

    const assetUrls = new Map(release.assets.map((asset) => [asset.name, asset.browser_download_url]))
    const primaryAsset = pickPrimaryWindowsAsset(release)
    const version = stripVersionPrefix(release.tag_name)
    const primaryDownload = primaryAsset
      ? { name: primaryAsset.name, url: primaryAsset.browser_download_url }
      : bundledPrimaryDownload(version)

    const downloadUrlFor = (filename: string) =>
      assetUrls.get(filename) ?? releaseDownloadUrl(release.tag_name, filename)

    return {
      version: virusTotalReport?.version ?? version,
      tag: release.tag_name,
      htmlUrl: GITHUB_RELEASES_PAGE,
      primaryDownload,
      virusTotalUrl: virusTotalReport?.permalink ?? null,
      virusTotalReport,
      downloadUrlFor,
    }
  } catch {
    const fallback = buildFallbackReleaseInfo()
    return {
      ...fallback,
      version: virusTotalReport?.version ?? fallback.version,
      tag: virusTotalReport?.version ? `v${virusTotalReport.version}` : fallback.tag,
      virusTotalUrl: virusTotalReport?.permalink ?? null,
      virusTotalReport,
    }
  }
}
