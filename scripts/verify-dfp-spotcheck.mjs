import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/data/game-blueprints.json'), 'utf8'))
const commodityBases = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/dfp-commodity-bases.json'), 'utf8')
)
const engine = await import(pathToFileURL(path.join(root, 'public/dfp-engine.js')).href)
const qualityBands = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/game-quality-bands.json'), 'utf8')
)

function band4Defaults(bp) {
  const qualities = {}
  for (let i = 0; i < (bp.slots ?? []).length; i++) {
    qualities[i] = 500
  }
  return qualities
}

function partsFromQualities(slotQualities) {
  return Object.entries(slotQualities).map(([idx, quality]) => ({
    slotIndex: Number(idx),
    quality,
  }))
}

function dfpWithParts(bp, slotQualities, craftQuantity = 1) {
  return engine.calculateBlueprintDfp(bp, {
    parts: partsFromQualities(slotQualities),
    craftQuantity,
  })
}

function dfpUniform(bp, quality, craftQuantity = 1) {
  const parts = (bp.slots ?? []).map((_, i) => ({ slotIndex: i, quality }))
  return engine.calculateBlueprintDfp(bp, { parts, craftQuantity })
}

const behrSmg = catalog.blueprints.find((b) => b.internalName === 'behr_smg_ballistic_01')
const igniter = catalog.blueprints.find((b) => b.internalName === 'lbco_sniper_energy_01_sunset01')

if (behrSmg) {
  const defaults = band4Defaults(behrSmg)
  const cardDfp = dfpWithParts(behrSmg, defaults)
  const uniform700 = dfpUniform(behrSmg, 700)
  console.log(`P8-SC SMG Band4-default total: ${cardDfp.total.toLocaleString()}`)
  console.log(`P8-SC SMG uniform Q700 total: ${uniform700.total.toLocaleString()}`)
}

if (igniter) {
  const mixed = { ...band4Defaults(igniter) }
  const gemSlotIdx = igniter.slots.findIndex((s) =>
    s.options?.some((o) => o.displayName === 'Dolivine' || o.entityName === 'Dolivine')
  )
  if (gemSlotIdx >= 0) mixed[gemSlotIdx] = 1000
  const mixedTotal = dfpWithParts(igniter, mixed)
  const minFloor = dfpUniform(igniter, Math.min(...Object.values(mixed)))
  console.log(`Igniter mixed Q1000 gem + Band4 ores: ${mixedTotal.total.toLocaleString()}`)
  console.log(`Igniter old min-floor would be: ${minFloor.total.toLocaleString()}`)
  console.log(`Mixed > min-floor: ${mixedTotal.total > minFloor.total}`)
}

const ammoMag = catalog.blueprints.find((b) => b.internalName === 'behr_shotgun_ballistic_01_mag')
if (ammoMag) {
  const ammo = engine.calculateBlueprintDfp(ammoMag, {
    bandThresholdsForResource: (name) => qualityBands.bandThresholds[name.toLowerCase()],
  })
  console.log(`BR-2 mag (ammo, Q1 commodity): ${ammo.total.toLocaleString()}`)
  console.assert(ammo.acquisitionPremium === 0, 'Ammo must not include acquisition premium')
  console.assert(ammo.total < 10_000, 'Ammo DFP must be commodity-scale, not mission-reward premium')
}

const targets = ['behr_shotgun_ballistic_01', 'lbco_sniper_energy_01_sunset01', 'carryable_2h_cy_collectormaterial_001']

for (const id of targets) {
  const bp = catalog.blueprints.find((b) => b.internalName === id)
  if (!bp) {
    console.log(`${id}: NOT FOUND`)
    continue
  }
  const result = dfpWithParts(bp, band4Defaults(bp))
  console.log(`${id} (${bp.blueprintName}) Band4-default total: ${result.total.toLocaleString()}`)
}

console.log('\n--- Resource Tracker Q0 commodity bases ---')

const agSupply = commodityBases.resources.agricultural_supplies
const agPrice = engine.calculateMaterialDfpPrice('Agricultural Supplies', 0, 100)
const agExpected = agSupply.basePerScu * 100
console.log(`Agricultural Supplies 100 SCU @ Q0: ${agPrice.toLocaleString()} (expected ~${agExpected.toLocaleString()})`)
console.assert(agPrice !== 500_000, 'Agricultural Supplies should not use 5k/SCU fallback')

const argonPrice = engine.calculateMaterialDfpPrice('argon', 0, 50)
const argonQ500 = engine.calculateMaterialDfpPrice('argon', 500, 50)
console.log(`Argon 50 SCU internalName @ Q0: ${argonPrice.toLocaleString()} (Q500 same: ${argonQ500 === argonPrice})`)
console.assert(argonPrice === argonQ500, 'Commodity Q0 must equal Q500 (flat base)')

const scrapBase = commodityBases.resources.scrap
const scrapPrice = engine.calculateMaterialDfpPrice('Scrap', 0, 10)
console.log(`Scrap 10 SCU @ Q0: ${scrapPrice.toLocaleString()} (expected ${scrapBase.basePerScu * 10})`)

const rmcBase = commodityBases.resources.rmc
const rmcByDisplay = engine.calculateMaterialDfpPrice('RMC (Recycled Material Composite)', 0, 10)
const rmcByInternal = engine.calculateMaterialDfpPrice('rmc', 0, 10)
const rmcByUex = engine.calculateMaterialDfpPrice('Recycled Material Composite', 0, 10)
console.log(`RMC 10 SCU via display/internal/uex: ${rmcByDisplay}/${rmcByInternal}/${rmcByUex}`)
console.assert(
  rmcByDisplay === rmcByInternal && rmcByInternal === rmcByUex,
  'All three name forms must resolve to same RMC price'
)
console.assert(rmcByDisplay === rmcBase.basePerScu * 10, 'RMC salvage buy anchor')

console.log('\n--- Banded ore pricing ---')

const berylBands = qualityBands.bandThresholds.beryl
const ironBands = qualityBands.bandThresholds.iron
const qty = 300

const berylQ0 = engine.calculateMaterialDfpPrice('Beryl', 500, qty, berylBands)
const berylBand1 = engine.calculateMaterialDfpPrice('Beryl', berylBands[0], qty, berylBands)
const berylBand2 = engine.calculateMaterialDfpPrice('Beryl', berylBands[1], qty, berylBands)
const berylBand4 = engine.calculateMaterialDfpPrice('Beryl', berylBands[3], qty, berylBands)

console.log(`Beryl ${qty} SCU Q0 (Q500 purchased): ${berylQ0.toLocaleString()}`)
console.log(`Beryl ${qty} SCU Band1 Q${berylBands[0]}: ${berylBand1.toLocaleString()}`)
console.log(`Beryl ${qty} SCU Band2 Q${berylBands[1]}: ${berylBand2.toLocaleString()}`)
console.log(`Beryl ${qty} SCU Band4 Q${berylBands[3]}: ${berylBand4.toLocaleString()}`)

console.assert(berylBand1 < berylQ0, 'Beryl Band 1 must be below Q0 (Q500 purchased)')
console.assert(berylBand2 > berylBand1, 'Beryl Band 2 must exceed Band 1')
console.assert(berylBand4 > berylBand2, 'Beryl Band 4 must exceed Band 2 via quality engine')
console.assert(
  berylBand2 !== Math.round(19643 * (80 / 50) * qty),
  'Beryl Band 2 must not snap to Q550 tier price'
)
const berylBand2Scale = Math.exp(Math.log(1) + ((berylBands[1] - 500) / 50) * Math.log(80 / 50))
console.assert(
  berylBand2 === Math.round(19643 * qty * berylBand2Scale),
  'Beryl Band 2 uses exact band Q log-linear scale'
)

const ironQ0 = engine.calculateMaterialDfpPrice('Iron', 500, qty, ironBands)
const ironBand1 = engine.calculateMaterialDfpPrice('Iron', ironBands[0], qty, ironBands)
const ironBand4 = engine.calculateMaterialDfpPrice('Iron', ironBands[3], qty, ironBands)

console.log(`Iron ${qty} SCU Q0 (Q500): ${ironQ0.toLocaleString()}`)
console.log(`Iron ${qty} SCU Band4 Q${ironBands[3]}: ${ironBand4.toLocaleString()}`)

console.assert(ironBand1 < ironQ0, 'Iron Band 1 must be below Q0 (Q500 purchased)')
console.assert(ironBand4 > ironQ0, 'Iron Band 4 must exceed Q0 purchased anchor')
