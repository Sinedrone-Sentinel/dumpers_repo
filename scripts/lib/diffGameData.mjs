/**
 * Structured game-data patch diff (working tree vs a git ref).
 * Used by CLI (`diff-game-data.mjs`) and What's New digest writer.
 */
import { execSync } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

/** Keyed collections per file: how to identify a record and detect renames. */
export const COLLECTIONS = {
  'game-blueprints.json': [
    {
      path: 'blueprints',
      key: 'internalName',
      idKey: 'id',
      category: 'Blueprints',
      label: (r) => {
        const name = r.blueprintName || r.displayName || r.name || r.internalName
        const cat = r.categoryName || r.category
        return cat ? `${cat} · ${name}` : name
      },
    },
  ],
  'game-mining.json': [
    // Ores / harvestables only — mining gear is equipment (Components).
    { path: 'mineableElements', key: 'name', idKey: 'id', category: 'Resources', label: (r) => r.name },
    {
      path: 'miningLasers',
      key: 'name',
      idKey: 'id',
      category: 'Components',
      label: (r) => r.displayName || r.name,
    },
    {
      path: 'miningModules',
      key: 'name',
      idKey: 'id',
      category: 'Components',
      label: (r) => r.displayName || r.name,
    },
    {
      path: 'miningGadgets',
      key: 'name',
      idKey: 'id',
      category: 'Components',
      label: (r) => r.displayName || r.name,
    },
  ],
  'game-components.json': [
    {
      path: 'components',
      key: 'name',
      idKey: 'id',
      category: 'Components',
      label: (r) => r.displayName || r.name,
    },
  ],
  'game-fps-weapons.json': [
    {
      path: 'weapons',
      key: 'name',
      idKey: 'id',
      category: 'FPS Weapons',
      label: (r) => r.displayName || r.name,
    },
  ],
  'game-ordnance.json': [
    {
      path: 'ordnance',
      key: 'internalId',
      category: 'Ordnance',
      label: (r) => r.displayName || r.internalId,
    },
  ],
  'game-blueprint-missions.json': [
    {
      path: 'contracts',
      // Primary key = contract UUID. CIG often reissues the same mission under a new
      // UUID; debugName is the stable identity used to pair that churn as rename
      // (then gameplay field diffs become "changed", not fake add+remove).
      key: 'id',
      idKey: 'debugName',
      category: 'Missions',
      // Player titles are heavily reused (refuel ranks, etc.) — disambiguate in ticker.
      label: (r) => formatMissionTickerLabel(r),
    },
  ],
  'game-salvage-modules.json': [
    {
      path: 'modules',
      key: 'name',
      idKey: 'id',
      category: 'Salvage',
      label: (r) => r.displayName || r.name,
    },
  ],
  'game-wikelo-trades.json': [
    {
      path: 'trades',
      key: 'id',
      category: 'Wikelo',
      label: (r) => r.title || r.debugName || r.id,
    },
  ],
}

/**
 * Mission contracts reuse the same displayTitle across ranks/systems/loadouts.
 * Build a member-facing label that separates those variants.
 */
export function formatMissionTickerLabel(r) {
  const title = r?.displayTitle || r?.title || r?.debugName || r?.id || 'Mission'
  const parts = [String(title)]
  if (r?.system) parts.push(String(r.system))
  const debugName = String(r?.debugName || '')
  const rank = debugName.match(/_Rank(\d+)/i)?.[1]
  if (rank) parts.push(`Rank ${rank}`)
  const variant = missionVariantHint(debugName, r?.system)
  if (variant) parts.push(variant)
  else if (r?.faction) parts.push(String(r.faction))
  return parts.join(' · ')
}

/** Strip system/rank prefixes from debugName → short loadout/variant hint. */
function missionVariantHint(debugName, system) {
  if (!debugName) return null
  let s = String(debugName)
  s = s.replace(/^Refueling_/i, '')
  if (system) {
    const sys = String(system).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`^${sys}_?`, 'i'), '')
    // Multi-system tokens like PyroNyx
    s = s.replace(new RegExp(`^[A-Za-z]*${sys}[A-Za-z]*_?`, 'i'), '')
  }
  s = s.replace(/_Rank\d+$/i, '')
  s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || /^rank\s*\d+$/i.test(s)) return null
  if (s.length > 48) s = `${s.slice(0, 45)}…`
  return s
}

/** Top-level keys ignored for generic map diffs. */
export const IGNORED_KEYS = new Set([
  '_source',
  '_extracted',
  'summary',
  'audit',
  'metadata',
  'version',
  'launcherVersion',
  'defaultBlueprintIds',
])

/** Cosmetic / label-only fields — ignore for "changed" ticker (no gameplay impact). */
export const COSMETIC_FIELD_NAMES = new Set([
  'displayName',
  'blueprintName',
  'title',
  'displayTitle',
  'description',
  'debugName',
  'localizedName',
  'name', // label-only when not the collection key (stripped via stripForGameplayDiff)
])

/**
 * Parser / release-metadata fields that appear across patches without meaningful
 * member-facing gameplay change (also suppresses schema-add noise on backfills).
 */
export const NON_GAMEPLAY_FIELD_NAMES = new Set(['frequency', 'notForRelease'])

export function stripMeta(value) {
  if (Array.isArray(value)) return value.map(stripMeta)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      if (k === '_extracted' || k.startsWith('__')) continue
      out[k] = stripMeta(value[k])
    }
    return out
  }
  return value
}

/** Strip cosmetic leaves so name-only churn does not count as a gameplay change. */
export function stripForGameplayDiff(value, options = {}) {
  const keepName = options.keepName === true
  const omitKeys = options.omitKeys instanceof Set ? options.omitKeys : null
  if (Array.isArray(value)) return value.map((v) => stripForGameplayDiff(v, options))
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      if (k === '_extracted' || k.startsWith('__')) continue
      if (omitKeys?.has(k)) continue
      if (NON_GAMEPLAY_FIELD_NAMES.has(k)) continue
      if (COSMETIC_FIELD_NAMES.has(k) && !(keepName && k === 'name')) continue
      out[k] = stripForGameplayDiff(value[k], options)
    }
    return out
  }
  return value
}

export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function changedFields(oldRec, newRec, prefix = '', out = []) {
  const keys = new Set([...Object.keys(oldRec ?? {}), ...Object.keys(newRec ?? {})])
  for (const key of keys) {
    if (key === '_extracted') continue
    const oldVal = oldRec?.[key]
    const newVal = newRec?.[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (deepEqual(oldVal, newVal)) continue
    const bothObjects =
      oldVal &&
      newVal &&
      typeof oldVal === 'object' &&
      typeof newVal === 'object' &&
      !Array.isArray(oldVal) &&
      !Array.isArray(newVal)
    if (bothObjects) {
      changedFields(oldVal, newVal, path, out)
    } else {
      out.push({ path, old: oldVal, new: newVal })
    }
  }
  return out
}

export function fmtValue(v) {
  if (v === undefined) return '(none)'
  const s = JSON.stringify(v)
  return s.length > 80 ? s.slice(0, 77) + '...' : s
}

export function readGitJson(projectRoot, ref, relPath) {
  try {
    const raw = execSync(`git show ${ref}:"${relPath.replace(/\\/g, '/')}"`, {
      cwd: projectRoot,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(raw.toString('utf8'))
  } catch {
    return null
  }
}

function indexBy(arr, key) {
  const map = new Map()
  for (const rec of arr ?? []) {
    const k = rec?.[key]
    if (k != null) map.set(String(k), rec)
  }
  return map
}

/**
 * Diff one keyed collection. Returns structured result or null if unchanged.
 */
export function diffKeyedCollection(spec, oldData, newData, options = {}) {
  const ignoreCosmetic = options.ignoreCosmetic !== false
  const oldArr = oldData?.[spec.path]
  const newArr = newData?.[spec.path]
  if (!Array.isArray(oldArr) && !Array.isArray(newArr)) return null

  const oldByKey = indexBy(oldArr, spec.key)
  const newByKey = indexBy(newArr, spec.key)

  const added = []
  const removed = []
  const changed = []

  for (const [key, rec] of newByKey) {
    if (!oldByKey.has(key)) added.push({ key, rec })
  }
  for (const [key, rec] of oldByKey) {
    if (!newByKey.has(key)) removed.push({ key, rec })
  }

  const renamed = []
  if (spec.idKey) {
    const addedById = new Map()
    for (const a of added) {
      const id = a.rec?.[spec.idKey]
      if (id == null || id === '') continue
      // 1:1 pairing only — duplicate identity keys stay as add/remove noise
      if (!addedById.has(String(id))) addedById.set(String(id), a)
    }
    for (let i = removed.length - 1; i >= 0; i--) {
      const idRaw = removed[i].rec?.[spec.idKey]
      if (idRaw == null || idRaw === '') continue
      const id = String(idRaw)
      if (!addedById.has(id)) continue
      const match = addedById.get(id)
      const oldRec = removed[i].rec
      const newRec = match.rec
      renamed.push({ oldKey: removed[i].key, newKey: match.key, id, oldRec, newRec })
      removed.splice(i, 1)
      const addIdx = added.indexOf(match)
      if (addIdx >= 0) added.splice(addIdx, 1)
      addedById.delete(id)
    }
  }

  const keepName = spec.key === 'name'
  const pushChanged = (key, oldRec, newRec, extraOmit = null) => {
    const omitKeys = extraOmit
    const oldCmp = ignoreCosmetic
      ? stripForGameplayDiff(stripMeta(oldRec), { keepName, omitKeys })
      : stripMeta(oldRec)
    const newCmp = ignoreCosmetic
      ? stripForGameplayDiff(stripMeta(newRec), { keepName, omitKeys })
      : stripMeta(newRec)
    const fields = changedFields(oldCmp, newCmp)
    if (fields.length) changed.push({ key, rec: newRec, fields })
  }

  for (const [key, newRec] of newByKey) {
    const oldRec = oldByKey.get(key)
    if (!oldRec) continue
    pushChanged(key, oldRec, newRec)
  }

  // Identity-key churn (e.g. mission UUID reissue): omit primary key from the
  // field diff so the new UUID itself is not reported as a gameplay change.
  const renameOmit = new Set([spec.key])
  for (const r of renamed) {
    if (r.oldRec && r.newRec) pushChanged(r.newKey, r.oldRec, r.newRec, renameOmit)
  }

  if (!added.length && !removed.length && !renamed.length && !changed.length) return null

  return {
    path: spec.path,
    category: spec.category || spec.path,
    key: spec.key,
    label: spec.label,
    added,
    removed,
    renamed,
    changed,
  }
}

/**
 * Diff all game-*.json files under dataDir vs gitRef.
 * @returns {{ collections: object[], totals, anyRemovals: boolean }}
 */
export function diffGameDataFiles(options = {}) {
  const projectRoot = options.projectRoot
  const dataDir = options.dataDir ?? join(projectRoot, 'src', 'data')
  const gitRef = options.gitRef ?? 'HEAD'
  const onlyFile = options.onlyFile ?? null
  const ignoreCosmetic = options.ignoreCosmetic !== false

  const files = readdirSync(dataDir)
    .filter((f) => f.startsWith('game-') && f.endsWith('.json'))
    .filter((f) => f !== 'game-whats-new.json' && f !== 'game-build-version.json')
    .filter((f) => !onlyFile || f === onlyFile)

  const collections = []
  const totals = { added: 0, removed: 0, renamed: 0, changed: 0 }
  let anyRemovals = false

  for (const file of files) {
    const rel = `src/data/${file}`
    const filePath = join(dataDir, file)
    if (!existsSync(filePath)) continue
    const newData = JSON.parse(readFileSync(filePath, 'utf8'))
    const oldData = readGitJson(projectRoot, gitRef, rel)
    if (!oldData) continue

    const keyedSpecs = COLLECTIONS[file] ?? []
    for (const spec of keyedSpecs) {
      const result = diffKeyedCollection(spec, oldData, newData, { ignoreCosmetic })
      if (!result) continue
      collections.push({ file, ...result })
      totals.added += result.added.length
      totals.removed += result.removed.length
      totals.renamed += result.renamed.length
      totals.changed += result.changed.length
      if (result.removed.length) anyRemovals = true
    }
  }

  return { collections, totals, anyRemovals }
}
