import {
  BP_DUMPER_DOWNLOADS,
  BP_DUMPER_VERSION,
  GITHUB_RELEASES_PAGE,
  getBpDumperDownloadUrl,
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

export type BpDumperReleaseInfo = {
  version: string
  tag: string
  htmlUrl: string
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

export function buildFallbackReleaseInfo(): BpDumperReleaseInfo {
  return {
    version: BP_DUMPER_VERSION,
    tag: `v${BP_DUMPER_VERSION}`,
    htmlUrl: GITHUB_RELEASES_PAGE,
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

  return {
    version: stripVersionPrefix(release.tag_name),
    tag: release.tag_name,
    htmlUrl: GITHUB_RELEASES_PAGE,
    downloadUrlFor: (filename) => assetUrls.get(filename) ?? releaseDownloadUrl(release.tag_name, filename),
  }
}
