/**
 * Proprietary DFP formula — built into public/dfp-engine.js for canonical hosting.
 * Do not import this file from application code; use src/lib/dfp.ts instead.
 *
 * Pricing anchors: UEX 15d averages (Jun 2026). Ores/gems use kiosk Sell; salvage uses kiosk Buy +10%.
 * Craft total = materials + acquisition premium (rep grind) + small labor factor.
 * Ore-only ship components: ore lines × class/grade retail factor (wiki metadata) to anchor Q500 near shop buy.
 */

import { getAcquisitionPremium } from './acquisition-premiums.generated'
import { getOreRetailFactor } from './component-retail'

const MIN_SCU = 0.001
/**
 * Gems in craft recipes: fraction of UEX kiosk Sell (not liquidation value).
 * Calibrated so Q500 materials+labor ≈ in-game shop buy for store-sold items (e.g. 5CA Akura ~70k).
 */
const CRAFT_GEM_FACTOR = 0.00375
const CRAFT_LABOR_FACTOR = 0.08
const DFP_CRAFT_PREMIUM = 1.02
const DFP_ASSUMED_QUALITY = 500
const DFP_QUALITY_TIERS = [500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000]
const CARANITE_EFFORT_FACTOR = 1.35
const CARANITE_BASE_Q500 = 280_000

/**
 * Quality scaling table (multiplier vs Q500 = value / 50).
 * Q500-Q750: ~1.58x per 50Q (exponential).
 * Q800+: steeper scaling for rare high-quality resources:
 *   Q850: 1.5x bump (37.5x vs Q500)
 *   Q900: 5x requested (100x vs Q500)
 *   Q950: intermediate (500x vs Q500)
 *   Q1000: 10x requested (1000x vs Q500)
 */
const DFP_BASE_PER_001_cSCU: Record<number, number> = {
  500: 50, 550: 80, 600: 126, 650: 200, 700: 314, 750: 500, 800: 800,
  850: 1875, 900: 5000, 950: 25000, 1000: 50000,
}

const DFP_RESOURCE_ALIASES: Record<string, string> = {
  Savrilium: 'Savryllium',
  Quantanium: 'Quantainium',
  Carinite: 'Caranite',
  Pressurized_Ice: 'Pressurized Ice',
  rmc: 'RMC',
  construction_material: 'Construction Material',
}

const GEM_NAMES = new Set([
  'Aphorite', 'Beradom', 'Caranite', 'Dolivine', 'Feynmaline', 'Glacosite',
  'Hadanite', 'Janalite', 'Sadaryx',
])

const HARVEST_NAMES = new Set(['Yormandi Eye'])

const SHOP_SPECIAL_NAMES = new Set(['Saldynium (Ore)'])

const SALVAGE_NAMES = new Set(['RMC', 'Construction Material'])

/** UEX Sell avg per SCU @ ~Q500 — ores */
const DFP_Q500_PER_SCU: Record<string, number> = {
  Aluminum: 3672, Iron: 3421, Copper: 3758, Tin: 3953, Silicon: 2443, Quartz: 4423,
  Corundum: 3642, 'Pressurized Ice': 5209, Hephaestanite: 4606, Agricium: 9505,
  Titanium: 8212, Tungsten: 10468, Beryl: 19643, Laranite: 8578, Bexalite: 29045,
  Taranite: 24290, Borase: 27453, Gold: 30473, Ouratite: 45661, Torite: 7454,
  Lindinium: 44483, Savryllium: 113400, Quantainium: 141447, Aslarite: 4842,
  Stileron: 127143, Riccite: 65750,
}

/** UEX Buy avg per SCU + 10% org premium — salvage (Q0 only) */
const DFP_Q500_SALVAGE_PER_SCU: Record<string, number> = {
  RMC: 9060,
  'Construction Material': 10403,
}

/** UEX Sell avg per whole unit @ ~Q500 — kiosk gems + special items */
const DFP_Q500_PER_UNIT: Record<string, number> = {
  Dolivine: 146897, Aphorite: 101207, Hadanite: 543154, Janalite: 1581176,
  Beradom: 147789, Feynmaline: 345888, Glacosite: 99667, Sadaryx: 500000,
  Caranite: Math.round(CARANITE_BASE_Q500 * CARANITE_EFFORT_FACTOR),
  'Saldynium (Ore)': 34_000_000,
  'Yormandi Eye': 20_000_000,
}

const DFP_TYPE_MODIFIERS: Record<string, number> = {
  armor: 0.2, fps_weapon: 0.5, ammo: 0.12, vehicle_weapon: 0.45, mission_item: 1, other: 0.35,
}

const DFP_SHIP_SUBCATEGORY_MODIFIERS: Record<string, number | Record<string, number>> = {
  quantumdrive: { default: 0.4, S0: 0.55, S1: 0.52, S2: 0.28, S3: 0.24, S4: 0.22 },
  mininglaser: 2.2,
  radar: { default: 0.3, S0: 0.35, S1: 0.4, S2: 0.32, S3: 0.25, S4: 0.22 },
  cooler: { default: 1.8, S0: 1.1, S1: 2.1, S2: 2, S3: 1.8, S4: 1.6 },
  powerplant: { default: 0.85, S0: 2.1, S1: 1.2, S2: 0.75, S3: 0.6, S4: 0.55 },
  shield: { default: 0.9, S0: 1, S1: 0.95, S2: 0.9, S3: 0.85, S4: 0.8 },
  salvage: 1.8, tractorbeam: 1.5, refuelling: 0.5, default: 0.85,
}

type ResourceKind = 'ore' | 'gem' | 'harvest' | 'shop_special' | 'salvage'

function clampQuality(quality: number): number {
  if (quality <= DFP_QUALITY_TIERS[0]) return DFP_QUALITY_TIERS[0]
  if (quality >= DFP_QUALITY_TIERS[DFP_QUALITY_TIERS.length - 1]) {
    return DFP_QUALITY_TIERS[DFP_QUALITY_TIERS.length - 1]
  }
  let result = DFP_QUALITY_TIERS[0]
  for (const tier of DFP_QUALITY_TIERS) {
    if (quality >= tier) result = tier
    else break
  }
  return result
}

function resolveQuality(minQuality?: number): number {
  if (minQuality == null || minQuality <= 0) return DFP_ASSUMED_QUALITY
  return clampQuality(minQuality)
}

function resolveDfpResourceKey(name: string): string {
  return DFP_RESOURCE_ALIASES[name] ?? name
}

function resolveResourceKind(resourceName: string): ResourceKind {
  const key = resolveDfpResourceKey(resourceName)
  if (SALVAGE_NAMES.has(key)) return 'salvage'
  if (HARVEST_NAMES.has(key)) return 'harvest'
  if (SHOP_SPECIAL_NAMES.has(key)) return 'shop_special'
  if (GEM_NAMES.has(key)) return 'gem'
  return 'ore'
}

function qualityScale(quality: number, kind: ResourceKind): number {
  if (kind === 'salvage' || kind === 'harvest') return 1
  const tier = clampQuality(quality)
  const base500 = DFP_BASE_PER_001_cSCU[500]
  const baseTier = DFP_BASE_PER_001_cSCU[tier] ?? base500
  return baseTier / base500
}

function isWholeUnitBlueprintOption(option: {
  standardCargoUnits?: number
  quantity?: number
  resourceName?: string
  entityName?: string
}): boolean {
  const name = option.resourceName || option.entityName
  if (!name) return false
  const kind = resolveResourceKind(name)
  if (kind === 'gem' || kind === 'harvest' || kind === 'shop_special') return true
  return (option.standardCargoUnits ?? 0) <= 0 && (option.quantity ?? 0) > 0
}

function extractComponentSize(categoryName?: string): string | null {
  if (!categoryName) return null
  const match = categoryName.match(/S(\d+)/i)
  return match ? `S${match[1]}` : null
}

function resolveDfpProductType(blueprint: { categoryName?: string }): string {
  const category = blueprint.categoryName ?? ''
  if (category === 'FPSArmours') return 'armor'
  if (category === 'FPSWeapons') return 'fps_weapon'
  if (category === 'Ammo') return 'ammo'
  if (category === 'MissionItem') return 'mission_item'
  if (category.startsWith('Veh. Comp.')) return 'ship_component'
  if (category.startsWith('Veh. Weapons')) return 'vehicle_weapon'
  return 'other'
}

function resolveSubcategoryModifier(
  entry: number | Record<string, number> | undefined,
  size: string | null,
): number | null {
  if (entry == null) return null
  if (typeof entry === 'number') return entry
  if (size && entry[size] != null) return entry[size]
  if (entry.default != null) return entry.default
  return null
}

function getDfpTypeModifier(blueprint: { categoryName?: string; subCategoryName?: string }): number {
  const productType = resolveDfpProductType(blueprint)
  if (productType !== 'ship_component') {
    return (DFP_TYPE_MODIFIERS[productType] ?? DFP_TYPE_MODIFIERS.other) * DFP_CRAFT_PREMIUM
  }
  const sub = blueprint.subCategoryName ?? 'default'
  const size = extractComponentSize(blueprint.categoryName)
  const entry = DFP_SHIP_SUBCATEGORY_MODIFIERS[sub] ?? DFP_SHIP_SUBCATEGORY_MODIFIERS.default
  const fallback = resolveSubcategoryModifier(DFP_SHIP_SUBCATEGORY_MODIFIERS.default as Record<string, number>, size) ?? 0.85
  const modifier = resolveSubcategoryModifier(entry, size) ?? fallback
  return modifier * DFP_CRAFT_PREMIUM
}

export function calculateMaterialDfpPrice(
  resourceName: string,
  minQuality: number,
  amount: number,
): number {
  const resolved = resolveDfpResourceKey(resourceName)
  const kind = resolveResourceKind(resourceName)

  if (kind === 'salvage') {
    const perScu = DFP_Q500_SALVAGE_PER_SCU[resolved] ?? 9000
    const scu = Math.max(amount, MIN_SCU)
    return Math.round(perScu * scu)
  }

  if (kind === 'gem') {
    const perUnit = DFP_Q500_PER_UNIT[resolved] ?? 10_000
    const units = Math.max(1, Math.round(amount))
    const scale = qualityScale(minQuality, kind)
    return Math.round(perUnit * CRAFT_GEM_FACTOR * scale * units)
  }

  if (kind === 'shop_special' || kind === 'harvest') {
    const perUnit = DFP_Q500_PER_UNIT[resolved] ?? 10_000
    const units = Math.max(1, Math.round(amount))
    const scale = qualityScale(minQuality, kind)
    return Math.round(perUnit * scale * units)
  }

  const perScu = DFP_Q500_PER_SCU[resolved] ?? 5000
  const quality = resolveQuality(minQuality)
  const scu = Math.max(amount, MIN_SCU)
  const scale = qualityScale(quality, kind)
  return Math.round(perScu * scale * scu)
}

export function calculateBlueprintDfp(blueprint: {
  file?: string
  internalName?: string
  categoryName?: string
  subCategoryName?: string
  slots?: {
    requiredCount?: number
    options?: {
      resourceName?: string
      entityName?: string
      minQuality?: number
      standardCargoUnits?: number
      quantity?: number
    }[]
  }[]
}) {
  const lines: {
    resource: string
    quality: number
    scu: number
    baseValue: number
    modifier: number
    lineTotal: number
  }[] = []

  const oreRetailFactor = getOreRetailFactor(blueprint)

  for (const slot of blueprint.slots ?? []) {
    const slotCount = slot.requiredCount ?? 1
    for (const option of slot.options ?? []) {
      const resource = option.resourceName || option.entityName
      if (!resource) continue
      const quality = resolveQuality(option.minQuality)
      const optQty = option.quantity ?? 1
      const wholeUnit = isWholeUnitBlueprintOption(option)
      const amount = wholeUnit
        ? slotCount * optQty
        : (option.standardCargoUnits ?? MIN_SCU) * slotCount * optQty
      let lineTotal = calculateMaterialDfpPrice(resource, quality, amount)
      if (oreRetailFactor !== 1 && resolveResourceKind(resource) === 'ore') {
        lineTotal = Math.round(lineTotal * oreRetailFactor)
      }
      lines.push({
        resource,
        quality,
        scu: amount,
        baseValue: lineTotal,
        modifier: 1,
        lineTotal,
      })
    }
  }

  const rawMaterialTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const typeModifier = getDfpTypeModifier(blueprint)
  const materialTotal = Math.round(rawMaterialTotal * typeModifier)
  const acquisitionPremium = getAcquisitionPremium(blueprint.file)
  const craftLaborPremium = Math.round(materialTotal * CRAFT_LABOR_FACTOR)
  const total = materialTotal + acquisitionPremium + craftLaborPremium
  return {
    materialTotal,
    acquisitionPremium,
    craftLaborPremium,
    typeModifier,
    total,
    lines,
  }
}

export function calculateBlueprintDfpForOrder(
  blueprint: Parameters<typeof calculateBlueprintDfp>[0],
  orderMinQuality: number,
  craftQuantity = 1,
) {
  const quality = resolveQuality(orderMinQuality)
  const qty = Math.max(1, craftQuantity)
  const adjusted = {
    file: blueprint.file,
    categoryName: blueprint.categoryName,
    subCategoryName: blueprint.subCategoryName,
    slots: (blueprint.slots ?? []).map((slot) => ({
      requiredCount: slot.requiredCount,
      options: (slot.options ?? []).map((option) => ({ ...option, minQuality: quality })),
    })),
  }
  const unitResult = calculateBlueprintDfp(adjusted)
  const total = Math.round(unitResult.total * qty)
  return {
    ...unitResult,
    materialTotal: Math.round(unitResult.materialTotal * qty),
    acquisitionPremium: Math.round(unitResult.acquisitionPremium * qty),
    craftLaborPremium: Math.round(unitResult.craftLaborPremium * qty),
    total,
  }
}

export function isAmmoBlueprint(blueprint: { categoryName?: string }): boolean {
  return resolveDfpProductType(blueprint) === 'ammo'
}
