/**
 * Build What's New ticker entries from game-data diffs + spelling corrections.
 * Appends to extracted-data/whats-new-pending.jsonl, then pushes to Supabase
 * (ingest_whats_new_entries). On successful push, wipes the pending file.
 *
 * DB dedupe: same issue_key + same version → skipped (mid-patch re-parse safe).
 * New patch version may re-add the same issue (misspellings across patches OK).
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { diffGameDataFiles, fmtValue } from './diffGameData.mjs'
import { getAppliedSpellingCorrections } from './spellingCorrections.mjs'
import aliasData from '../../src/data/mining-ore-aliases.json' with { type: 'json' }

const MAX_SUMMARY_FIELDS = 4

const MISSPELLING_HEADLINES = [
  (n, ver) =>
    `MISSPELLINGS: ${n} CIG typo${n === 1 ? '' : 's'} we had to fix in ${ver} (spellcheck is free, CIG)`,
  (n, ver) =>
    `MISSPELLINGS: ${n} localization oopsie${n === 1 ? '' : 's'} patched by the parser in ${ver}`,
  (n, ver) =>
    `MISSPELLINGS: Fixed ${n} CIG spelling crime${n === 1 ? '' : 's'} in ${ver} — hire a dictionary`,
  (n, ver) =>
    `MISSPELLINGS: ${n} "creative" ore name${n === 1 ? '' : 's'} corrected in ${ver} (Alumium forever)`,
]

function actionVerb(action) {
  if (action === 'added') return 'added'
  if (action === 'removed') return 'removed'
  if (action === 'changed') return 'changed'
  return action
}

function labelOf(specLabel, rec, key) {
  const label = typeof specLabel === 'function' ? specLabel(rec) : null
  return label && String(label).trim() ? String(label) : key
}

function fieldSummary(fields) {
  const parts = fields.slice(0, MAX_SUMMARY_FIELDS).map((f) => {
    return `${f.path}: ${fmtValue(f.old)} → ${fmtValue(f.new)}`
  })
  const more =
    fields.length > MAX_SUMMARY_FIELDS ? ` (+${fields.length - MAX_SUMMARY_FIELDS} more)` : ''
  return parts.join('; ') + more
}

function readJsonSafe(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function issueKeyFor(category, action) {
  return `${String(category).toLowerCase().replace(/\s+/g, '_')}:${action}`
}

function pendingPath(projectRoot) {
  return join(projectRoot, 'extracted-data', 'whats-new-pending.jsonl')
}

/**
 * Misspellings ticker = curated CIG/game-localization typos from mining-ore-aliases.json
 * (plus any exact corrections applied during this parse).
 * Excludes legacyAliasKeys (StarStrings/MrKraken short forms like Heph).
 * No fuzzy matching. BP Dumper / client OCR never feed this.
 */
function buildMisspellingsEntry(version, detectedAt) {
  const legacy = new Set(aliasData.legacyAliasKeys ?? [])
  const byKey = new Map()

  for (const [from, to] of Object.entries(aliasData.aliases ?? {})) {
    if (legacy.has(from) || !from || from === to) continue
    byKey.set(`${from}\0${to}`, {
      key: from,
      label: `"${from}" → "${to}"`,
      summary: 'Ore / game localization',
    })
  }

  for (const c of getAppliedSpellingCorrections()) {
    if (legacy.has(c.from)) continue
    byKey.set(`${c.from}\0${c.to}`, {
      key: c.from,
      label: `"${c.from}" → "${c.to}"`,
      summary: c.context || 'Ore / game localization',
    })
  }

  const items = [...byKey.values()]
  if (!items.length) return null

  const n = items.length
  const pick = MISSPELLING_HEADLINES[n % MISSPELLING_HEADLINES.length]
  return {
    issueKey: issueKeyFor('Misspellings', 'corrected'),
    version,
    category: 'Misspellings',
    action: 'corrected',
    headline: pick(n, version),
    detectedAt,
    items: items.sort((a, b) => a.label.localeCompare(b.label)),
  }
}

export function buildWhatsNewEntriesFromDiff(diffResult, options = {}) {
  const version = options.version || options.launcherVersion || 'unknown'
  const detectedAt = options.detectedAt || new Date().toISOString()

  /** @type {Map<string, { category: string, action: string, items: object[] }>} */
  const buckets = new Map()

  const ensure = (category, action) => {
    const id = `${category}::${action}`
    if (!buckets.has(id)) buckets.set(id, { category, action, items: [] })
    return buckets.get(id)
  }

  for (const col of diffResult.collections) {
    const labelFn = col.label
    for (const a of col.added) {
      ensure(col.category, 'added').items.push({
        key: a.key,
        label: labelOf(labelFn, a.rec, a.key),
        summary: null,
      })
    }
    for (const r of col.removed) {
      ensure(col.category, 'removed').items.push({
        key: r.key,
        label: labelOf(labelFn, r.rec, r.key),
        summary: null,
      })
    }
    for (const c of col.changed) {
      ensure(col.category, 'changed').items.push({
        key: c.key,
        label: labelOf(labelFn, c.rec, c.key),
        summary: fieldSummary(c.fields),
      })
    }
  }

  const entries = []
  for (const { category, action, items } of buckets.values()) {
    if (!items.length) continue
    const seen = new Set()
    const unique = []
    for (const item of items) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      unique.push(item)
    }
    unique.sort((a, b) => a.label.localeCompare(b.label))
    const n = unique.length
    const verb = actionVerb(action)
    entries.push({
      issueKey: issueKeyFor(category, action),
      version,
      category,
      action,
      headline: `${n} ${category} ${verb} in ${version}`,
      detectedAt,
      items: unique,
    })
  }

  return entries
}

export function readPendingWhatsNew(projectRoot) {
  const path = pendingPath(projectRoot)
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
  const rows = []
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line))
    } catch {
      // skip bad lines
    }
  }
  return rows
}

export function appendPendingWhatsNew(projectRoot, entries) {
  if (!entries?.length) return { path: pendingPath(projectRoot), appended: 0 }
  const dir = join(projectRoot, 'extracted-data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = pendingPath(projectRoot)
  const chunk = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  appendFileSync(path, chunk, 'utf8')
  return { path, appended: entries.length }
}

export function wipePendingWhatsNew(projectRoot) {
  const path = pendingPath(projectRoot)
  if (existsSync(path)) unlinkSync(path)
}

/**
 * Push pending JSONL (or explicit entries) to Supabase; wipe pending on success.
 */
export async function pushWhatsNewToDatabase(options = {}) {
  const projectRoot = options.projectRoot
  loadDotenv({ path: join(projectRoot, '.env') })

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — pending file kept for retry (npm run push-whats-new)',
    }
  }

  const entries = options.entries ?? readPendingWhatsNew(projectRoot)
  if (!entries.length) {
    return { ok: true, inserted: 0, skipped: 0, empty: true }
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('ingest_whats_new_entries', {
    p_entries: entries,
  })

  if (error) {
    return { ok: false, error: error.message, pendingKept: true }
  }

  wipePendingWhatsNew(projectRoot)
  return {
    ok: true,
    inserted: data?.inserted ?? 0,
    skipped: data?.skipped ?? 0,
    wiped: true,
  }
}

/**
 * Diff vs git → append pending JSONL → push to DB (wipe on success).
 */
export async function writeWhatsNewDigest(options = {}) {
  const projectRoot = options.projectRoot
  const dataDir = options.dataDir ?? join(projectRoot, 'src', 'data')
  const gitRef = options.gitRef ?? 'HEAD'

  const buildFile = readJsonSafe(join(dataDir, 'game-build-version.json'))
  const version =
    options.version ||
    options.launcherVersion ||
    buildFile?.launcherVersion ||
    buildFile?.version ||
    'unknown'

  const detectedAt = new Date().toISOString()

  const diffResult = diffGameDataFiles({
    projectRoot,
    dataDir,
    gitRef,
    ignoreCosmetic: true,
  })

  const freshEntries = buildWhatsNewEntriesFromDiff(diffResult, {
    version,
    detectedAt,
  })

  // Curated CIG/game typos (legacy StarStrings keys excluded).
  if (freshEntries.length > 0) {
    const misspellings = buildMisspellingsEntry(version, detectedAt)
    if (misspellings) freshEntries.push(misspellings)
  }

  const pending = appendPendingWhatsNew(projectRoot, freshEntries)
  let push = { ok: true, skipped: true, empty: true }
  if (freshEntries.length > 0 || readPendingWhatsNew(projectRoot).length > 0) {
    push = await pushWhatsNewToDatabase({ projectRoot })
  }

  return {
    version,
    totals: diffResult.totals,
    entryCount: freshEntries.length,
    pendingPath: pending.path,
    appended: pending.appended,
    push,
  }
}
