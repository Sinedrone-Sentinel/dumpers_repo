/**
 * Fetch UEX buy locations for mining loadout gear (heads, modules, gadgets).
 *
 * "Powered by UEX" - which terminal stocks a mining head/module/gadget, and at what
 * price, is crowdsourced by UEX Corp (https://uexcorp.space). We bake a compact index
 * so the Smart Cracker Advisor can answer "where can I buy X" with no runtime UEX
 * dependency. Re-run on patch day: `npm run fetch-mining-gear-shops`.
 *
 * Scope is deliberately narrow. Only UEX categories flagged `is_mining` in the Utility
 * section are fetched (Mining Laser Heads, Mining Modules, Gadgets), so armour, ammo,
 * food, personal weapons and ships are never in the index and cannot be answered.
 *
 * Output: src/data/mining-gear-shops.json
 *   - terminals: every terminal that stocks at least one piece of mining gear
 *   - items:     one row per gear item, keyed by Star Citizen uuid, carrying EVERY
 *                known terminal listing (never a truncated sample)
 *
 * The uuid is the join key back to src/data/game-mining.json - UEX publishes the same
 * Star Citizen uuid we parse out of the game files, so no fuzzy name matching is needed.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outPath = path.join(root, 'src/data/mining-gear-shops.json')

const UEX = 'https://api.uexcorp.space/2.0'

/** UEX category name -> the kind our mining catalog uses. */
const KIND_BY_CATEGORY = {
  'Mining Laser Heads': 'laser',
  'Mining Modules': 'module',
  Gadgets: 'gadget',
}

/** Sanity canary - if UEX restructures, fail loudly instead of shipping an empty index. */
const CANARY_ITEM = 'Hofstede-S2 Mining Laser'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchUex(endpoint, attempt = 1) {
  try {
    const res = await fetch(`${UEX}/${endpoint}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'DumpersRepo-MiningGearShops' },
    })
    if (!res.ok) throw new Error(`UEX ${endpoint} failed: ${res.status}`)
    const payload = await res.json()
    return payload.data ?? payload
  } catch (err) {
    if (attempt >= 3) throw err
    await sleep(attempt * 750)
    return fetchUex(endpoint, attempt + 1)
  }
}

/** Trim + null out empty/placeholder names. */
function cleanName(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

function priceOf(value) {
  const n = Number(value) || 0
  return n > 0 ? Math.round(n) : null
}

/** Run tasks with light concurrency - UEX allows 120 requests/minute. */
async function mapLimit(items, limit, fn) {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  console.log('Fetching UEX mining gear categories...')
  const categoriesRaw = await fetchUex('categories')

  const categories = categoriesRaw.filter(
    (c) => c.type === 'item' && c.is_mining === 1 && c.section === 'Utility'
  )
  const kinds = new Set(categories.map((c) => KIND_BY_CATEGORY[c.name]).filter(Boolean))
  for (const expected of ['laser', 'module', 'gadget']) {
    if (!kinds.has(expected)) {
      throw new Error(
        `UEX mining categories missing "${expected}" - got: ${categories.map((c) => c.name).join(', ')}`
      )
    }
  }
  console.log(`Categories: ${categories.map((c) => `${c.name} (${c.id})`).join(', ')}`)

  // --- Items ---------------------------------------------------------------
  const items = []
  for (const category of categories) {
    const kind = KIND_BY_CATEGORY[category.name]
    if (!kind) continue
    const rows = await fetchUex(`items?id_category=${category.id}`)
    for (const row of rows) {
      const uuid = cleanName(row.uuid)
      const name = cleanName(row.name)
      if (!uuid || !name) continue
      items.push({
        uexId: row.id,
        uuid,
        name,
        kind,
        category: category.name,
        size: cleanName(row.size),
        company: cleanName(row.company_name),
        listings: [],
      })
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  console.log(`Items: ${items.length}`)

  // --- Prices (every terminal for every item) ------------------------------
  const terminalById = new Map()
  const gameVersions = new Set()
  let listingCount = 0

  console.log('Fetching buy locations per item (complete terminal list)...')
  const priceRows = await mapLimit(items, 4, async (item) => {
    const rows = await fetchUex(`items_prices?id_item=${item.uexId}`)
    return { item, rows: Array.isArray(rows) ? rows : [] }
  })

  for (const { item, rows } of priceRows) {
    for (const p of rows) {
      const buy = priceOf(p.price_buy ?? p.price_buy_avg)
      if (buy == null) continue

      if (!terminalById.has(p.id_terminal)) {
        terminalById.set(p.id_terminal, {
          id: p.id_terminal,
          name: cleanName(p.terminal_name) ?? `Terminal ${p.id_terminal}`,
          system: cleanName(p.star_system_name),
          planet: cleanName(p.planet_name),
          orbit: cleanName(p.orbit_name),
          moon: cleanName(p.moon_name),
          station: cleanName(p.space_station_name),
          city: cleanName(p.city_name),
          outpost: cleanName(p.outpost_name),
        })
      }

      if (cleanName(p.game_version)) gameVersions.add(cleanName(p.game_version))
      item.listings.push({ t: p.id_terminal, buy })
      listingCount++
    }
    item.listings.sort((a, b) => a.buy - b.buy || a.t - b.t)
  }

  // --- Guards --------------------------------------------------------------
  if (listingCount === 0) throw new Error('UEX returned no mining gear buy locations')
  const canary = items.find((i) => i.name === CANARY_ITEM)
  if (!canary || canary.listings.length === 0) {
    throw new Error(`Canary item "${CANARY_ITEM}" has no buy locations - check the UEX item feed`)
  }

  const unsold = items.filter((i) => i.listings.length === 0)
  if (unsold.length) {
    // Kept in the index on purpose: "not sold anywhere UEX knows" beats "unknown item".
    console.log(`No known shop for ${unsold.length}: ${unsold.map((i) => i.name).join(', ')}`)
  }

  const terminals = [...terminalById.values()].sort((a, b) => a.name.localeCompare(b.name))
  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'UEX Corp',
    sourceUrl: 'https://uexcorp.space',
    attribution: 'Powered by UEX',
    endpoints: ['/2.0/categories', '/2.0/items?id_category=', '/2.0/items_prices?id_item='],
    note: 'Mining head/module/gadget buy locations and prices crowdsourced by UEX Corp. Join to game-mining.json on uuid.',
    gameVersions: [...gameVersions].sort(),
    itemCount: items.length,
    terminalCount: terminals.length,
    listingCount,
    terminals,
    items: items.map(({ uexId: _uexId, ...rest }) => rest),
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(output) + '\n', 'utf8')

  console.log(`Items:     ${items.length}`)
  console.log(`Terminals: ${terminals.length}`)
  console.log(`Listings:  ${listingCount}`)
  console.log(`Game versions: ${output.gameVersions.join(', ') || 'unknown'}`)
  const bySystem = new Map()
  for (const t of terminals) bySystem.set(t.system ?? 'Unknown', (bySystem.get(t.system ?? 'Unknown') ?? 0) + 1)
  console.log('Terminals by system:', Object.fromEntries([...bySystem].sort()))
  console.log(`\nWrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
