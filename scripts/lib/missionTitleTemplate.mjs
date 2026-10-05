/**
 * Fill CIG `~mission(Token)` blanks in contract titles.
 *
 * Blanks the contract fixes (rank, cargo grade) take the localized value from
 * its mission properties. Blanks the game picks per spawn (location, ship,
 * target) become a bracketed stand-in, e.g. "Keep [Location] Safe".
 */

const TOKEN_RE = /~mission\s*\(([^)]*)\)/gi

/** Per-spawn (or unresolved) token → bracket label. Keys are lowercase. */
export const MISSION_TOKEN_STAND_INS = {
  location: 'Location',
  'location|address': 'Location',
  defendlocationwrapperlocation: 'Location',
  ship: 'Ship',
  targetname: 'Target',
  'targetname|last': 'Target',
  objects: 'Objects',
  danger: 'Danger',
  reputationrank: 'Rank',
  cargogradetoken: 'Grade',
}

function humanizeToken(inner) {
  const last = String(inner).split('|').pop() ?? ''
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words) return 'Value'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function missionTokenStandIn(inner) {
  const key = String(inner).trim().toLowerCase()
  const label = MISSION_TOKEN_STAND_INS[key] ?? MISSION_TOKEN_STAND_INS[key.split('|')[0]]
  return `[${label ?? humanizeToken(inner)}]`
}

/**
 * True when the whole title is one token with no stand-in, such as
 * `~mission(Contractor|RecoverItemTitle)` — the organization supplies the title.
 */
export function isWholeTitleToken(title) {
  const match = String(title || '').trim().match(/^~mission\s*\(([^)]*)\)$/i)
  if (!match) return false
  const key = match[1].trim().toLowerCase()
  return !(key in MISSION_TOKEN_STAND_INS) && !(key.split('|')[0] in MISSION_TOKEN_STAND_INS)
}

/**
 * @param {string} title raw localized title
 * @param {{ tokenValues?: Map<string, string> | Record<string, string> }} [options]
 *   token name (case-insensitive) → resolved text for blanks fixed by the contract
 * @returns {string | null} null when the title has no blanks to fill or is a whole-title token
 */
export function fillMissionTitleTemplate(title, options = {}) {
  if (!title || !title.includes('~mission') || isWholeTitleToken(title)) return null
  const values = new Map()
  const source = options.tokenValues
  if (source) {
    const entries = source instanceof Map ? source.entries() : Object.entries(source)
    for (const [k, v] of entries) {
      if (v) values.set(String(k).trim().toLowerCase(), String(v).trim())
    }
  }
  const filled = title.replace(TOKEN_RE, (_whole, inner) => {
    const key = String(inner).trim().toLowerCase()
    return values.get(key) || values.get(key.split('|')[0]) || missionTokenStandIn(inner)
  })
  return filled.replace(/\s+/g, ' ').trim()
}
