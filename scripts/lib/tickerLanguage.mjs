/**
 * Plain-language rendering for What's New ticker items.
 *
 * Members must never see internal identifiers. Entity classes and localization
 * keys are resolved to display names, and any field we cannot phrase in plain
 * language is dropped rather than dumped as raw JSON.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const MAX_LIST_NAMES = 3
const MAX_STAT_FIELDS = 3

/** Tokens that must not be title-cased when falling back to humanizeToken(). */
const ACRONYMS = new Map(
  [
    'ADP', 'ATLS', 'AI', 'CDS', 'EMP', 'FPS', 'HMG', 'LMG', 'MRV', 'PBF',
    'QD', 'RSI', 'SCU', 'SMG', 'UEC', 'VHF',
  ].map((a) => [a.toLowerCase(), a])
)

/**
 * Internal plumbing — never member-facing. Localization keys, parser bookkeeping
 * and tag strings all land here.
 */
const HIDDEN_FIELD_ROOTS = new Set([
  'contractDefinitionId',
  'debugName',
  'descriptionKey',
  'file',
  'id',
  'internalName',
  'poolKey',
  'repScopeKey',
  'tags',
  'titleKey',
])

const FIELD_LABELS = {
  armorBaseStats: 'Armour stats',
  armorWeight: 'Armour weight',
  blueprintPools: 'Blueprint rewards',
  category: 'Category',
  costs: 'Hand-in cost',
  isVehicleReward: 'Vehicle reward',
  maxPerPlayer: 'Max per player',
  maxStanding: 'Maximum standing',
  minStanding: 'Minimum standing',
  prereqMissions: 'Prerequisite missions',
  repCareerLabel: 'Reputation track',
  repEffects: 'Faction reputation',
  repPoints: 'Reputation reward',
  repReward: 'Reputation reward',
  requiresIntro: 'Requires intro mission',
  rewardMissions: 'Reward missions',
  rewards: 'Rewards',
  subCategory: 'Category',
  typeParams: 'Stats',
  vehicleBaseStats: 'Vehicle stats',
  weaponBaseStats: 'Weapon stats',
}

/** Fields whose value is a list of things members recognise by name. */
const LIST_FIELD_ROOTS = new Set([
  'blueprintPools',
  'costs',
  'prereqMissions',
  'repEffects',
  'rewardMissions',
  'rewards',
])

/** Turn an internal token into something readable as a last resort. */
export function humanizeToken(raw) {
  if (raw == null) return ''
  let s = String(raw).trim()
  if (!s) return ''
  s = s.replace(/^@/, '')
  s = s.replace(/^item_Name/i, '')
  s = s.replace(/^(?:item|entity|vehicle)_/i, '')
  s = s.replace(/_LOD\d+$/i, '')
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2')
  s = s.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) return ACRONYMS.get(lower)
      if (/^\d+$/.test(word)) return word
      // Letter+digit codes read better fully capitalised (mr01 -> MR01).
      if (/^[a-z]{1,3}\d+$/i.test(word)) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/** CIG glues these onto stat names without a separator (Temperaturemin). */
const STAT_SUFFIXES = [
  'absorption',
  'capacity',
  'dissipation',
  'max',
  'min',
  'multiplier',
  'rate',
  'resistance',
]

/**
 * Strip CIG localization placeholders that leak into titles, e.g.
 * "~mission(Ship) Needs Assistance" -> "Needs Assistance".
 */
export function cleanGameText(raw) {
  if (raw == null) return ''
  return String(raw)
    .replace(/~\w+\([^)]*\)/g, '')
    .replace(/%l?s/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([:,.])/g, '$1')
    .replace(/:\s*(?=:)/g, '')
    .trim()
}

/** Quantum_Speed / driveSpeed -> "Quantum Speed" / "Drive Speed". */
export function humanizeStatName(raw) {
  if (raw == null) return ''
  let s = String(raw).replace(/^Armor_/i, 'Armour ').replace(/^SCItem/i, '')
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ')
  for (const suffix of STAT_SUFFIXES) {
    s = s.replace(new RegExp(`([a-z]{3,})(${suffix})\\b`, 'gi'), '$1 $2')
  }
  s = s.replace(/\s+/g, ' ').trim()
  return s
    .split(' ')
    .map((w) => {
      const lower = w.toLowerCase()
      if (ACRONYMS.has(lower)) return ACRONYMS.get(lower)
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  return Number(n.toFixed(4)).toLocaleString('en-US')
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** True for values that carry no information (missing, blank, empty container). */
function isBlank(v) {
  if (v === undefined || v === null || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

/** All-zero stat blobs are schema backfill, not a gameplay change. */
function isAllZero(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const values = Object.values(v)
  return values.length > 0 && values.every((x) => x === 0 || x === null || x === undefined)
}

/**
 * entityClass / internal name -> display name, built from parsed game data.
 * Wikelo costs and rewards already carry a `name`, so they are the richest
 * source for hand-in items and vehicles.
 */
export function buildDisplayNameResolver(options = {}) {
  const dataDir = options.dataDir
  const map = new Map()

  const add = (key, name) => {
    if (key == null || name == null) return
    const k = String(key).trim()
    const n = String(name).trim()
    if (!k || !n || n.startsWith('@') || k === n) return
    if (!map.has(k)) map.set(k, n)
  }

  const wikelo = readJson(join(dataDir, 'game-wikelo-trades.json'))
  for (const trade of wikelo?.trades ?? []) {
    for (const row of [...(trade.costs ?? []), ...(trade.rewards ?? [])]) {
      add(row?.entityClass, row?.name)
    }
  }

  const blueprints = readJson(join(dataDir, 'game-blueprints.json'))
  for (const bp of blueprints?.blueprints ?? []) {
    const name = bp.blueprintName || bp.displayName || bp.name
    add(bp.entityClass, name)
    add(bp.internalName, name)
  }

  const simple = [
    ['game-components.json', 'components', 'name', 'displayName'],
    ['game-fps-weapons.json', 'weapons', 'name', 'displayName'],
    ['game-salvage-modules.json', 'modules', 'name', 'displayName'],
    ['game-ordnance.json', 'ordnance', 'internalId', 'displayName'],
  ]
  for (const [file, path, keyField, nameField] of simple) {
    const data = readJson(join(dataDir, file))
    for (const rec of data?.[path] ?? []) add(rec?.[keyField], rec?.[nameField])
  }

  const mining = readJson(join(dataDir, 'game-mining.json'))
  for (const path of ['miningLasers', 'miningModules', 'miningGadgets']) {
    for (const rec of mining?.[path] ?? []) add(rec?.name, rec?.displayName)
  }

  for (const [key, name] of Object.entries(options.extra ?? {})) add(key, name)

  const resolve = (id) => {
    if (id == null) return ''
    const k = String(id).trim()
    return map.get(k) ?? humanizeToken(k)
  }
  resolve.size = map.size
  resolve.has = (id) => map.has(String(id ?? '').trim())
  return resolve
}

/** Never let an internal token or localization key reach a ticker label. */
export function cleanDisplayLabel(label, resolve) {
  const raw = cleanGameText(label)
  if (!raw) return ''
  const looksInternal =
    raw.startsWith('@') ||
    (/^[a-z0-9_]+$/.test(raw) && raw.includes('_')) ||
    // Single camelCase token is a debugName fallback, never a real title.
    (!/\s/.test(raw) && /[a-z][A-Z]/.test(raw))
  if (!looksInternal) return raw
  const stripped = raw.replace(/^@/, '').replace(/^item_Name/i, '')
  if (resolve?.has?.(stripped)) return resolve(stripped)
  return humanizeToken(raw)
}

function formatScalar(v, resolve) {
  if (v === undefined || v === null) return 'none'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return formatNumber(v)
  const s = String(v)
  if (/^[a-z0-9_]+$/.test(s) && (s.includes('_') || resolve?.has?.(s))) {
    return resolve ? resolve(s) : humanizeToken(s)
  }
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Identify a list entry so old/new lists can be compared by thing, not by index. */
function entryIdentity(row) {
  if (row == null || typeof row !== 'object') return String(row)
  return String(
    row.entityClass ?? row.mission ?? row.poolKey ?? row.factionKey ?? row.faction ?? JSON.stringify(row)
  )
}

/** Display name for a list entry, or null when the entry has no member-facing name. */
function entryName(row, resolve) {
  if (row == null) return null
  if (typeof row !== 'object') return resolve ? resolve(row) : String(row)
  if (row.name) return cleanGameText(row.name)
  if (row.mission) return cleanGameText(row.mission)
  if (row.resourceName) return humanizeToken(row.resourceName)
  if (row.faction) return cleanGameText(row.faction)
  if (row.entityClass || row.poolKey) {
    return cleanGameText(resolve ? resolve(entryIdentity(row)) : humanizeToken(entryIdentity(row)))
  }
  // Nested structures (mission prerequisites) have no name members would know.
  return null
}

function entryAmount(row) {
  if (row == null || typeof row !== 'object') return null
  const amt = row.amount ?? row.requiredCount
  return typeof amt === 'number' && amt !== 1 ? amt : null
}

function withAmount(row, resolve) {
  const name = entryName(row, resolve)
  if (!name) return null
  if (typeof row === 'object' && row && typeof row.scu === 'number') {
    return `${name} ${formatNumber(row.scu)} SCU`
  }
  const amt = entryAmount(row)
  return amt ? `${name} x${formatNumber(amt)}` : name
}

function joinNames(names) {
  if (names.length <= MAX_LIST_NAMES) return names.join(', ')
  return `${names.slice(0, MAX_LIST_NAMES).join(', ')} +${names.length - MAX_LIST_NAMES} more`
}

function describeList(label, oldVal, newVal, resolve) {
  const oldArr = Array.isArray(oldVal) ? oldVal : []
  const newArr = Array.isArray(newVal) ? newVal : []
  const oldById = new Map(oldArr.map((r) => [entryIdentity(r), r]))
  const newById = new Map(newArr.map((r) => [entryIdentity(r), r]))

  const added = []
  const removed = []
  const requantified = []
  let anyAdded = false
  let anyRemoved = false
  for (const [id, row] of newById) {
    if (!oldById.has(id)) {
      anyAdded = true
      const name = withAmount(row, resolve)
      if (name) added.push(name)
    } else {
      const before = entryAmount(oldById.get(id))
      const after = entryAmount(row)
      const name = entryName(row, resolve)
      if (before !== after && name) {
        requantified.push(`${name} x${formatNumber(before ?? 1)} -> x${formatNumber(after ?? 1)}`)
      }
    }
  }
  for (const [id, row] of oldById) {
    if (!newById.has(id)) {
      anyRemoved = true
      const name = withAmount(row, resolve)
      if (name) removed.push(name)
    }
  }

  const parts = []
  if (added.length) parts.push(`added ${joinNames(added)}`)
  if (removed.length) parts.push(`removed ${joinNames(removed)}`)
  if (requantified.length) parts.push(joinNames(requantified))
  if (parts.length) return `${label}: ${parts.join('; ')}`

  // Entries we cannot name (nested prerequisite structures) still deserve a
  // truthful note, just without the unreadable payload.
  if (anyAdded && !anyRemoved) return `${label} added`
  if (anyRemoved && !anyAdded) return `${label} removed`
  // Same entries, inner details changed (e.g. reputation payout inside a mission).
  return `${label} updated`
}

function describeStatObject(label, oldVal, newVal) {
  const oldObj = oldVal && typeof oldVal === 'object' ? oldVal : {}
  const newObj = newVal && typeof newVal === 'object' ? newVal : {}
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  const parts = []
  for (const k of keys) {
    const a = oldObj[k]
    const b = newObj[k]
    if (a === b) continue
    if (isBlank(a) && (b === 0 || isBlank(b))) continue
    if (isBlank(b) && (a === 0 || isBlank(a))) continue
    parts.push(
      `${humanizeStatName(k)}: ${a === undefined ? 'none' : formatNumber(a)} -> ${
        b === undefined ? 'none' : formatNumber(b)
      }`
    )
  }
  if (!parts.length) return null
  const shown = parts.slice(0, MAX_STAT_FIELDS).join('; ')
  const more = parts.length > MAX_STAT_FIELDS ? ` +${parts.length - MAX_STAT_FIELDS} more` : ''
  return `${label}: ${shown}${more}`
}

/**
 * One changed field -> one plain-language phrase, or null when the change is not
 * something a member can act on.
 */
export function describeField(field, resolve, options = {}) {
  const segments = String(field.path).split('.')
  const root = segments[0]
  if (HIDDEN_FIELD_ROOTS.has(root)) return null

  const { old: oldVal, new: newVal } = field
  if (isBlank(oldVal) && isBlank(newVal)) return null

  // A blueprint gains its entityClass when CIG finishes wiring the item up.
  if (root === 'entityClass') {
    return isBlank(oldVal) && !isBlank(newVal) ? 'Now available in-game' : null
  }

  if (isBlank(oldVal) && isAllZero(newVal)) return null
  if (isBlank(newVal) && isAllZero(oldVal)) return null

  const label = FIELD_LABELS[root] ?? humanizeStatName(root)

  if (LIST_FIELD_ROOTS.has(root) || Array.isArray(oldVal) || Array.isArray(newVal)) {
    return describeList(label, oldVal, newVal, resolve)
  }

  // Nested stat leaf (typeParams.params.driveSpeed) reads best as the stat alone,
  // unless two branches share a leaf name (minStanding/maxStanding both hold
  // minReputation) — then the parent is needed to tell them apart.
  if (segments.length > 1) {
    const statLabel = humanizeStatName(segments[segments.length - 1])
    const value = `${formatScalar(oldVal, resolve)} -> ${formatScalar(newVal, resolve)}`
    return options.disambiguate
      ? `${label}: ${statLabel} ${value}`
      : `${statLabel}: ${value}`
  }

  const bothObjects =
    (oldVal && typeof oldVal === 'object') || (newVal && typeof newVal === 'object')
  if (bothObjects) return describeStatObject(label, oldVal, newVal)

  // Going from nothing to a value reads better without the empty left side.
  if (isBlank(oldVal)) return `${label}: ${formatScalar(newVal, resolve)}`
  if (isBlank(newVal)) return `${label} removed`
  return `${label}: ${formatScalar(oldVal, resolve)} -> ${formatScalar(newVal, resolve)}`
}

/**
 * Whole-item summary. Returns null when nothing member-facing changed, which
 * lets the caller drop the item from the ticker entirely.
 */
export function describeChangedFields(fields, resolve, options = {}) {
  const maxParts = options.maxParts ?? 3
  const list = fields ?? []

  // Leaf names repeat across sibling branches; count them so colliding phrases
  // can carry their parent label.
  const leafCounts = new Map()
  for (const f of list) {
    const segments = String(f.path).split('.')
    if (segments.length < 2) continue
    const leaf = humanizeStatName(segments[segments.length - 1])
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1)
  }

  const seen = new Set()
  const parts = []
  for (const f of list) {
    const segments = String(f.path).split('.')
    const leaf = segments.length > 1 ? humanizeStatName(segments[segments.length - 1]) : null
    const disambiguate = leaf ? (leafCounts.get(leaf) ?? 0) > 1 : false
    const phrase = describeField(f, resolve, { disambiguate })
    if (!phrase || seen.has(phrase)) continue
    seen.add(phrase)
    parts.push(phrase)
  }
  if (!parts.length) return null
  const shown = parts.slice(0, maxParts).join('; ')
  const more = parts.length > maxParts ? ` +${parts.length - maxParts} more` : ''
  return `${shown}${more}`
}

/** "4.10.0-live.12519617" -> "4.10.0" for headlines members read at a glance. */
export function shortVersion(version) {
  const s = String(version ?? '').trim()
  const m = s.match(/^(\d+\.\d+(?:\.\d+)?)/)
  return m ? m[1] : s
}
