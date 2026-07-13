import type { ExtractedBlueprintResource } from '../lib/blueprintResources'

/**
 * Trade commodities and materials not present in blueprint JSON.
 * Sourced from UEX Corp API: https://api.uexcorp.uk/2.0/commodities
 */
export const EXTRA_CATALOG_RESOURCES: ExtractedBlueprintResource[] = [
  // === SALVAGE / SCRAP ===
  { resourceKey: 'rmc', label: 'RMC (Recycled Material Composite)' },
  { resourceKey: 'construction_material', label: 'Construction Material' },
  { resourceKey: 'construction_material_pebbles', label: 'Construction Material Pebbles' },
  { resourceKey: 'construction_material_rubble', label: 'Construction Material Rubble' },
  { resourceKey: 'construction_material_salvage', label: 'Construction Material Salvage' },
  { resourceKey: 'compboard', label: 'Compboard' },
  { resourceKey: 'scrap', label: 'Scrap' },
  { resourceKey: 'waste', label: 'Waste' },
  { resourceKey: 'inert_materials', label: 'Inert Materials' },

  // === FUELS ===
  { resourceKey: 'hydrogen_fuel', label: 'Hydrogen Fuel' },
  { resourceKey: 'quantum_fuel', label: 'Quantum Fuel' },

  // === GASES ===
  { resourceKey: 'anti_hydrogen', label: 'Anti-Hydrogen' },
  { resourceKey: 'argon', label: 'Argon' },
  { resourceKey: 'helium', label: 'Helium' },
  { resourceKey: 'hydrogen', label: 'Hydrogen' },
  { resourceKey: 'krypton', label: 'Krypton' },
  { resourceKey: 'methane', label: 'Methane' },
  { resourceKey: 'nitrogen', label: 'Nitrogen' },
  { resourceKey: 'partillium', label: 'Partillium' },
  { resourceKey: 'tritium', label: 'Tritium' },
  { resourceKey: 'xenon', label: 'Xenon' },

  // === HALOGENS ===
  { resourceKey: 'astatine', label: 'Astatine' },
  { resourceKey: 'chlorine', label: 'Chlorine' },
  { resourceKey: 'fluorine', label: 'Fluorine' },
  { resourceKey: 'iodine', label: 'Iodine' },

  // === DRUGS / CONTRABAND ===
  { resourceKey: 'altruciatoxin', label: 'Altruciatoxin' },
  { resourceKey: 'dcsr2', label: 'DCSR2' },
  { resourceKey: 'dopple', label: 'Dopple' },
  { resourceKey: 'e_tam', label: "E'tam" },
  { resourceKey: 'freeze', label: 'Freeze' },
  { resourceKey: 'glow', label: 'Glow' },
  { resourceKey: 'mala', label: 'Mala' },
  { resourceKey: 'maze', label: 'Maze' },
  { resourceKey: 'neon', label: 'Neon' },
  { resourceKey: 'slam', label: 'SLAM' },
  { resourceKey: 'thrust', label: 'Thrust' },
  { resourceKey: 'widow', label: 'WiDoW' },
  { resourceKey: 'zip', label: 'Zip' },

  // === VICE (Legal but restricted in some jurisdictions) ===
  { resourceKey: 'distilled_spirits', label: 'Distilled Spirits' },
  { resourceKey: 'stims', label: 'Stims' },
  { resourceKey: 'revenant_tree_pollen', label: 'Revenant Tree Pollen' },

  // === FOOD ===
  { resourceKey: 'agricultural_supplies', label: 'Agricultural Supplies' },
  { resourceKey: 'blue_bilva', label: 'Blue Bilva' },
  { resourceKey: 'fresh_food', label: 'Fresh Food' },
  { resourceKey: 'human_food_bars', label: 'Human Food Bars' },
  { resourceKey: 'jumping_limes', label: 'Jumping Limes' },
  { resourceKey: 'lunes', label: 'Lunes' },
  { resourceKey: 'pitambu', label: 'Pitambu' },
  { resourceKey: 'processed_food', label: 'Processed Food' },
  { resourceKey: 'sunset_berries', label: 'Sunset Berries' },

  // === MEDICAL ===
  { resourceKey: 'cave_kopion_horn', label: 'Cave Kopion Horn' },
  { resourceKey: 'cryopod', label: 'CryoPod' },
  { resourceKey: 'irradiated_kopion_horn', label: 'Irradiated Kopion Horn' },
  { resourceKey: 'kopion_horn', label: 'Kopion Horn' },
  { resourceKey: 'lifecure_medsticks', label: 'LifeCure Medsticks' },
  { resourceKey: 'medical_supplies', label: 'Medical Supplies' },
  { resourceKey: 'molina_mold_samples', label: 'Molina Mold Samples' },
  { resourceKey: 'molina_mold_treatment', label: 'Molina Mold Treatment' },
  { resourceKey: 'molina_ventilation_filters', label: 'Molina Ventilation Filters' },
  { resourceKey: 'tundra_kopion_horn', label: 'Tundra Kopion Horn' },

  // === METALS & MINERALS ===
  { resourceKey: 'atlasium', label: 'Atlasium' },
  { resourceKey: 'cobalt', label: 'Cobalt' },
  { resourceKey: 'diamond', label: 'Diamond' },
  { resourceKey: 'jaclium', label: 'Jaclium' },
  { resourceKey: 'jahlium', label: 'Jahlium' },
  { resourceKey: 'magnesium', label: 'Magnesium' },
  { resourceKey: 'mercury', label: 'Mercury' },
  { resourceKey: 'potassium', label: 'Potassium' },
  { resourceKey: 'steel', label: 'Steel' },
  { resourceKey: 'atacamite', label: 'Atacamite' },

  // === NON-METALS / RAW MATERIALS ===
  { resourceKey: 'ammonia', label: 'Ammonia' },
  { resourceKey: 'arsenic', label: 'Arsenic' },
  { resourceKey: 'boron', label: 'Boron' },
  { resourceKey: 'carbon', label: 'Carbon' },
  { resourceKey: 'coal', label: 'Coal' },
  { resourceKey: 'crude_oil', label: 'Crude Oil' },
  { resourceKey: 'phosphorus', label: 'Phosphorus' },
  { resourceKey: 'selenium', label: 'Selenium' },
  { resourceKey: 'tellurium', label: 'Tellurium' },

  // === MAN-MADE / INDUSTRIAL ===
  { resourceKey: 'acryliplex_composite', label: 'AcryliPlex Composite' },
  { resourceKey: 'bioplastic', label: 'Bioplastic' },
  { resourceKey: 'cadmium_allinide', label: 'Cadmium Allinide' },
  { resourceKey: 'diamond_laminate', label: 'Diamond Laminate' },
  { resourceKey: 'diluthermex', label: 'Diluthermex' },
  { resourceKey: 'dynaflex', label: 'DynaFlex' },
  { resourceKey: 'elespo', label: 'Elespo' },
  { resourceKey: 'hexapolymesh_coating', label: 'HexaPolyMesh Coating' },
  { resourceKey: 'lastaphrene', label: 'Lastaphrene' },
  { resourceKey: 'lycara', label: 'Lycara' },
  { resourceKey: 'neograph', label: 'Neograph' },
  { resourceKey: 'omnapoxy', label: 'Omnapoxy' },
  { resourceKey: 'sarilus', label: 'Sarilus' },
  { resourceKey: 'silnex', label: 'Silnex' },
  { resourceKey: 'thermalfoam', label: 'ThermalFoam' },
  { resourceKey: 'zeta_prolanide', label: 'Zeta-Prolanide' },

  // === ALLOYS ===
  { resourceKey: 'xa_pyen', label: "Xa'Pyen" },

  // === YORMANDI HARVEST (whole units, no quality tier) ===
  { resourceKey: 'yormandi_eye', label: 'Yormandi Eye' },
  { resourceKey: 'yormandi_tongue', label: 'Yormandi Tongue' },

  // === NATURAL / ORGANIC ===
  { resourceKey: 'amioshi_plague', label: 'Amioshi Plague' },
  { resourceKey: 'carbon_silk', label: 'Carbon-Silk' },
  { resourceKey: 'decari_pod', label: 'Decari Pod' },
  { resourceKey: 'degnous_root', label: 'Degnous Root' },
  { resourceKey: 'golden_medmon', label: 'Golden Medmon' },
  { resourceKey: 'heart_of_the_woods', label: 'Heart of the Woods' },
  { resourceKey: 'marok_gem', label: 'Marok Gem' },
  { resourceKey: 'organics', label: 'Organics' },
  { resourceKey: 'osoian_hides', label: 'Osoian Hides' },
  { resourceKey: 'prota', label: 'Prota' },
  { resourceKey: 'revenant_pod', label: 'Revenant Pod' },
  { resourceKey: 'stone_bug_shell', label: 'Stone Bug Shell' },
  { resourceKey: 'wuotan_seed', label: 'Wuotan Seed' },
  { resourceKey: 'gasping_weevil_eggs', label: 'Gasping Weevil Eggs' },

  // === SEEDS ===
  { resourceKey: 'ck13_gid_seed_blend', label: 'CK13-GID Seed Blend' },
  { resourceKey: 'ranta_dung', label: 'Ranta Dung' },

  // === CHEMICALS / EXPLOSIVES ===
  { resourceKey: 'apoxygenite', label: 'Apoxygenite' },
  { resourceKey: 'detatrine', label: 'Detatrine' },
  { resourceKey: 'dymantium', label: 'Dymantium' },

  // === ELECTRONICS / EQUIPMENT ===
  { resourceKey: 'audio_visual_equipment', label: 'Audio-Visual Equipment' },
  { resourceKey: 'redfin_energy_modulators', label: 'Redfin Energy Modulators' },

  // === TEMPORARY / EVENT ITEMS ===
  { resourceKey: 'fireworks', label: 'Fireworks' },
  { resourceKey: 'luminalia_gift', label: 'Luminalia Gift' },
  { resourceKey: 'party_favors', label: 'Party Favors' },
  { resourceKey: 'souvenirs', label: 'Souvenirs' },

  // === WIKELO CURRENCY (physicalized, tradable — whole units) ===
  { resourceKey: 'wikelo_favor', label: 'Wikelo Favor' },
  { resourceKey: 'polaris_bit', label: 'Polaris Bit' },
  { resourceKey: 'council_scrip', label: 'Council Scrip' },
  { resourceKey: 'mg_scrip', label: 'MG Scrip' },
]

/** Wikelo Emporium currency items — mission-awarded, hand-in barter currency. */
export const WIKELO_CURRENCY_RESOURCE_KEYS = new Set([
  'wikelo_favor',
  'polaris_bit',
  'council_scrip',
  'mg_scrip',
])

export const EXTRA_CATALOG_RESOURCE_KEYS = new Set(
  EXTRA_CATALOG_RESOURCES.map((r) => r.resourceKey)
)

/** Salvage materials have no in-game quality tier — always Q0. */
export const SALVAGE_ORDER_MIN_QUALITY = 0

/** Salvage resource keys (construction materials, scrap, etc.) */
export const SALVAGE_RESOURCE_KEYS = new Set([
  'rmc',
  'construction_material',
  'construction_material_pebbles',
  'construction_material_rubble',
  'construction_material_salvage',
  'compboard',
  'scrap',
  'waste',
  'inert_materials',
])

/** Gas resource keys */
export const GAS_RESOURCE_KEYS = new Set([
  'anti_hydrogen',
  'argon',
  'helium',
  'hydrogen',
  'krypton',
  'methane',
  'nitrogen',
  'partillium',
  'tritium',
  'xenon',
])

/** Halogen resource keys */
export const HALOGEN_RESOURCE_KEYS = new Set([
  'astatine',
  'chlorine',
  'fluorine',
  'iodine',
])

/** Fuel resource keys */
export const FUEL_RESOURCE_KEYS = new Set([
  'hydrogen_fuel',
  'quantum_fuel',
])

/** Contraband / illegal drug resource keys */
export const CONTRABAND_RESOURCE_KEYS = new Set([
  'altruciatoxin',
  'dcsr2',
  'dopple',
  'e_tam',
  'freeze',
  'glow',
  'mala',
  'maze',
  'neon',
  'slam',
  'thrust',
  'widow',
  'zip',
  'osoian_hides',
  'gasping_weevil_eggs',
  'human_food_bars',
  'lifecure_medsticks',
  'redfin_energy_modulators',
])

/** Trade goods (food, supplies, etc.) */
export const TRADE_GOOD_RESOURCE_KEYS = new Set([
  'agricultural_supplies',
  'blue_bilva',
  'fresh_food',
  'jumping_limes',
  'lunes',
  'pitambu',
  'processed_food',
  'sunset_berries',
  'medical_supplies',
  'distilled_spirits',
  'stims',
  'souvenirs',
  'fireworks',
  'luminalia_gift',
  'party_favors',
  'audio_visual_equipment',
])

export function isSalvageResource(resourceKey: string): boolean {
  return SALVAGE_RESOURCE_KEYS.has(resourceKey)
}

export function isGasResource(resourceKey: string): boolean {
  return GAS_RESOURCE_KEYS.has(resourceKey)
}

export function isHalogenResource(resourceKey: string): boolean {
  return HALOGEN_RESOURCE_KEYS.has(resourceKey)
}

export function isFuelResource(resourceKey: string): boolean {
  return FUEL_RESOURCE_KEYS.has(resourceKey)
}

export function isContrabandResource(resourceKey: string): boolean {
  return CONTRABAND_RESOURCE_KEYS.has(resourceKey)
}

export function isTradeGoodResource(resourceKey: string): boolean {
  return TRADE_GOOD_RESOURCE_KEYS.has(resourceKey)
}
