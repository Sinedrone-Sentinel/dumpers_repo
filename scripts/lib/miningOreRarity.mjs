/**
 * Ship-mining ore rarity tiers (not exposed in MineableElement game records).
 * Hand-mineable ores use isHandMineableOre() instead of these tiers.
 */

import { isHandMineableOre } from './miningOreNames.mjs'

export const ORE_RARITY_TIERS = {
  legendary: ['Quantainium', 'Savrilium', 'Stileron'],
  epic: ['Lindinium', 'Ouratite', 'Riccite'],
  rare: ['Beryl', 'Bexalite', 'Laranite', 'Agricium', 'Borase', 'Hephaestanite', 'Gold', 'Aslarite'],
  uncommon: ['Corundum', 'Quartz', 'Titanium', 'Tungsten', 'Diamond', 'Taranite'],
  common: ['Aluminum', 'Copper', 'Iron', 'Silicon', 'Tin'],
  handMineable: ['Aphorite', 'Dolivine', 'Hadanite', 'Janalite', 'Glacosite', 'Feynmaline', 'Sadaryx'],
}

export function assignOreRarity(oreName) {
  if (isHandMineableOre(oreName)) return 'handMineable'
  for (const [tier, ores] of Object.entries(ORE_RARITY_TIERS)) {
    if (ores.some((o) => o.toLowerCase() === oreName.toLowerCase())) {
      return tier
    }
  }
  return 'common'
}
