/**
 * Fetch UEX commodity buy/sell location index for the Shop Lookup page.
 *
 * "Powered by UEX" — this data (which terminal buys/sells which commodity, and the
 * commodity box/container sizes) is crowdsourced by UEX Corp (https://uexcorp.space).
 * We bake a compact index into the app so lookups work offline and without a runtime
 * dependency on the UEX API. Re-run when it drifts: `npm run fetch-shop-data`.
 *
 * Output: src/data/shop-commodity-index.json
 *   - commodities: catalog (name, code, kind, refined/raw/mineral flags)
 *   - terminals:   commodity terminals with full location hierarchy + amenity flags
 *   - listings:    per (commodity, terminal) — can the player BUY and/or SELL here,
 *                  per-SCU prices, plus container (SCU box) sizes offered
 *
 * UEX semantics (player perspective):
 *   - status_sell / price_sell  -> the player can SELL here (terminal buys from you)
 *   - status_buy  / price_buy   -> the player can BUY here  (terminal sells to you)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outPath = path.join(root, 'src/data/shop-commodity-index.json')

const UEX = 'https://api.uexcorp.space/2.0'

async function fetchUex(endpoint) {
  const res = await fetch(`${UEX}/${endpoint}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'DumpersRepo-ShopLookup' },
  })
  if (!res.ok) throw new Error(`UEX ${endpoint} failed: ${res.status}`)
  const payload = await res.json()
  return payload.data ?? payload
}

function bool(v) {
  return v === 1 || v === true
}

/** Trim + null out empty/placeholder location names. */
function cleanName(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

/** Prefer UEX avg price when present; otherwise spot. Returns null when no usable price. */
function pricePerScu(spot, avg) {
  const a = Number(avg) || 0
  const s = Number(spot) || 0
  const value = a > 0 ? a : s > 0 ? s : 0
  return value > 0 ? Math.round(value) : null
}

async function main() {
  console.log('Fetching UEX commodities, terminals, and prices...')
  const [commoditiesRaw, terminalsRaw, pricesRaw] = await Promise.all([
    fetchUex('commodities'),
    fetchUex('terminals?type=commodity'),
    fetchUex('commodities_prices_all'),
  ])

  // --- Commodities ---------------------------------------------------------
  const commodities = []
  const commodityById = new Map()
  for (const c of commoditiesRaw) {
    if (!bool(c.is_available) || !bool(c.is_visible)) continue
    const entry = {
      id: c.id,
      name: c.name,
      code: c.code ?? null,
      kind: c.kind ?? null,
      isRefined: bool(c.is_refined),
      isRaw: bool(c.is_raw),
      isMineral: bool(c.is_mineral),
      isHarvestable: bool(c.is_harvestable),
      isIllegal: bool(c.is_illegal),
    }
    commodities.push(entry)
    commodityById.set(c.id, entry)
  }

  // --- Terminals -----------------------------------------------------------
  const terminals = []
  const terminalById = new Map()
  for (const t of terminalsRaw) {
    if (!bool(t.is_available) || !bool(t.is_visible)) continue
    const entry = {
      id: t.id,
      name: t.name,
      nickname: cleanName(t.nickname),
      code: cleanName(t.code),
      system: cleanName(t.star_system_name),
      planet: cleanName(t.planet_name),
      orbit: cleanName(t.orbit_name),
      moon: cleanName(t.moon_name),
      station: cleanName(t.space_station_name),
      city: cleanName(t.city_name),
      outpost: cleanName(t.outpost_name),
      isRefinery: bool(t.is_refinery),
      hasFreightElevator: bool(t.has_freight_elevator),
      hasLoadingDock: bool(t.has_loading_dock),
    }
    terminals.push(entry)
    terminalById.set(t.id, entry)
  }

  // --- Listings (commodity <-> terminal) -----------------------------------
  const listings = []
  let skippedNoRef = 0
  for (const p of pricesRaw) {
    if (!commodityById.has(p.id_commodity) || !terminalById.has(p.id_terminal)) {
      skippedNoRef++
      continue
    }
    const canBuy = bool(p.status_buy) || (p.price_buy ?? 0) > 0
    const canSell = bool(p.status_sell) || (p.price_sell ?? 0) > 0
    if (!canBuy && !canSell) continue
    const sellPrice = canSell ? pricePerScu(p.price_sell, p.price_sell_avg) : null
    const buyPrice = canBuy ? pricePerScu(p.price_buy, p.price_buy_avg) : null
    listings.push({
      c: p.id_commodity,
      t: p.id_terminal,
      buy: canBuy,
      sell: canSell,
      box: cleanName(p.container_sizes),
      ...(sellPrice != null ? { ps: sellPrice } : {}),
      ...(buyPrice != null ? { pb: buyPrice } : {}),
    })
  }

  // Keep only commodities/terminals that actually appear in a listing.
  const usedCommodityIds = new Set(listings.map((l) => l.c))
  const usedTerminalIds = new Set(listings.map((l) => l.t))
  const commoditiesOut = commodities
    .filter((c) => usedCommodityIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const terminalsOut = terminals
    .filter((t) => usedTerminalIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'UEX Corp',
    sourceUrl: 'https://uexcorp.space',
    attribution: 'Powered by UEX',
    endpoints: ['/2.0/commodities', '/2.0/terminals?type=commodity', '/2.0/commodities_prices_all'],
    note: 'Commodity buy/sell locations, per-SCU prices (UEX avg when available), and box sizes crowdsourced by UEX Corp.',
    commodityCount: commoditiesOut.length,
    terminalCount: terminalsOut.length,
    listingCount: listings.length,
    commodities: commoditiesOut,
    terminals: terminalsOut,
    listings,
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(output) + '\n', 'utf8')

  console.log(`Commodities: ${commoditiesOut.length}`)
  console.log(`Terminals:   ${terminalsOut.length}`)
  console.log(`Listings:    ${listings.length} (skipped ${skippedNoRef} with unknown commodity/terminal)`)
  const systems = new Map()
  for (const t of terminalsOut) systems.set(t.system ?? '—', (systems.get(t.system ?? '—') ?? 0) + 1)
  console.log('Terminals by system:', Object.fromEntries([...systems].sort()))
  console.log(`\nWrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
