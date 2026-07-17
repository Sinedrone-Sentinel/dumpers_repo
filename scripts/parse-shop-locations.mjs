#!/usr/bin/env node
/**
 * Parse Star Citizen starmap location + amenity data into a buy/sell shop list.
 *
 * Source (game files only):
 *   - libs/foundry/records/starmap/pu/**                   (StarMapObject records)
 *   - libs/foundry/records/starmapamenitytypes/...json     (amenity type names)
 *   - Data/Localization/english/global.ini                 (display names)
 *
 * StarMapObject records are spread across the starmap tree:
 *   - starmap/pu/system/<system>/**   celestial bodies + (Stanton) outposts
 *   - starmap/pu/*.json               outposts/settlements (esp. Pyro)
 *   - starmap/pu/station/<type>/**    stations (reststop, refinery, shippinghub, ...)
 * The system each location belongs to is derived by climbing the `parent` chain
 * up to the system's star.
 *
 * A location can BUY/SELL resources if its amenities include a Commodity Trading
 * entry (Freight Elevator or Loading Dock). Refinery is a raw-ore refining service,
 * NOT a commodity buy/sell shop, so it is tracked separately and never counted as
 * a trade shop.
 *
 * NOTE: The client files expose *that* a location trades commodities (mobiGlas map
 * amenity), not the per-commodity buy/sell split or price — that is server-side.
 *
 * Output: extracted-data/_shop_locations.json (preview; not yet wired into the app)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname, basename, sep } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const EXTRACTED = join(PROJECT_ROOT, 'extracted-data')
const RECORDS = join(EXTRACTED, 'libs/foundry/records')
const STARMAP_ROOT = join(RECORDS, 'starmap/pu')
const AMENITY_FILE = join(RECORDS, 'starmapamenitytypes/starmapamenitytypes.json')
const GLOBAL_INI = join(EXTRACTED, 'Data/Localization/english/global.ini')
const OUT = join(EXTRACTED, '_shop_locations.json')

/** Subtrees under starmap/pu that are not real player locations. */
const SKIP_PATH_PARTS = new Set(['mission_item', 'player_related'])
/** Star systems to ignore (not real in-fiction systems). */
const IGNORE_SYSTEMS = new Set(['demo'])

/** Amenity record ids that mean "you can buy/sell commodities (resources) here". */
const TRADE_AMENITY_IDS = new Set([
  'a783bfb9-0f0a-491f-864b-945a49ef5da4', // Commodity Trading - Freight Elevator
  '02905cad-b6ef-4e1d-a996-291647200f42', // Commodity Trading - Loading Dock
])
const REFINERY_AMENITY_ID = '7618a59c-75f4-4f63-9c51-d39c3cc58a75'

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function loadLocalization() {
  const map = new Map()
  if (!existsSync(GLOBAL_INI)) return map
  const raw = readFileSync(GLOBAL_INI, 'utf-8')
  for (const line of raw.split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    map.set(line.slice(0, eq), line.slice(eq + 1))
  }
  return map
}

function resolveName(nameField, loc) {
  if (!nameField) return null
  if (nameField.startsWith('@')) {
    const key = nameField.slice(1)
    if (key === 'LOC_UNINITIALIZED' || key === 'LOC_EMPTY') return null
    const val = loc.get(key)
    return val != null ? val.trim() : null
  }
  return nameField.trim()
}

function walkJson(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_PATH_PARTS.has(entry.name)) continue
      walkJson(full, out)
    } else if (entry.name.endsWith('.json')) {
      out.push(full)
    }
  }
  return out
}

function loadAmenityTypes() {
  const rec = readJson(AMENITY_FILE)
  const map = new Map()
  for (const t of rec?._RecordValue_?.amenityTypes ?? []) map.set(t._RecordId_, t.name)
  return map
}

/** parent file:// path -> normalized lookup key (lowercased base name). */
function parentKey(parentPath) {
  if (!parentPath) return null
  return basename(parentPath)
    .replace(/^starmapobject\./i, '')
    .replace(/\.json$/i, '')
    .toLowerCase()
}
/** _RecordName_ (StarMapObject.<Base>) -> normalized lookup key. */
function recordKey(recordName) {
  return recordName.replace(/^StarMapObject\./i, '').toLowerCase()
}

function isTemplate(node) {
  const s = `${node.recordName} ${node.displayName ?? ''}`.toLowerCase()
  return s.includes('template') || s.includes('_test') || s.includes('placeholder')
}

/**
 * Mission-instantiated / non-shop sites that carry a Commodity Trading amenity
 * but are NOT player-usable TDD/Admin shops (e.g. ASD "Onyx Facility" delve sites).
 */
function isMissionInstanced(node) {
  const path = (node.file ?? '').toLowerCase()
  const name = (node.displayName ?? '').toLowerCase()
  return (
    /asd_delve|delving_facility|asd_delving/.test(path) ||
    name.startsWith('onyx facility')
  )
}

function main() {
  const loc = loadLocalization()
  const amenityNames = loadAmenityTypes()

  const files = walkJson(STARMAP_ROOT)
  const byKey = new Map()
  const nodes = []

  for (const f of files) {
    const rec = readJson(f)
    const v = rec?._RecordValue_
    if (!rec?._RecordName_ || !v || v._Type_ !== 'StarMapObject') continue
    const rel = f.slice(STARMAP_ROOT.length + 1).split(sep)
    const amenityEntries = v.amenities ?? []
    const node = {
      file: rel.join('/'),
      recordName: rec._RecordName_,
      key: recordKey(rec._RecordName_),
      displayName: resolveName(v.name, loc),
      navIcon: v.navIcon ?? null,
      category: basename(dirname(f)),
      parentKey: parentKey(v.parent),
      amenities: amenityEntries.map((a) => amenityNames.get(a._RecordId_) ?? a._RecordId_),
      tradesCommodities: amenityEntries.some((a) => TRADE_AMENITY_IDS.has(a._RecordId_)),
      hasRefinery: amenityEntries.some((a) => a._RecordId_ === REFINERY_AMENITY_ID),
    }
    byKey.set(node.key, node)
    nodes.push(node)
  }

  // Climb the parent chain to find the system (root star) + immediate body.
  function rootOf(node) {
    let cur = node
    const guard = new Set()
    while (cur?.parentKey && byKey.has(cur.parentKey) && !guard.has(cur.key)) {
      guard.add(cur.key)
      cur = byKey.get(cur.parentKey)
    }
    return cur
  }
  function systemLabel(node) {
    const root = rootOf(node)
    const raw = (root?.displayName ?? root?.recordName ?? '').toString()
    const m = raw.replace(/^StarMapObject\./, '')
    // Normalize "Stanton (Star)" / "Pyro" / "pyrostar" -> system name
    const lc = m.toLowerCase()
    if (lc.includes('stanton')) return 'Stanton'
    if (lc.includes('pyro')) return 'Pyro'
    if (lc.includes('nyx')) return 'Nyx'
    if (lc.includes('demo')) return 'demo'
    return m || 'Unknown'
  }

  for (const n of nodes) {
    n.system = systemLabel(n)
    const parent = n.parentKey ? byKey.get(n.parentKey) : null
    n.body = parent ? parent.displayName ?? parent.recordName.replace(/^StarMapObject\./, '') : null
  }

  const seen = new Set()
  const tradeLocations = nodes
    .filter(
      (n) =>
        n.tradesCommodities &&
        !IGNORE_SYSTEMS.has(n.system.toLowerCase()) &&
        !isTemplate(n) &&
        !isMissionInstanced(n)
    )
    .map((n) => ({
      name: n.displayName ?? n.recordName.replace(/^StarMapObject\./, ''),
      system: n.system,
      body: n.body,
      category: n.category,
      refineryOnSite: n.hasRefinery,
      amenities: n.amenities,
    }))
    .filter((t) => {
      const k = `${t.system}|${t.body}|${t.name}`.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => (a.system + '|' + (a.body ?? '') + '|' + a.name).localeCompare(b.system + '|' + (b.body ?? '') + '|' + b.name))

  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Star Citizen starmap StarMapObject amenities (game files)',
    note: 'Locations where you can buy/sell resources (Commodity Trading amenity). Refinery is a separate raw-ore service, not a buy/sell shop. Per-commodity buy/sell split and prices are server-side and not in client files.',
    totalStarmapLocations: nodes.length,
    tradeLocationCount: tradeLocations.length,
    tradeLocations,
  }
  writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n', 'utf-8')

  const bySystem = {}
  for (const t of tradeLocations) (bySystem[t.system] ??= []).push(t)
  console.log(`Total starmap StarMapObjects scanned: ${nodes.length}`)
  console.log(`Commodity buy/sell locations: ${tradeLocations.length}\n`)
  for (const sys of Object.keys(bySystem).sort()) {
    console.log(`=== ${sys} (${bySystem[sys].length}) ===`)
    for (const t of bySystem[sys]) {
      console.log(`  ${t.name}${t.body ? ` — ${t.body}` : ''} [${t.category}]${t.refineryOnSite ? ' (+refinery)' : ''}`)
    }
    console.log('')
  }
  console.log(`Wrote ${OUT}`)
}

main()
