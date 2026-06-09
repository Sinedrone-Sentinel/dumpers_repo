/**
 * Proprietary DFP formula — built into public/dfp-engine.js for canonical hosting.
 * Do not import this file from application code; use src/lib/dfp.ts instead.
 */

const MIN_SCU = 0.001
const DFP_CRAFT_PREMIUM = 1.02
const DFP_SCALE_FACTOR = 0.1
const DFP_ASSUMED_QUALITY = 500
const DFP_QUALITY_TIERS = [500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000]
const DFP_DEFAULT_MODIFIER = 2

const DFP_BASE_PER_001_cSCU: Record<number, number> = {
  500: 50, 550: 80, 600: 126, 650: 200, 700: 314, 750: 500, 800: 800,
  850: 1254, 900: 2000, 950: 4750, 1000: 5000,
}

const DFP_RARITY_MODIFIERS: Record<string, number> = {
  Aluminum: 2, Copper: 4, Tin: 6, Silicon: 8, Quartz: 10, Corundum: 12, Steel: 14,
  Ouratite: 16, 'Ships (Scrap/Salvage Parts)': 18, RMC: 18, 'Construction Material': 18,
  'HexaPolyMesh Coating (HPMC)': 20, Tungsten: 22, Titanium: 24, Diamond: 26, Iodine: 28,
  Beryl: 30, Cobalt: 32, Laranite: 34, Agricium: 36, Bexalite: 38, Taranite: 40, Borase: 42,
  Gold: 44, Hephaestanite: 46, Atlassium: 48, Stileron: 50, Osmium: 52, Lindinium: 54,
  Caranite: 56, Savryllium: 58, Quantainium: 60, Aslarite: 62, Dolivine: 64, Aphorite: 66,
  Hadanite: 68, Janalite: 70,
}

const DFP_RESOURCE_ALIASES: Record<string, string> = {
  Savrilium: 'Savryllium', Quantanium: 'Quantainium', Carinite: 'Caranite',
  Pressurized_Ice: 'Pressurized Ice', rmc: 'RMC', construction_material: 'Construction Material',
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

function getRarityModifier(resourceName: string): number {
  return DFP_RARITY_MODIFIERS[resolveDfpResourceKey(resourceName)] ?? DFP_DEFAULT_MODIFIER
}

function baseValueForScu(quality: number, scu: number): number {
  const tier = clampQuality(quality)
  const per001 = DFP_BASE_PER_001_cSCU[tier] ?? DFP_BASE_PER_001_cSCU[DFP_ASSUMED_QUALITY]
  const effectiveScu = Math.max(scu, MIN_SCU)
  return per001 * (effectiveScu / MIN_SCU) * DFP_SCALE_FACTOR
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
  scuQuantity: number,
): number {
  const quality = resolveQuality(minQuality)
  const scu = Math.max(scuQuantity, MIN_SCU)
  const base = baseValueForScu(quality, scu)
  const modifier = getRarityModifier(resourceName)
  return Math.round(base * modifier)
}

export function calculateBlueprintDfp(blueprint: {
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

  for (const slot of blueprint.slots ?? []) {
    const slotCount = slot.requiredCount ?? 1
    for (const option of slot.options ?? []) {
      const resource = option.resourceName || option.entityName
      if (!resource) continue
      const quality = resolveQuality(option.minQuality)
      const units = option.standardCargoUnits ?? MIN_SCU
      const optQty = option.quantity ?? 1
      const scu = units * slotCount * optQty
      const base = baseValueForScu(quality, scu)
      const modifier = getRarityModifier(resource)
      const lineTotal = base * modifier
      lines.push({ resource, quality, scu, baseValue: base, modifier, lineTotal })
    }
  }

  const materialTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const typeModifier = getDfpTypeModifier(blueprint)
  const total = Math.round(materialTotal * typeModifier)
  return { materialTotal, typeModifier, total, lines }
}

export function calculateBlueprintDfpForOrder(
  blueprint: Parameters<typeof calculateBlueprintDfp>[0],
  orderMinQuality: number,
  craftQuantity = 1,
) {
  const quality = resolveQuality(orderMinQuality)
  const qty = Math.max(1, craftQuantity)
  const adjusted = {
    categoryName: blueprint.categoryName,
    subCategoryName: blueprint.subCategoryName,
    slots: (blueprint.slots ?? []).map((slot) => ({
      requiredCount: slot.requiredCount,
      options: (slot.options ?? []).map((option) => ({ ...option, minQuality: quality })),
    })),
  }
  const unitResult = calculateBlueprintDfp(adjusted)
  const total = Math.round(unitResult.total * qty)
  return { ...unitResult, total }
}

export function isAmmoBlueprint(blueprint: { categoryName?: string }): boolean {
  return resolveDfpProductType(blueprint) === 'ammo'
}
