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
 *   node scripts/diff-game-data.mjs --write       # also write game-whats-new.json
 *
 * Reports per file: ADDED / REMOVED / RENAMED-MOVED / CHANGED records.
 * Rename/move detection: a "removed" record whose identity key (idKey) matches an
 * "added" record is reported as renamed/moved, NOT removed — e.g. blueprint UUID
 * moves, or mission contract UUID reissues paired by debugName. Never trust a
 * bare removal without checking this report.
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  COLLECTIONS,
  IGNORED_KEYS,
  deepEqual,
  diffGameDataFiles,
  fmtValue,
  readGitJson,
  stripMeta,
} from './lib/diffGameData.mjs'
import { writeWhatsNewDigest } from './lib/writeWhatsNewDigest.mjs'
// --write appends pending + pushes to Supabase (same as end of parse)
import { readFileSync, readdirSync, existsSync } from 'fs'

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
const WRITE = args.includes('--write')
const MAX_FIELDS_PER_RECORD = FULL ? Infinity : 8
const MAX_RECORDS_PER_SECTION = FULL ? Infinity : 40

function printRecords(title, items, formatter) {
  if (!items.length) return
  console.log(`    ${title} (${items.length}):`)
  items.slice(0, MAX_RECORDS_PER_SECTION).forEach((item) => console.log(`      ${formatter(item)}`))
  if (items.length > MAX_RECORDS_PER_SECTION) {
    console.log(`      ... and ${items.length - MAX_RECORDS_PER_SECTION} more (use --full)`)
  }
}

function printCollection(col) {
  const labelOf = (rec, key) => {
    const label = col.label?.(rec)
    return label && label !== key ? `${key}  ("${label}")` : key
  }

  console.log(
    `  ${col.path}[]  +${col.added.length} added  -${col.removed.length} removed  ~${col.renamed.length} renamed/moved  Δ${col.changed.length} changed`
  )

  printRecords('ADDED', col.added, (a) => `+ ${labelOf(a.rec, a.key)}`)
  printRecords('REMOVED (verify not moved!)', col.removed, (r) => `- ${labelOf(r.rec, r.key)}`)
  printRecords('RENAMED/MOVED (same identity key)', col.renamed, (r) => `~ ${r.oldKey} → ${r.newKey}`)
  printRecords('CHANGED', col.changed, (c) => {
    const fieldSummary = c.fields
      .slice(0, MAX_FIELDS_PER_RECORD)
      .map((f) => `${f.path}: ${fmtValue(f.old)} → ${fmtValue(f.new)}`)
      .join('; ')
    const more =
      c.fields.length > MAX_FIELDS_PER_RECORD
        ? ` (+${c.fields.length - MAX_FIELDS_PER_RECORD} more fields)`
        : ''
    return `Δ ${labelOf(c.rec, c.key)}  ${fieldSummary}${more}`
  })
}

// CLI report uses ignoreCosmetic:false so operators still see name-only churn.
const { collections, totals, anyRemovals } = diffGameDataFiles({
  projectRoot: ROOT,
  dataDir: DATA_DIR,
  gitRef: GIT_REF,
  onlyFile: ONLY_FILE,
  ignoreCosmetic: false,
})

console.log(`Game-data patch diff: working tree vs ${GIT_REF}`)
console.log('='.repeat(70))

const byFile = new Map()
for (const col of collections) {
  if (!byFile.has(col.file)) byFile.set(col.file, [])
  byFile.get(col.file).push(col)
}

const files = readdirSync(DATA_DIR)
  .filter((f) => f.startsWith('game-') && f.endsWith('.json'))
  .filter((f) => f !== 'game-whats-new.json')
  .filter((f) => !ONLY_FILE || f === ONLY_FILE)

for (const file of files) {
  const rel = `src/data/${file}`
  const filePath = join(DATA_DIR, file)
  if (!existsSync(filePath)) continue
  const newData = JSON.parse(readFileSync(filePath, 'utf8'))
  const oldData = readGitJson(ROOT, GIT_REF, rel)

  if (!oldData) {
    console.log(`\n${file}: NEW FILE (not in ${GIT_REF})`)
    continue
  }

  const cols = byFile.get(file) ?? []
  const keyedPaths = new Set((COLLECTIONS[file] ?? []).map((s) => s.path))

  // Generic top-level map diffs (not in COLLECTIONS) — CLI only
  let genericLines = []
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
  for (const key of allKeys) {
    if (IGNORED_KEYS.has(key) || keyedPaths.has(key)) continue
    const oldVal = oldData[key]
    const newVal = newData[key]
    if (deepEqual(stripMeta(oldVal), stripMeta(newVal))) continue
    if (
      oldVal &&
      newVal &&
      typeof oldVal === 'object' &&
      typeof newVal === 'object' &&
      !Array.isArray(oldVal) &&
      !Array.isArray(newVal)
    ) {
      const oldKeys = new Set(Object.keys(oldVal ?? {}))
      const newKeys = new Set(Object.keys(newVal ?? {}))
      const added = [...newKeys].filter((k) => !oldKeys.has(k))
      const removed = [...oldKeys].filter((k) => !newKeys.has(k))
      const changed = [...newKeys].filter(
        (k) => oldKeys.has(k) && !deepEqual(stripMeta(oldVal[k]), stripMeta(newVal[k]))
      )
      if (added.length || removed.length || changed.length) {
        genericLines.push(
          `  ${key}{}  +${added.length} added  -${removed.length} removed  Δ${changed.length} changed`
        )
      }
    } else {
      genericLines.push(
        `  ${key}: changed (${fmtValue(stripMeta(oldVal))} → ${fmtValue(stripMeta(newVal))})`
      )
    }
  }

  if (!cols.length && !genericLines.length) continue

  console.log(`\n${file}`)
  for (const col of cols) printCollection(col)
  for (const line of genericLines) console.log(line)
}

console.log('\n' + '='.repeat(70))
console.log(
  `TOTAL: +${totals.added} added  -${totals.removed} removed  ~${totals.renamed} renamed/moved  Δ${totals.changed} changed`
)
if (anyRemovals) {
  console.log('\n⚠ REMOVALS DETECTED — CIG often MOVES records between directories.')
  console.log('  Before trusting a removal, check src/data/_extraction-validation.json')
  console.log('  for "Missing expected path" issues, and search the new extract for the')
  console.log('  record name:  rg -l -i "<name>" extracted-data/libs/foundry/records')
}

if (WRITE) {
  const result = await writeWhatsNewDigest({ projectRoot: ROOT, dataDir: DATA_DIR, gitRef: GIT_REF })
  console.log(`\n✓ What's New: ${result.entryCount} fresh entries (pending → DB)`)
  if (result.push?.ok && !result.push?.empty) {
    console.log(`  inserted ${result.push.inserted}, skipped ${result.push.skipped}`)
  } else if (result.push?.reason) {
    console.warn(`  ${result.push.reason}`)
  } else if (result.push?.error) {
    console.warn(`  DB push failed: ${result.push.error}`)
  }
}
