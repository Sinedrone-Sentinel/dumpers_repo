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

/** CIG hotfix manifests now put engine builds in Version (e.g. 1.0.191.55227). */
function isEngineInternalVersion(raw) {
  return typeof raw === 'string' && /^1\.\d+/.test(raw.trim())
}

function versionFromScBranch(branch) {
  if (typeof branch !== 'string' || !branch.trim()) return null
  const sc = branch.match(/sc-alpha-(\d+)\.(\d+)/i)
  if (sc) return `${sc[1]}.${sc[2]}.x`
  const match = branch.match(/(\d+)\.(\d+)/)
  if (match && Number(match[1]) >= 3) return `${match[1]}.${match[2]}.x`
  return null
}

/**
 * Format manifest version as major.minor.x (e.g. 4.8.183.37006 -> 4.8.x).
 * Prefer the sc-alpha branch when Version is the 1.0 engine build.
 */
export function formatGameBuildVersion(manifestData) {
  const fromBranch = versionFromScBranch(manifestData?.Branch)
  if (fromBranch) return fromBranch

  const raw = manifestData?.Version
  if (typeof raw === 'string' && raw && raw !== 'None' && !isEngineInternalVersion(raw)) {
    const [major, minor] = raw.split('.')
    if (major && minor) return `${major}.${minor}.x`
  }

  return null
}

/** major.minor.x from a launcher label like 4.10.3-live.13165946 */
export function versionFloorFromLauncherLabel(label) {
  if (typeof label !== 'string' || !label.trim()) return null
  const m = label.trim().match(/^(\d+)\.(\d+)\.\d+-(?:live|ptu|eptu|hotfix)\.\d+$/i)
  if (!m) return null
  return `${m[1]}.${m[2]}.x`
}

/**
 * Default RSI Launcher log path (%APPDATA%\rsilauncher\logs\log.log).
 */
export function defaultRsiLauncherLogPath() {
  const appData = process.env.APPDATA
  if (!appData) return null
  return join(appData, 'rsilauncher', 'logs', 'log.log')
}

/**
 * ALWAYS pull the public install label from the RSI Launcher log.
 * This is what the launcher UI shows (e.g. "4.10.3-live.13165946").
 * Never invent the patch digit from build_manifest Data.Version / Branch.
 */
export function readRsiLauncherVersionLabel(options = {}) {
  const channel = String(options.channel || 'live').toLowerCase()
  const channelToken = channel.toUpperCase()
  const logPath = options.logPath || defaultRsiLauncherLogPath()
  if (!logPath || !existsSync(logPath)) return null

  let text
  try {
    text = readFileSync(logPath, 'utf8')
  } catch {
    return null
  }

  // Installing Star Citizen LIVE 4.10.3-live.13165946 at ...
  // Delta update completed (SC LIVE 4.10.3-live.13165946) in ...
  const re = new RegExp(
    String.raw`\b${channelToken}\s+(\d+\.\d+\.\d+-${channel}\.\d+)\b`,
    'gi',
  )
  let last = null
  for (const m of text.matchAll(re)) {
    last = m[1]
  }
  return last
}

function looksLikeLauncherLabel(raw) {
  return (
    typeof raw === 'string' &&
    /^\d+\.\d+\.\d+-(?:live|ptu|eptu|hotfix)\.\d+$/i.test(raw.trim())
  )
}

/**
 * Last-resort label from build_manifest only when the launcher log is missing.
 * Uses Branch (sc-alpha-X.Y.Z) + P4 — never invents a patch from Data.Version
 * (CIG Version like 4.10.200.58746 is NOT the public 4.10.3).
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
 * Resolve launcherVersion: RSI Launcher log first, then baked label, then
 * weak build_manifest fallback.
 */
export function resolveLauncherVersionLabel(options = {}) {
  const channel = options.channel || 'live'
  const fromLauncher = readRsiLauncherVersionLabel({
    channel,
    logPath: options.logPath,
  })
  if (fromLauncher) return fromLauncher

  if (looksLikeLauncherLabel(options.fallbackLabel)) {
    return options.fallbackLabel.trim()
  }

  if (options.manifestData) {
    return formatLauncherVersionLabel(options.manifestData, { channel })
  }

  return null
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
    const launcherVersion = resolveLauncherVersionLabel({
      channel,
      logPath: options.logPath,
      fallbackLabel: buildFile.launcherVersion,
      manifestData: {
        Branch: buildFile.branch,
        RequestedP4ChangeNum: buildFile.p4Change,
        Version: buildFile.internalVersion,
      },
    })

    let version = versionFloorFromLauncherLabel(launcherVersion)
    if (
      !version &&
      typeof buildFile.version === 'string' &&
      /^\d+\.\d+\.x$/.test(buildFile.version) &&
      !isEngineInternalVersion(buildFile.version)
    ) {
      version = buildFile.version
    }
    if (!version) {
      version = formatGameBuildVersion({
        Version: buildFile.internalVersion ?? buildFile.version,
        Branch: buildFile.branch,
      })
    }

    if (version || launcherVersion) {
      return { version, launcherVersion }
    }
  }

  const manifestPath = join(defaultScLivePath, 'build_manifest.id')
  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath)
    const data = manifest?.Data
    const launcherVersion = resolveLauncherVersionLabel({
      channel,
      logPath: options.logPath,
      manifestData: data,
    })
    const version =
      versionFloorFromLauncherLabel(launcherVersion) || formatGameBuildVersion(data)
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
