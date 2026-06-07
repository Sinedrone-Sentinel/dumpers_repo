export const DFP_VERSION = '1.0.0-scale0.1'

/** Global calibration — spec may need ÷10 on base values */
export const DFP_SCALE_FACTOR = 0.1

export const DFP_ASSUMED_QUALITY = 500

export const DFP_QUALITY_TIERS = [500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000] as const

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
}
