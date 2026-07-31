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
    { path: 'mineableElements', key: 'name', idKey: 'id', category: 'Resources', label: (r) => r.name },
    {
      path: 'miningLasers',
      key: 'name',
      idKey: 'id',
      category: 'Resources',
      label: (r) => r.displayName || r.name,
    },
    {
      path: 'miningModules',
      key: 'name',
      idKey: 'id',
      category: 'Resources',
      label: (r) => r.displayName || r.name,
    },
    {
      path: 'miningGadgets',
      key: 'name',
      idKey: 'id',
      category: 'Resources',
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
      key: 'id',
      category: 'Missions',
      label: (r) => r.displayTitle || r.title || r.debugName || r.id,
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

export function stripMeta(value) {
  if (Array.isArray(value)) return value.map(stripMeta)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      if (k === '_extracted') continue
      out[k] = stripMeta(value[k])
    }
    return out
  }
  return value
}

/** Strip cosmetic leaves so name-only churn does not count as a gameplay change. */
export function stripForGameplayDiff(value, options = {}) {
  const keepName = options.keepName === true
  if (Array.isArray(value)) return value.map((v) => stripForGameplayDiff(v, options))
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      if (k === '_extracted') continue
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
    const addedById = new Map(
      added.filter((a) => a.rec?.[spec.idKey]).map((a) => [a.rec[spec.idKey], a])
    )
    for (let i = removed.length - 1; i >= 0; i--) {
      const id = removed[i].rec?.[spec.idKey]
      if (id && addedById.has(id)) {
        const match = addedById.get(id)
        renamed.push({ oldKey: removed[i].key, newKey: match.key, id })
        removed.splice(i, 1)
        added.splice(added.indexOf(match), 1)
      }
    }
  }

  const keepName = spec.key === 'name'
  for (const [key, newRec] of newByKey) {
    const oldRec = oldByKey.get(key)
    if (!oldRec) continue
    const oldCmp = ignoreCosmetic
      ? stripForGameplayDiff(stripMeta(oldRec), { keepName })
      : stripMeta(oldRec)
    const newCmp = ignoreCosmetic
      ? stripForGameplayDiff(stripMeta(newRec), { keepName })
      : stripMeta(newRec)
    const fields = changedFields(oldCmp, newCmp)
    if (fields.length) changed.push({ key, rec: newRec, fields })
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
