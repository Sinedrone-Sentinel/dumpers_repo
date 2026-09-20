/**
 * Compact mining catalog for the Smart Cracker advisor Edge Function.
 * Display names only in member-facing fields. Internal names stay off the prompt.
 */

const EXCLUDED_LASER_NAME = /_test(_|$)|template|_mpuv_/i

/** Ship hardpoints — display names only. Must match src/lib/miningVessels.ts. */
const VESSELS = [
  { displayName: 'Prospector', laserHardpoints: 1, laserSize: 1 },
  { displayName: 'Mole', laserHardpoints: 3, laserSize: 2 },
  { displayName: 'Golem', laserHardpoints: 1, laserSize: 1, fixedHead: 'Pitman Mining Laser' },
  { displayName: 'ROC', laserHardpoints: 1, laserSize: 0 },
  { displayName: 'ROC-DS', laserHardpoints: 1, laserSize: 0 },
]

function isProductionLaser(laser) {
  return !EXCLUDED_LASER_NAME.test(laser?.name ?? '')
}

function windowRating(thinness) {
  if (!Number.isFinite(thinness)) return null
  if (thinness >= 2) return 'very narrow'
  if (thinness >= 1) return 'narrow'
  if (thinness > 0) return 'average'
  return 'wide'
}

function oreDisplayName(name) {
  const raw = String(name ?? '')
  if (raw.startsWith('Ore_')) return raw.slice(4).replace(/_/g, ' ')
  if (raw.startsWith('Raw_')) return raw.slice(4).replace(/_/g, ' ')
  return raw.replace(/_/g, ' ')
}

function oreResistanceHudPercent(value) {
  if (!Number.isFinite(value)) return null
  if (Math.abs(value) <= 1.5) return Math.round(value * 1000) / 10
  return value
}

function compactModifiers(row) {
  return {
    resistance: row.resistanceModifier ?? 0,
    instability: row.instabilityModifier ?? 0,
    window: row.optimalWindowModifier ?? 0,
    windowRate: row.optimalWindowRateModifier ?? 0,
    filter: row.filterModifier ?? 0,
    shatter: row.shatterDamageModifier ?? 0,
    cluster: row.clusterFactorModifier ?? 0,
    overchargeRate: row.catastrophicChargeWindowRateModifier ?? 0,
  }
}

export function buildMiningAdvisorCatalog(gameMining) {
  const seenLasers = new Set()
  const lasers = []
  for (const laser of gameMining.miningLasers ?? []) {
    if (!isProductionLaser(laser)) continue
    const displayName = laser.displayName
    if (!displayName) continue
    const key = displayName.toLowerCase() + '|' + String(laser.size)
    if (seenLasers.has(key)) continue
    seenLasers.add(key)
    lasers.push({
      uuid: laser.id ?? null,
      displayName,
      size: laser.size,
      mw: laser.laserPower,
      slots: laser.moduleSlotCount,
      ...compactModifiers(laser),
    })
  }
  lasers.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.size - b.size)

  const modules = (gameMining.miningModules ?? [])
    .filter((mod) => mod.displayName)
    .map((mod) => ({
      uuid: mod.id ?? null,
      displayName: mod.displayName,
      kind: mod.kind,
      powerMultiplier: mod.powerMultiplier ?? 1,
      ...compactModifiers(mod),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const gadgets = (gameMining.miningGadgets ?? [])
    .filter((g) => g.displayName)
    .map((g) => ({
      uuid: g.id ?? null,
      displayName: g.displayName,
      resistance: g.resistanceModifier ?? 0,
      instability: g.instabilityModifier ?? 0,
      window: g.optimalWindowModifier ?? 0,
      windowRate: g.optimalWindowRateModifier ?? 0,
      cluster: g.clusterFactorModifier ?? 0,
      shatter: g.shatterDamageModifier ?? 0,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const ores = (gameMining.mineableElements ?? [])
    .filter((el) => el.isShip && (el.name?.startsWith('Ore_') || el.name?.startsWith('Raw_')))
    .map((el) => ({
      displayName: oreDisplayName(el.name),
      resistanceHudPercent: oreResistanceHudPercent(el.resistance),
      instability: el.instability,
      windowThinness: el.optimalWindowThinness,
      windowRating: windowRating(el.optimalWindowThinness),
      cluster: el.clusterFactor,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  return {
    lasers,
    modules,
    gadgets,
    ores,
    vessels: VESSELS,
  }
}

function normalizeGearName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Join the baked UEX gear shop index (src/data/mining-gear-shops.json) onto the advisor
 * catalog by Star Citizen uuid, so the Edge Function can answer "where can I buy X"
 * using our display names only.
 *
 * Scope is the mining catalog itself — if a piece of gear is not a head, module or
 * gadget we advise on, it has no shop row and the advisor cannot answer for it.
 */
export function buildAdvisorGearShops(catalog, gearShops) {
  const shopByUuid = new Map()
  const shopByName = new Map()
  for (const item of gearShops?.items ?? []) {
    if (item?.uuid) shopByUuid.set(item.uuid, item)
    const key = normalizeGearName(item?.name)
    if (key && !shopByName.has(key)) shopByName.set(key, item)
  }

  const usedTerminalIds = new Set()
  const items = []
  const missing = []

  const addGear = (entry, kind) => {
    // uuid is the reliable key, but UEX sometimes files a listing under a variant uuid
    // we exclude (e.g. Arbor MH1 sits on the MPUV arm), so fall back to display name.
    const shop =
      (entry.uuid ? shopByUuid.get(entry.uuid) : null) ??
      shopByName.get(normalizeGearName(entry.displayName))
    if (!shop) missing.push(`${entry.displayName} (${kind})`)

    for (const listing of shop?.listings ?? []) usedTerminalIds.add(listing.t)
    // Gear with no listing stays in the index on purpose: the advisor must be able to
    // say "UEX has no buy location on record" instead of treating it as unknown gear.
    items.push({
      displayName: entry.displayName,
      kind,
      // Every known terminal, cheapest first — never a truncated sample.
      listings: (shop?.listings ?? []).map((l) => ({ t: l.t, buy: l.buy })),
    })
  }

  for (const laser of catalog.lasers ?? []) addGear(laser, 'head')
  for (const mod of catalog.modules ?? []) addGear(mod, 'module')
  for (const gadget of catalog.gadgets ?? []) addGear(gadget, 'gadget')

  const terminals = (gearShops?.terminals ?? [])
    .filter((t) => usedTerminalIds.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, system: t.system ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    payload: {
      generatedAt: gearShops?.generatedAt ?? null,
      attribution: gearShops?.attribution ?? 'Powered by UEX',
      sourceUrl: gearShops?.sourceUrl ?? 'https://uexcorp.space',
      gameVersions: gearShops?.gameVersions ?? [],
      terminals,
      items: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    },
    missing,
  }
}

/** uuids are a join key only — they must never reach the model prompt. */
export function stripCatalogUuids(catalog) {
  const drop = ({ uuid: _uuid, ...rest }) => rest
  return {
    ...catalog,
    lasers: (catalog.lasers ?? []).map(drop),
    modules: (catalog.modules ?? []).map(drop),
    gadgets: (catalog.gadgets ?? []).map(drop),
  }
}

export function assertAdvisorGearShopsShape(shops) {
  if (!shops?.items?.length) throw new Error('Advisor gear shops missing items')
  if (!shops?.terminals?.length) throw new Error('Advisor gear shops missing terminals')
  const canary = shops.items.find((i) => i.displayName === 'Hofstede-S2 Mining Laser')
  if (!canary?.listings?.length) {
    throw new Error('Advisor gear shops missing Hofstede-S2 buy locations')
  }
  const terminalIds = new Set(shops.terminals.map((t) => t.id))
  for (const item of shops.items) {
    for (const listing of item.listings ?? []) {
      if (!terminalIds.has(listing.t)) {
        throw new Error(`Gear shop listing for ${item.displayName} points at unknown terminal`)
      }
    }
  }
  return true
}

export function assertAdvisorCatalogShape(catalog) {
  if (!catalog || !Array.isArray(catalog.lasers) || !catalog.lasers.length) {
    throw new Error('Advisor catalog missing lasers')
  }
  if (!catalog.modules?.length) throw new Error('Advisor catalog missing modules')
  if (!catalog.gadgets?.length) throw new Error('Advisor catalog missing gadgets')
  if (!catalog.ores?.length) throw new Error('Advisor catalog missing ores')
  const q = catalog.ores.find((o) => /quantainium/i.test(o.displayName))
  if (!q) throw new Error('Advisor catalog missing Quantainium')
  const lancet = catalog.lasers.find((l) => l.displayName === 'Lancet MH1 Mining Laser')
  if (!lancet || lancet.slots !== 1) throw new Error('Lancet MH1 must have 1 module port')
  if (!catalog.vessels?.some((v) => v.displayName === 'Prospector' && v.laserHardpoints === 1 && v.laserSize === 1)) {
    throw new Error('Advisor catalog missing Prospector hardpoints')
  }
  return true
}
