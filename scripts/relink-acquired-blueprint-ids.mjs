#!/usr/bin/env node
/**
 * Re-link stored acquired / target-list blueprint_id values onto the current catalog.
 * 1) Same-record catalog key changes (stripped internalName changed) from parse / git.
 * 2) Exact mechanical leftovers (_scitem, unique bp_ prefix, legacy paths).
 * Anything else goes to an approval list.
 *
 *   npm run relink-acquired-blueprint-ids -- --dry-run
 *   npm run relink-acquired-blueprint-ids -- --apply
 */
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { exactRelinkBlueprintId } from './lib/canonicalizeBlueprintId.mjs'
import { buildCatalogKeyRenames } from './lib/blueprintIdRenames.mjs'
import { readGitJson } from './lib/diffGameData.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const APPLY = process.argv.includes('--apply')
const DRY = process.argv.includes('--dry-run') || !APPLY

loadDotenv({ path: join(ROOT, '.env') })

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const catalog = JSON.parse(readFileSync(join(ROOT, 'src/data/game-blueprints.json'), 'utf8'))
const catalogIds = new Set(
  (catalog.blueprints || []).map((bp) => bp.internalName).filter(Boolean)
)
const displayOf = new Map(
  (catalog.blueprints || [])
    .filter((bp) => bp.internalName)
    .map((bp) => [bp.internalName, bp.blueprintName || bp.internalName])
)

const priorCatalog = readGitJson(ROOT, 'HEAD', 'src/data/game-blueprints.json')
let catalogRenames = buildCatalogKeyRenames(priorCatalog?.blueprints || [], catalog.blueprints || [])
const parseRenamePath = join(ROOT, 'extracted-data', 'blueprint-id-renames.json')
if (existsSync(parseRenamePath)) {
  try {
    const parsed = JSON.parse(readFileSync(parseRenamePath, 'utf8'))
    const extra = Array.isArray(parsed.remaps) ? parsed.remaps : []
    const seen = new Set(catalogRenames.map((r) => r.from))
    for (const row of extra) {
      if (!row?.from || !row?.to || row.from === row.to || seen.has(row.from)) continue
      if (catalogIds.has(row.from)) continue
      seen.add(row.from)
      catalogRenames.push({ ...row, rule: row.rule || 'catalog_key_change' })
    }
  } catch {
    /* keep git remaps */
  }
}
const catalogRenameByFrom = new Map(catalogRenames.map((r) => [r.from, r]))

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function fetchAll(table) {
  const page = 1000
  let from = 0
  const rows = []
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select('id, user_id, blueprint_id')
      .range(from, from + page - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < page) break
    from += page
  }
  return rows
}

function classify(rows) {
  const remap = []
  const approval = []
  const exact = []
  for (const row of rows) {
    const catalogHit = catalogRenameByFrom.get(row.blueprint_id)
    if (catalogHit && catalogHit.to !== row.blueprint_id) {
      remap.push({ ...row, canon: catalogHit.to, rule: 'catalog_key_change' })
      continue
    }
    const result = exactRelinkBlueprintId(row.blueprint_id, catalogIds)
    if (result.ok && result.canon === row.blueprint_id && result.rule === 'exact') {
      exact.push(row)
      continue
    }
    if (result.ok && result.canon !== row.blueprint_id) {
      remap.push({ ...row, canon: result.canon, rule: result.rule })
      continue
    }
    approval.push(row)
  }
  return { remap, approval, exact }
}

async function applyTable(table, remap) {
  let updated = 0
  let droppedDupes = 0
  for (const row of remap) {
    const { error } = await sb.from(table).update({ blueprint_id: row.canon }).eq('id', row.id)
    if (!error) {
      updated += 1
      continue
    }
    if (error.code !== '23505') {
      throw new Error(`${table} update ${row.id}: ${error.message}`)
    }
    const { error: delError } = await sb.from(table).delete().eq('id', row.id)
    if (delError) throw new Error(`${table} delete dupe ${row.id}: ${delError.message}`)
    droppedDupes += 1
  }
  return { updated, droppedDupes }
}

console.log('Catalog internal names:', catalogIds.size)
console.log('Catalog key changes (same UUID):', catalogRenames.length)
for (const row of catalogRenames.slice(0, 40)) {
  const label = displayOf.get(row.to)
  console.log(`  ${row.from} -> ${row.to}${label ? ` "${label}"` : ''}`)
}
if (catalogRenames.length > 40) {
  console.log('  ...', catalogRenames.length - 40, 'more catalog key changes')
}

const acquired = await fetchAll('acquired_blueprints')
const targets = await fetchAll('target_list_blueprints')
const acq = classify(acquired)
const tgt = classify(targets)

console.log(
  'acquired_blueprints:',
  acquired.length,
  'exact',
  acq.exact.length,
  'remap',
  acq.remap.length,
  'approval',
  acq.approval.length,
)
console.log(
  'target_list_blueprints:',
  targets.length,
  'exact',
  tgt.exact.length,
  'remap',
  tgt.remap.length,
  'approval',
  tgt.approval.length,
)

const remapByRule = {}
for (const row of [...acq.remap, ...tgt.remap]) {
  remapByRule[row.rule] = (remapByRule[row.rule] || 0) + 1
}
if (Object.keys(remapByRule).length) {
  console.log('Auto remap rules:', remapByRule)
  for (const row of acq.remap.slice(0, 40)) {
    const label = displayOf.get(row.canon)
    console.log(`  ${row.blueprint_id} -> ${row.canon} (${row.rule})${label ? ` "${label}"` : ''}`)
  }
  if (acq.remap.length > 40) console.log('  ...', acq.remap.length - 40, 'more acquired remaps')
}

const approvalRows = [
  ...acq.approval.map((r) => ({ table: 'acquired_blueprints', storedId: r.blueprint_id })),
  ...tgt.approval.map((r) => ({ table: 'target_list_blueprints', storedId: r.blueprint_id })),
]
const approvalIds = new Map()
for (const row of approvalRows) {
  const key = `${row.table}|${row.storedId}`
  if (!approvalIds.has(key)) {
    approvalIds.set(key, { table: row.table, storedId: row.storedId, rows: 0 })
  }
  approvalIds.get(key).rows += 1
}
const approvalList = [...approvalIds.values()].sort((a, b) => b.rows - a.rows)

if (approvalList.length) {
  const outDir = join(ROOT, 'extracted-data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'acquired-id-relink-approval.json')
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'These stored IDs do not exact-relink onto the current catalog. Do not guess — approve a mapping first.',
        items: approvalList,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`\nNeeds your approval (${approvalList.length} distinct IDs):`)
  for (const item of approvalList) {
    console.log(`  ${item.table} ${item.storedId} x${item.rows}`)
  }
  console.log('Wrote', outPath)
} else {
  console.log('\nNo approval-list IDs — every stored id exact-matched or exact-remapped.')
}

if (DRY) {
  console.log('\nDry run — no database writes. Re-run with --apply to remap.')
  process.exit(0)
}

const acqWrite = await applyTable('acquired_blueprints', acq.remap)
const tgtWrite = await applyTable('target_list_blueprints', tgt.remap)
console.log('\nApplied acquired:', acqWrite)
console.log('Applied target list:', tgtWrite)
