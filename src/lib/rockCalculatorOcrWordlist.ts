import gameMining from '../data/game-mining.json'

const HUD_LABELS = [
  'RESULTS',
  'MASS',
  'RES',
  'RESISTANCE',
  'INST',
  'INSTABILITY',
  'COMP',
  'COMPOSITION',
  'SCU',
  'ORE',
  'RAW',
  'INERT',
  'MATERIALS',
  'DISTANCE',
  'SCANNING',
  'UNKNOWN',
] as const

function elementTokenFromRecordName(recordName: string): string | null {
  const match = recordName.match(/MineableElement\.([A-Za-z]+)_/)
  return match?.[1]?.toUpperCase() ?? null
}

function uniqueSorted(tokens: Iterable<string>): string[] {
  return [...new Set(tokens)].sort((a, b) => a.localeCompare(b))
}

/** Ore / element tokens from game data — useful for post-OCR hints and future dictionary work. */
export function buildRockOcrWordlist(): string[] {
  const elements = gameMining.mineableElements
    .map((entry) => elementTokenFromRecordName(entry.recordName))
    .filter((token): token is string => Boolean(token))

  return uniqueSorted([...HUD_LABELS, ...elements])
}

export const ROCK_OCR_CHAR_WHITELIST =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%().:+- '

export const ROCK_OCR_WORDLIST = buildRockOcrWordlist()
