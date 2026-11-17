import {
  STARORG_STRINGS_PRODUCT_NAME,
  STARORG_STRINGS_RELEASES_API,
  STARORG_STRINGS_RELEASES_PAGE,
} from '../config/dumperApps'

export type StarOrgStringsAsset = {
  id: string
  name: string
  label: string
  description: string
  url: string
  sizeBytes: number
  sizeLabel: string
  recommended: boolean
  kind: 'windows' | 'linux' | 'meta' | 'other'
  rank: number
}

export type StarOrgStringsRelease = {
  version: string
  tagName: string
  publishedAt: string | null
  htmlUrl: string
  assets: StarOrgStringsAsset[]
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Skip signatures, checksums, notices, and machine manifests — members only need installers. */
function shouldSkipAsset(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.endsWith('.sig')) return true
  if (lower.endsWith('.md')) return true
  if (lower === 'sha256sums' || lower.startsWith('sha256sums')) return true
  if (lower.includes('checksum')) return true
  if (lower === 'latest.json') return true
  if (lower.includes('third_party')) return true
  if (/^source code/i.test(name)) return true
  return false
}

function classifyAsset(name: string): {
  label: string
  description: string
  kind: StarOrgStringsAsset['kind']
  recommended: boolean
  rank: number
} {
  const lower = name.toLowerCase()
  // Windows installers (setup.exe preferred)
  if (lower.endsWith('-setup.exe') || (lower.includes('setup') && lower.endsWith('.exe'))) {
    return {
      label: 'Windows installer (.exe)',
      description: 'Windows installer for StarOrg Codex.',
      kind: 'windows',
      recommended: false,
      rank: 10,
    }
  }
  if (lower.endsWith('.msi')) {
    return {
      label: 'Windows installer (.msi)',
      description: 'Windows MSI package for StarOrg Codex.',
      kind: 'windows',
      recommended: false,
      rank: 11,
    }
  }
  if (lower.includes('windows') && lower.endsWith('.zip')) {
    return {
      label: 'Windows (zip)',
      description: 'Portable Windows zip — CLI / alternate to the installer.',
      kind: 'windows',
      recommended: false,
      rank: 12,
    }
  }
  if (lower.endsWith('.appimage')) {
    return {
      label: 'Linux AppImage',
      description: 'Portable Linux desktop app.',
      kind: 'linux',
      recommended: false,
      rank: 20,
    }
  }
  if (lower.endsWith('.deb')) {
    return {
      label: 'Linux .deb',
      description: 'Debian / Ubuntu package.',
      kind: 'linux',
      recommended: false,
      rank: 21,
    }
  }
  if (lower.endsWith('.rpm')) {
    return {
      label: 'Linux .rpm',
      description: 'Fedora / RHEL package.',
      kind: 'linux',
      recommended: false,
      rank: 22,
    }
  }
  if (lower.includes('linux') && (lower.endsWith('.tar.gz') || lower.endsWith('.tgz'))) {
    return {
      label: 'Linux CLI (tar.gz)',
      description: 'Command-line starorg-strings tarball.',
      kind: 'linux',
      recommended: false,
      rank: 23,
    }
  }
  return {
    label: name,
    description: 'Release asset.',
    kind: 'other',
    recommended: false,
    rank: 50,
  }
}

type GhAsset = {
  id?: number
  name?: string
  browser_download_url?: string
  size?: number
}

type GhRelease = {
  tag_name?: string
  html_url?: string
  published_at?: string
  assets?: GhAsset[]
}

export async function fetchStarOrgStringsRelease(): Promise<StarOrgStringsRelease> {
  const res = await fetch(STARORG_STRINGS_RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub release fetch failed (${res.status})`)
  const data = (await res.json()) as GhRelease
  const tagName = String(data.tag_name || '').trim() || 'latest'
  const version = tagName.replace(/^v/i, '')
  const assets: StarOrgStringsAsset[] = []
  for (const asset of data.assets || []) {
    const name = String(asset.name || '').trim()
    const url = String(asset.browser_download_url || '').trim()
    if (!name || !url) continue
    if (shouldSkipAsset(name)) continue
    const info = classifyAsset(name)
    const sizeBytes = Number(asset.size) || 0
    assets.push({
      id: String(asset.id ?? name),
      name,
      label: info.label,
      description: info.description,
      url,
      sizeBytes,
      sizeLabel: formatBytes(sizeBytes),
      recommended: info.recommended,
      kind: info.kind,
      rank: info.rank,
    })
  }
  assets.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))

  return {
    version,
    tagName,
    publishedAt: data.published_at ?? null,
    htmlUrl: data.html_url || STARORG_STRINGS_RELEASES_PAGE,
    assets,
  }
}

export function starOrgFallbackCopy(): string {
  return `${STARORG_STRINGS_PRODUCT_NAME} downloads load from the latest GitHub release.`
}
