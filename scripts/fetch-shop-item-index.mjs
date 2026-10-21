/**
 * Bake UEX buy locations for shop goods that are not commodities and not
 * already in the ship-shop bake: personal guns, armor, food, and drinks.
 *
 * The browser never calls UEX. Re-run with `npm run fetch-shop-item-index`.
 * Output: src/data/shop-item-index.json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outPath = path.join(root, 'src/data/shop-item-index.json')
const UEX = 'https://api.uexcorp.space/2.0'

const GROUPS = {
  1: 'Armor',
  2: 'Armor',
  3: 'Armor',
  4: 'Armor',
  5: 'Armor',
  7: 'Armor',
  24: 'Armor',
  18: 'Guns',
  62: 'Drinks',
  63: 'Food',
}

const AMMO_NAME = /\b(magazine|ammunition|ammo)\b/i

function clean(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

async function fetchUex(endpoint) {
  const res = await fetch(`${UEX}/${endpoint}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'DumpersRepo-ShopItemIndex' },
  })
  if (!res.ok) throw new Error(`UEX ${endpoint} failed: ${res.status}`)
  const payload = await res.json()
  return payload.data ?? payload
}

function placeOf(terminal) {
  if (!terminal) return {}
  const place = {}
  for (const [key, value] of [
    ['system', terminal.star_system_name],
    ['planet', terminal.planet_name],
    ['moon', terminal.moon_name],
    ['station', terminal.space_station_name],
    ['city', terminal.city_name],
    ['outpost', terminal.outpost_name],
  ]) {
    const text = clean(value)
    if (text) place[key] = text
  }
  return place
}

async function main() {
  console.log('Fetching UEX item prices and item terminals...')
  const [prices, terminals] = await Promise.all([
    fetchUex('items_prices_all'),
    fetchUex('terminals?type=item'),
  ])
  const terminalById = new Map((Array.isArray(terminals) ? terminals : []).map((row) => [row.id, row]))
  const items = new Map()

  for (const row of Array.isArray(prices) ? prices : []) {
    const price = Math.round(Number(row.price_buy) || 0)
    if (price <= 0) continue
    const name = clean(row.item_name)
    if (!name) continue
    const category = Number(row.id_category)
    let group = GROUPS[category] || null
    if (!group && AMMO_NAME.test(name) && category !== 36) group = 'Ammo'
    if (!group) continue
    const store = clean(row.terminal_name)
    if (!store) continue
    const uuid = clean(row.item_uuid)
    const id = uuid || `name:${name.toLowerCase()}`
    let item = items.get(id)
    if (!item) {
      item = { id, name, group, listings: [] }
      items.set(id, item)
    }
    item.listings.push({ store, price, ...placeOf(terminalById.get(row.id_terminal)) })
  }

  const catalog = []
  for (const item of items.values()) {
    const seen = new Set()
    const listings = []
    for (const listing of item.listings) {
      const key = [listing.system, listing.station, listing.city, listing.outpost, listing.store, listing.price].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      listings.push(listing)
    }
    listings.sort((a, b) => (a.system || '').localeCompare(b.system || '') || a.store.localeCompare(b.store) || a.price - b.price)
    if (listings.length === 0) continue
    catalog.push({ ...item, listings })
  }
  catalog.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))

  const counts = {}
  for (const item of catalog) counts[item.group] = (counts[item.group] || 0) + 1
  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'UEX Corp',
    sourceUrl: 'https://uexcorp.space',
    attribution: 'Powered by UEX',
    note: 'Buy locations for personal guns, armor, food, and drinks. A missing item is not sold in a shop.',
    itemCount: catalog.length,
    counts,
    items: catalog,
  }
  fs.writeFileSync(outPath, `${JSON.stringify(output)}\n`, 'utf8')
  console.log(counts)
  console.log(`Items: ${catalog.length}`)
  console.log(`Wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
