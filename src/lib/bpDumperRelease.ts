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

export type BpDumperVirusTotalReport = {
  permalink: string
  sha256: string
  gateMode: string
  gatedAt: string | null
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

async function fetchVirusTotalReport(
  downloadUrlFor: (filename: string) => string
): Promise<BpDumperVirusTotalReport | null> {
  try {
    const res = await fetch(downloadUrlFor('VIRUSTOTAL.json'), {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>
    const permalink = typeof data.permalink === 'string' ? data.permalink.trim() : ''
    if (!permalink.startsWith('https://www.virustotal.com/')) return null
    const statsRaw = data.stats && typeof data.stats === 'object' ? (data.stats as Record<string, unknown>) : {}
    return {
      permalink,
      sha256: typeof data.sha256 === 'string' ? data.sha256 : '',
      gateMode: typeof data.gateMode === 'string' ? data.gateMode : 'named',
      gatedAt: typeof data.gatedAt === 'string' ? data.gatedAt : null,
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
  } catch {
    return null
  }
}

async function fetchVirusTotalPermalink(downloadUrlFor: (filename: string) => string): Promise<string | null> {
  try {
    const res = await fetch(downloadUrlFor('VIRUSTOTAL.txt'), {
      headers: { Accept: 'text/plain' },
    })
    if (!res.ok) return null
    const text = await res.text()
    const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('https://www.virustotal.com/'))
    return line ?? null
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
  const response = await fetch(GITHUB_RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status}`)
  }

  const releases = (await response.json()) as GitHubRelease[]
  const release = pickReleaseWithAssets(releases)
  if (!release) {
    return buildFallbackReleaseInfo()
  }

  const assetUrls = new Map(release.assets.map((asset) => [asset.name, asset.browser_download_url]))
  const primaryAsset = pickPrimaryWindowsAsset(release)
  const version = stripVersionPrefix(release.tag_name)
  const primaryDownload = primaryAsset
    ? { name: primaryAsset.name, url: primaryAsset.browser_download_url }
    : bundledPrimaryDownload(version)

  const downloadUrlFor = (filename: string) =>
    assetUrls.get(filename) ?? releaseDownloadUrl(release.tag_name, filename)
  const virusTotalReport = await fetchVirusTotalReport(downloadUrlFor)
  const virusTotalUrl =
    virusTotalReport?.permalink ?? (await fetchVirusTotalPermalink(downloadUrlFor))

  return {
    version,
    tag: release.tag_name,
    htmlUrl: GITHUB_RELEASES_PAGE,
    primaryDownload,
    virusTotalUrl,
    virusTotalReport,
    downloadUrlFor,
  }
}
