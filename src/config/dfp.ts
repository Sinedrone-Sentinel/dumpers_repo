import { isSalvageResource, SALVAGE_ORDER_MIN_QUALITY } from './extraResources'

export const DFP_VERSION = '1.1.0-type-modifiers'

/** Applied after material total — keeps DFP at or above NPC shop for crafted goods. */
export const DFP_CRAFT_PREMIUM = 1.02

/** Global calibration — spec may need ÷10 on base values */
export const DFP_SCALE_FACTOR = 0.1

export const DFP_ASSUMED_QUALITY = 500

/** Internal DFP math tiers (50-point steps for base value lookup). */
export const DFP_QUALITY_TIERS = [500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000] as const

/** Q0 = store-bought; Q10–Q1000 = mined/refined in 10-point steps. */
export const STOCK_QUALITY_TIERS: readonly number[] = [
  0,
  ...Array.from({ length: 100 }, (_, i) => (i + 1) * 10),
]

/** Min quality on buy orders (non-ammo). Same tiers as personal stock cards. */
export const ORDER_QUALITY_TIERS = STOCK_QUALITY_TIERS

/** Default picker value for crafted goods and refined stock. */
export const DEFAULT_STOCK_QUALITY = 500

/** Stored on ammo blueprint order lines — no customer min quality requirement. */
export const AMMO_ORDER_MIN_QUALITY = 0

export function stockQualityTiersForResource(
  resourceKey: string,
  label?: string
): readonly number[] {
  if (isSalvageResource(resourceKey)) return [SALVAGE_ORDER_MIN_QUALITY]
  return STOCK_QUALITY_TIERS
}

export function orderMinQualityForResource(
  resourceKey: string,
  label: string,
  selectedQuality: number
): number {
  if (isSalvageResource(resourceKey)) return SALVAGE_ORDER_MIN_QUALITY
  return selectedQuality
}

/** aUEC per 0.001 cSCU at each quality tier */
export const DFP_BASE_PER_001_cSCU: Record<number, number> = {
  500: 50,
  550: 80,
  600: 126,
  650: 200,
  700: 314,
  750: 500,
  800: 800,
  850: 1254,
  900: 2000,
  950: 4750,
  1000: 5000,
}

/** Default modifier for resources not in the rarity table (Aluminum tier) */
export const DFP_DEFAULT_MODIFIER = 2

export const DFP_RARITY_MODIFIERS: Record<string, number> = {
  Aluminum: 2,
  Copper: 4,
  Tin: 6,
  Silicon: 8,
  Quartz: 10,
  Corundum: 12,
  Steel: 14,
  Ouratite: 16,
  'Ships (Scrap/Salvage Parts)': 18,
  RMC: 18,
  'Construction Material': 18,
  'HexaPolyMesh Coating (HPMC)': 20,
  Tungsten: 22,
  Titanium: 24,
  Diamond: 26,
  Iodine: 28,
  Beryl: 30,
  Cobalt: 32,
  Laranite: 34,
  Agricium: 36,
  Bexalite: 38,
  Taranite: 40,
  Borase: 42,
  Gold: 44,
  Hephaestanite: 46,
  Atlassium: 48,
  Stileron: 50,
  Osmium: 52,
  Lindinium: 54,
  Caranite: 56,
  Savryllium: 58,
  Quantainium: 60,
  Aslarite: 62,
  Dolivine: 64,
  Aphorite: 66,
  Hadanite: 68,
  Janalite: 70,
}

/** Blueprint JSON name → DFP rarity table key */
export const DFP_RESOURCE_ALIASES: Record<string, string> = {
  Savrilium: 'Savryllium',
  Quantanium: 'Quantainium',
  Carinite: 'Caranite',
  Pressurized_Ice: 'Pressurized Ice',
  rmc: 'RMC',
  construction_material: 'Construction Material',
}

export type DfpProductType = 'armor' | 'fps_weapon' | 'ammo' | 'vehicle_weapon' | 'ship_component' | 'mission_item' | 'other'

export type DfpSizeKey = 'default' | 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'

export type DfpSubcategoryModifier = number | Partial<Record<DfpSizeKey, number>>

/**
 * Post-material multipliers by product type.
 * Calibrated vs NPC shop prices (UEX ~4.8) — targets at or slightly above shop
 * to reflect blueprint acquisition, mining, and quality RNG.
 */
export const DFP_TYPE_MODIFIERS: Record<Exclude<DfpProductType, 'ship_component'>, number> = {
  armor: 0.2,
  fps_weapon: 0.5,
  ammo: 0.12,
  vehicle_weapon: 0.45,
  mission_item: 1,
  other: 0.35,
}

/** Ship component subcategory modifiers; size keys override `default` when present. */
export const DFP_SHIP_SUBCATEGORY_MODIFIERS: Record<string, DfpSubcategoryModifier> = {
  quantumdrive: { default: 0.4, S0: 0.55, S1: 0.52, S2: 0.28, S3: 0.24, S4: 0.22 },
  mininglaser: 2.2,
  radar: { default: 0.3, S0: 0.35, S1: 0.4, S2: 0.32, S3: 0.25, S4: 0.22 },
  cooler: { default: 1.8, S0: 1.1, S1: 2.1, S2: 2, S3: 1.8, S4: 1.6 },
  powerplant: { default: 0.85, S0: 2.1, S1: 1.2, S2: 0.75, S3: 0.6, S4: 0.55 },
  shield: { default: 0.9, S0: 1, S1: 0.95, S2: 0.9, S3: 0.85, S4: 0.8 },
  salvage: 1.8,
  tractorbeam: 1.5,
  refuelling: 0.5,
  default: 0.85,
}
