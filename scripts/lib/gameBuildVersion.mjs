import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const DEFAULT_SC_LIVE_PATH =
  process.env.STAR_CITIZEN_LIVE_PATH ||
  'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE'

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Format manifest version as major.minor.x (e.g. 4.8.183.37006 -> 4.8.x).
 */
export function formatGameBuildVersion(manifestData) {
  const raw = manifestData?.Version
  if (typeof raw === 'string' && raw && raw !== 'None') {
    const [major, minor] = raw.split('.')
    if (major && minor) return `${major}.${minor}.x`
  }

  const branch = manifestData?.Branch
  if (typeof branch === 'string') {
    const match = branch.match(/(\d+)\.(\d+)/)
    if (match) return `${match[1]}.${match[2]}.x`
  }

  return null
}

/**
 * RSI launcher channel label, e.g. "4.9.0-live.12344265".
 * Built from branch semver + channel + RequestedP4ChangeNum.
 */
export function formatLauncherVersionLabel(manifestData, options = {}) {
  const channel = String(options.channel || 'live').toLowerCase()
  const p4 =
    manifestData?.RequestedP4ChangeNum ??
    manifestData?.p4Change ??
    null
  if (p4 == null || String(p4).trim() === '') return null

  let semver = null
  const branch = manifestData?.Branch ?? manifestData?.branch
  if (typeof branch === 'string') {
    const full = branch.match(/(\d+)\.(\d+)\.(\d+)/)
    if (full) {
      semver = `${full[1]}.${full[2]}.${full[3]}`
    } else {
      const majorMinor = branch.match(/(\d+)\.(\d+)/)
      if (majorMinor) semver = `${majorMinor[1]}.${majorMinor[2]}.0`
    }
  }

  if (!semver) {
    const version = formatGameBuildVersion(manifestData)
    if (version) {
      const [major, minor] = version.split('.')
      if (major && minor) semver = `${major}.${minor}.0`
    }
  }

  if (!semver) return null
  return `${semver}-${channel}.${String(p4).trim()}`
}

/**
 * Convert a game build version string to major.minor for the dumper recent-import
 * MIN_GAME_VERSION (e.g. 4.10.x -> 4.10). Does not apply to full history.
 */
export function toMinGameVersionSecret(version) {
  if (typeof version !== 'string' || !version.trim()) return null

  const trimmed = version.trim()
  const majorMinorMatch = trimmed.match(/^(\d+)\.(\d+)/)
  if (!majorMinorMatch) return null

  return `${majorMinorMatch[1]}.${majorMinorMatch[2]}`
}

/**
 * Read build metadata from extracted game-build.json or LIVE build_manifest.id.
 */
export function readGameBuildInfo(options = {}) {
  const extractedData = options.extractedData
  const defaultScLivePath = options.defaultScLivePath ?? DEFAULT_SC_LIVE_PATH
  const channel = options.channel || 'live'
  const gameBuildFile = join(extractedData, 'game-build.json')

  const buildFile = readJson(gameBuildFile)
  if (buildFile) {
    let version = null
    if (typeof buildFile.version === 'string' && /^\d+\.\d+\.x$/.test(buildFile.version)) {
      version = buildFile.version
    } else {
      version = formatGameBuildVersion({
        Version: buildFile.internalVersion ?? buildFile.version,
        Branch: buildFile.branch,
      })
    }

    let launcherVersion =
      typeof buildFile.launcherVersion === 'string' && buildFile.launcherVersion.trim()
        ? buildFile.launcherVersion.trim()
        : formatLauncherVersionLabel(
            {
              Branch: buildFile.branch,
              RequestedP4ChangeNum: buildFile.p4Change,
              Version: buildFile.internalVersion,
            },
            { channel }
          )

    if (version || launcherVersion) {
      return { version, launcherVersion }
    }
  }

  const manifestPath = join(defaultScLivePath, 'build_manifest.id')
  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath)
    const data = manifest?.Data
    const version = formatGameBuildVersion(data)
    const launcherVersion = formatLauncherVersionLabel(data, { channel })
    if (version || launcherVersion) {
      return { version, launcherVersion }
    }
  }

  return null
}

/**
 * Read the Star Citizen LIVE build version from extracted game-build.json
 * or directly from build_manifest.id in the game install folder.
 */
export function readGameBuildVersion(options = {}) {
  return readGameBuildInfo(options)?.version ?? null
}

/**
 * Read game build version from committed src/data (CI / no local extraction).
 */
export function readBundledGameBuildVersion(projectRoot) {
  const versionFile = join(projectRoot, 'src', 'data', 'game-build-version.json')
  const fromVersionFile = readJson(versionFile)
  if (typeof fromVersionFile?.version === 'string' && fromVersionFile.version) {
    return fromVersionFile.version
  }

  const blueprintsFile = join(projectRoot, 'src', 'data', 'game-blueprints.json')
  const blueprints = readJson(blueprintsFile)
  if (typeof blueprints?.version === 'string' && blueprints.version) {
    return blueprints.version
  }

  return null
}

/**
 * Best available game build version: extracted install data, then bundled app data.
 */
export function resolveGameBuildVersion(options = {}) {
  const extractedData = options.extractedData
  const projectRoot = options.projectRoot ?? (extractedData ? join(extractedData, '..') : process.cwd())
  return readGameBuildVersion(options) ?? readBundledGameBuildVersion(projectRoot)
}
