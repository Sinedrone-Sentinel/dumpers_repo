/**
 * Bake UEX in-game buy locations for Fuzy's Ship Shop.
 *
 * Ships, ship components, weapons, racks, missiles, bombs, and gimbals.
 * The browser never calls UEX. Re-run with `npm run fetch-ship-shop-shops`.
 *
 * Output: src/data/ship-shop-shops.json keyed by ship id and entity class.
 * A row is omitted when UEX has no purchase price. That item is not sold in a shop.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { matchShopRow } from './lib/uexShopJoin.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outPath = path.join(root, 'src/data/ship-shop-shops.json')
const extracted = path.join(root, 'extracted-data/libs/foundry/records/entities')

const UEX = 'https://api.uexcorp.space/2.0'

const CATEGORIES = [
  19, 21, 22, 23, 32, 33, 34, 35, 67, 70, 82, 83, 90, 103,
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let nextSlot = 0
async function pace() {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + 520
  if (slot > now) await sleep(slot - now)
}

async function fetchUex(endpoint, attempt = 1) {
  await pace()
  try {
    const res = await fetch(`${UEX}/${endpoint}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'DumpersRepo-ShipShopShops' },
    })
    if (res.status === 429) throw new Error('UEX rate limit')
    if (!res.ok) throw new Error(`UEX ${endpoint} failed: ${res.status}`)
    const payload = await res.json()
    return payload.data ?? payload
  } catch (err) {
    if (attempt >= 4) throw err
    await sleep(attempt * 1500)
    return fetchUex(endpoint, attempt + 1)
  }
}

function cleanName(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function priceOf(value) {
  const n = Number(value) || 0
  return n > 0 ? Math.round(n) : null
}

function walkJson(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkJson(full, acc)
    else if (entry.name.endsWith('.json')) acc.push(full)
  }
  return acc
}

function recordId(filePath) {
  try {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return cleanName(json._RecordId_)
  } catch {
    return null
  }
}

function listingFrom(row) {
  const price = priceOf(row.price_buy ?? row.price_buy_avg)
  const store = cleanName(row.terminal_name)
  if (price == null || !store) return null
  const listing = { store, price }
  const fields = [
    ['system', row.star_system_name],
    ['planet', row.planet_name],
    ['moon', row.moon_name],
    ['station', row.space_station_name],
    ['city', row.city_name],
    ['outpost', row.outpost_name],
  ]
  for (const [key, value] of fields) {
    const text = cleanName(value)
    if (text) listing[key] = text
  }
  return listing
}

function dedupe(listings) {
  const seen = new Set()
  const rows = []
  for (const listing of listings) {
    const key = [listing.system, listing.planet, listing.station, listing.city, listing.outpost, listing.store, listing.price].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(listing)
  }
  rows.sort((a, b) => (a.system || '').localeCompare(b.system || '') || (a.store || '').localeCompare(b.store || '') || a.price - b.price)
  return rows
}

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
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/data/game-ship-item-stats.json'), 'utf8'))
  const ships = JSON.parse(fs.readFileSync(path.join(root, 'src/data/game-ships.json'), 'utf8')).ships || []

  const itemFiles = new Map()
  for (const filePath of walkJson(path.join(extracted, 'scitem/ships'))) {
    itemFiles.set(path.basename(filePath, '.json').toLowerCase(), filePath)
  }
  const shipFiles = new Map()
  for (const filePath of walkJson(path.join(extracted, 'spaceships'))) {
    shipFiles.set(path.basename(filePath, '.json').toLowerCase(), filePath)
  }

  console.log('Fetching UEX categories, items, and vehicles...')
  const categoryRows = await fetchUex('categories')
  const wanted = new Set(CATEGORIES)
  const categories = (Array.isArray(categoryRows) ? categoryRows : []).filter((row) => wanted.has(row.id))
  if (categories.length !== CATEGORIES.length) {
    throw new Error(`UEX ship-shop categories missing. Found ${categories.map((row) => row.id).join(', ')}`)
  }

  const uexItems = []
  for (const category of categories) {
    const rows = await fetchUex(`items?id_category=${category.id}`)
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = cleanName(row.name)
      if (!name) continue
      uexItems.push({
        uexId: row.id,
        uuid: cleanName(row.uuid) || '',
        name,
        nameFull: name,
        kind: 'item',
      })
    }
    console.log(`  ${category.name}: ${Array.isArray(rows) ? rows.length : 0}`)
  }

  const vehicleRows = await fetchUex('vehicles')
  const uexVehicles = []
  for (const row of Array.isArray(vehicleRows) ? vehicleRows : []) {
    const name = cleanName(row.name)
    const nameFull = cleanName(row.name_full) || name
    if (!nameFull) continue
    uexVehicles.push({
      uexId: row.id,
      uuid: cleanName(row.uuid) || '',
      name: name || nameFull,
      nameFull,
      kind: 'ship',
    })
  }
  console.log(`Vehicles: ${uexVehicles.length}`)

  const matchedItems = []
  for (const item of catalog.items || []) {
    const filePath = itemFiles.get(String(item.entityClass || '').toLowerCase())
    const hit = matchShopRow(uexItems, {
      uuid: filePath ? recordId(filePath) : '',
      displayName: item.displayName,
    })
    if (hit) matchedItems.push({ key: item.entityClass, uexId: hit.uexId, name: item.displayName, kind: 'item' })
  }

  const matchedShips = []
  for (const ship of ships) {
    const filePath = shipFiles.get(String(ship.id || '').toLowerCase())
    const hit = matchShopRow(uexVehicles, {
      uuid: filePath ? recordId(filePath) : '',
      displayName: ship.displayName,
    })
    if (hit) matchedShips.push({ key: ship.id, uexId: hit.uexId, name: ship.displayName, kind: 'ship' })
  }
  console.log(`Matched parts: ${matchedItems.length}. Matched ships: ${matchedShips.length}.`)

  const jobs = [...matchedItems, ...matchedShips]
  console.log(`Fetching prices for ${jobs.length} rows...`)
  const priced = await mapLimit(jobs, 4, async (job) => {
    const endpoint = job.kind === 'ship'
      ? `vehicles_purchases_prices?id_vehicle=${job.uexId}`
      : `items_prices?id_item=${job.uexId}`
    const rows = await fetchUex(endpoint)
    return { job, rows: Array.isArray(rows) ? rows : [] }
  })

  const items = {}
  const shipShops = {}
  let listingCount = 0
  for (const { job, rows } of priced) {
    const listings = dedupe(rows.map(listingFrom).filter(Boolean))
    if (listings.length === 0) continue
    listingCount += listings.length
    if (job.kind === 'ship') shipShops[job.key] = listings
    else items[job.key] = listings
  }

  const deadbolt = items.espr_ballisticcannon_s5
  if (!deadbolt || deadbolt.length === 0) {
    throw new Error('Deadbolt V has no buy locations. The UEX join did not land.')
  }
  const hundred = shipShops.orig_100i
  if (!hundred || hundred.length === 0) {
    throw new Error('The 100i has no purchase rows. Vehicle prices did not land.')
  }
  if (shipShops.orig_m80) {
    throw new Error('The M80 was given purchase rows. It is not sold in-game.')
  }

  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'UEX Corp',
    sourceUrl: 'https://uexcorp.space',
    attribution: 'Powered by UEX',
    note: 'In-game buy locations for ships and ship-shop parts. A missing key is not sold in a shop.',
    itemCount: Object.keys(items).length,
    shipCount: Object.keys(shipShops).length,
    listingCount,
    ships: shipShops,
    items,
  }
  fs.writeFileSync(outPath, `${JSON.stringify(output)}\n`, 'utf8')
  console.log(`Parts with a shop: ${output.itemCount}`)
  console.log(`Ships with a shop: ${output.shipCount}`)
  console.log(`Listings: ${listingCount}`)
  console.log(`Wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
