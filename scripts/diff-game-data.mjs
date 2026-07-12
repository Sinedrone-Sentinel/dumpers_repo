#!/usr/bin/env node
/**
 * Game-data patch diff — compares freshly parsed src/data/game-*.json against
 * a git ref (default HEAD, i.e. the last committed pre-patch data).
 *
 * Usage (after running extract + parse for a new game patch):
 *   node scripts/diff-game-data.mjs               # diff all game-*.json vs HEAD
 *   node scripts/diff-game-data.mjs --ref v1.2.3  # diff vs another ref
 *   node scripts/diff-game-data.mjs --file game-mining.json
 *   node scripts/diff-game-data.mjs --full        # show every changed field (no cap)
 *
 * Reports per file: ADDED / REMOVED / RENAMED-MOVED / CHANGED records.
 * Rename/move detection: a "removed" record whose stable id matches an "added"
 * record is reported as renamed/moved, NOT removed — CIG moves records around
 * between patches, so never trust a bare removal without checking this report.
 */
import { execSync } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'src', 'data')

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}
const GIT_REF = argValue('--ref') ?? 'HEAD'
const ONLY_FILE = argValue('--file')
const FULL = args.includes('--full')
const MAX_FIELDS_PER_RECORD = FULL ? Infinity : 8
const MAX_RECORDS_PER_SECTION = FULL ? Infinity : 40

/** Keyed collections per file: how to identify a record and detect renames. */
const COLLECTIONS = {
  'game-blueprints.json': [
    { path: 'blueprints', key: 'internalName', idKey: 'id', label: (r) => r.displayName || r.name || r.internalName },
  ],
  'game-mining.json': [
    { path: 'mineableElements', key: 'name', idKey: 'id' },
    { path: 'miningLasers', key: 'name', idKey: 'id', label: (r) => r.displayName },
    { path: 'miningModules', key: 'name', idKey: 'id', label: (r) => r.displayName },
    { path: 'miningGadgets', key: 'name', idKey: 'id', label: (r) => r.displayName },
  ],
  'game-components.json': [
    { path: 'components', key: 'name', idKey: 'id', label: (r) => r.displayName },
  ],
  'game-fps-weapons.json': [
    { path: 'weapons', key: 'name', idKey: 'id', label: (r) => r.displayName },
  ],
  'game-ordnance.json': [
    { path: 'ordnance', key: 'internalId', label: (r) => r.displayName },
  ],
  'game-blueprint-missions.json': [
    { path: 'contracts', key: 'id', label: (r) => r.displayTitle || r.title || r.debugName },
  ],
  'game-salvage-modules.json': [
    { path: 'modules', key: 'name', idKey: 'id' },
  ],
}

/** Top-level object maps to diff by key (everything else falls back to this too). */
const IGNORED_KEYS = new Set(['_source', '_extracted', 'summary', 'audit', 'metadata', 'version'])

function stripMeta(value) {
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

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** List changed leaf fields between two records (dot paths, old → new). */
function changedFields(oldRec, newRec, prefix = '', out = []) {
  const keys = new Set([...Object.keys(oldRec ?? {}), ...Object.keys(newRec ?? {})])
  for (const key of keys) {
    if (key === '_extracted') continue
    const oldVal = oldRec?.[key]
    const newVal = newRec?.[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (deepEqual(oldVal, newVal)) continue
    const bothObjects =
      oldVal && newVal &&
      typeof oldVal === 'object' && typeof newVal === 'object' &&
      !Array.isArray(oldVal) && !Array.isArray(newVal)
    if (bothObjects) {
      changedFields(oldVal, newVal, path, out)
    } else {
      out.push({ path, old: oldVal, new: newVal })
    }
  }
  return out
}

function fmtValue(v) {
  if (v === undefined) return '(none)'
  const s = JSON.stringify(v)
  return s.length > 80 ? s.slice(0, 77) + '...' : s
}

function readGitJson(ref, relPath) {
  try {
    const raw = execSync(`git show ${ref}:"${relPath.replace(/\\/g, '/')}"`, {
      cwd: ROOT,
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

let totals = { added: 0, removed: 0, renamed: 0, changed: 0 }
let anyRemovals = false

function printRecords(title, items, formatter) {
  if (!items.length) return
  console.log(`    ${title} (${items.length}):`)
  items.slice(0, MAX_RECORDS_PER_SECTION).forEach((item) => console.log(`      ${formatter(item)}`))
  if (items.length > MAX_RECORDS_PER_SECTION) {
    console.log(`      ... and ${items.length - MAX_RECORDS_PER_SECTION} more (use --full)`)
  }
}

function diffKeyedCollection(fileName, spec, oldData, newData) {
  const oldArr = oldData?.[spec.path]
  const newArr = newData?.[spec.path]
  if (!Array.isArray(oldArr) && !Array.isArray(newArr)) return

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

  // Rename/move detection by stable id: removed record whose id matches an added record
  const renamed = []
  if (spec.idKey) {
    const addedById = new Map(added.filter((a) => a.rec?.[spec.idKey]).map((a) => [a.rec[spec.idKey], a]))
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

  for (const [key, newRec] of newByKey) {
    const oldRec = oldByKey.get(key)
    if (!oldRec) continue
    const fields = changedFields(stripMeta(oldRec), stripMeta(newRec))
    if (fields.length) changed.push({ key, rec: newRec, fields })
  }

  if (!added.length && !removed.length && !renamed.length && !changed.length) return

  const labelOf = (rec, key) => {
    const label = spec.label?.(rec)
    return label && label !== key ? `${key}  ("${label}")` : key
  }

  console.log(`  ${spec.path}[]  +${added.length} added  -${removed.length} removed  ~${renamed.length} renamed/moved  Δ${changed.length} changed`)

  printRecords('ADDED', added, (a) => `+ ${labelOf(a.rec, a.key)}`)
  printRecords('REMOVED (verify not moved!)', removed, (r) => `- ${labelOf(r.rec, r.key)}`)
  printRecords('RENAMED/MOVED (same id)', renamed, (r) => `~ ${r.oldKey} → ${r.newKey}`)
  printRecords('CHANGED', changed, (c) => {
    const fieldSummary = c.fields
      .slice(0, MAX_FIELDS_PER_RECORD)
      .map((f) => `${f.path}: ${fmtValue(f.old)} → ${fmtValue(f.new)}`)
      .join('; ')
    const more = c.fields.length > MAX_FIELDS_PER_RECORD ? ` (+${c.fields.length - MAX_FIELDS_PER_RECORD} more fields)` : ''
    return `Δ ${labelOf(c.rec, c.key)}  ${fieldSummary}${more}`
  })

  totals.added += added.length
  totals.removed += removed.length
  totals.renamed += renamed.length
  totals.changed += changed.length
  if (removed.length) anyRemovals = true
}

function diffObjectMap(fileName, key, oldMap, newMap) {
  const oldKeys = new Set(Object.keys(oldMap ?? {}))
  const newKeys = new Set(Object.keys(newMap ?? {}))
  const added = [...newKeys].filter((k) => !oldKeys.has(k))
  const removed = [...oldKeys].filter((k) => !newKeys.has(k))
  const changed = [...newKeys].filter(
    (k) => oldKeys.has(k) && !deepEqual(stripMeta(oldMap[k]), stripMeta(newMap[k]))
  )
  if (!added.length && !removed.length && !changed.length) return

  console.log(`  ${key}{}  +${added.length} added  -${removed.length} removed  Δ${changed.length} changed`)
  printRecords('ADDED', added, (k) => `+ ${k}`)
  printRecords('REMOVED (verify not moved!)', removed, (k) => `- ${k}`)
  if (changed.length <= MAX_RECORDS_PER_SECTION || FULL) {
    printRecords('CHANGED', changed, (k) => `Δ ${k}`)
  } else {
    console.log(`    CHANGED (${changed.length}): (list suppressed, use --full)`)
  }

  totals.added += added.length
  totals.removed += removed.length
  totals.changed += changed.length
  if (removed.length) anyRemovals = true
}

// ============================================================================

const files = readdirSync(DATA_DIR)
  .filter((f) => f.startsWith('game-') && f.endsWith('.json'))
  .filter((f) => !ONLY_FILE || f === ONLY_FILE)

console.log(`Game-data patch diff: working tree vs ${GIT_REF}`)
console.log('='.repeat(70))

for (const file of files) {
  const rel = `src/data/${file}`
  const newData = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
  const oldData = readGitJson(GIT_REF, rel)

  if (!oldData) {
    console.log(`\n${file}: NEW FILE (not in ${GIT_REF})`)
    continue
  }

  const before = { ...totals }
  const headerPrinted = { value: false }
  const origLog = console.log
  // Lazy header: only print the file name if something inside it differs
  console.log = (...lineArgs) => {
    if (!headerPrinted.value) {
      headerPrinted.value = true
      origLog(`\n${file}`)
    }
    origLog(...lineArgs)
  }

  const keyedSpecs = COLLECTIONS[file] ?? []
  const keyedPaths = new Set(keyedSpecs.map((s) => s.path))
  for (const spec of keyedSpecs) {
    diffKeyedCollection(file, spec, oldData, newData)
  }

  // Diff remaining top-level object maps and unkeyed arrays generically
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
  for (const key of allKeys) {
    if (IGNORED_KEYS.has(key) || keyedPaths.has(key)) continue
    const oldVal = oldData[key]
    const newVal = newData[key]
    if (deepEqual(stripMeta(oldVal), stripMeta(newVal))) continue
    if (
      oldVal && newVal &&
      typeof oldVal === 'object' && typeof newVal === 'object' &&
      !Array.isArray(oldVal) && !Array.isArray(newVal)
    ) {
      diffObjectMap(file, key, oldVal, newVal)
    } else {
      console.log(`  ${key}: changed (${fmtValue(stripMeta(oldVal))} → ${fmtValue(stripMeta(newVal))})`)
      totals.changed += 1
    }
  }

  console.log = origLog
  if (!headerPrinted.value && JSON.stringify(before) === JSON.stringify(totals)) {
    // no changes in this file — stay quiet
  }
}

console.log('\n' + '='.repeat(70))
console.log(`TOTAL: +${totals.added} added  -${totals.removed} removed  ~${totals.renamed} renamed/moved  Δ${totals.changed} changed`)
if (anyRemovals) {
  console.log('\n⚠ REMOVALS DETECTED — CIG often MOVES records between directories.')
  console.log('  Before trusting a removal, check src/data/_extraction-validation.json')
  console.log('  for "Missing expected path" issues, and search the new extract for the')
  console.log('  record name:  rg -l -i "<name>" extracted-data/libs/foundry/records')
}
