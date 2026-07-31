import gameBuildVersionData from '../data/game-build-version.json'

type GameBuildVersionFile = {
  version?: string
  launcherVersion?: string
}

/**
 * Star Citizen LIVE label for the header — matches the RSI launcher
 * (e.g. "4.9.0-live.12344265"). Falls back to major.minor if needed.
 */
export function getLiveGameVersionLabel(): string | null {
  const data = gameBuildVersionData as GameBuildVersionFile
  const launcher = data.launcherVersion?.trim()
  if (launcher) return launcher

  const raw = data.version?.trim()
  if (!raw) return null
  const match = raw.match(/^(\d+)\.(\d+)/)
  if (!match) return null
  return `${match[1]}.${match[2]}`
}
