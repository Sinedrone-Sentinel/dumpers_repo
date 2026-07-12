/**
 * Ship-mining ore rarity tiers (not exposed in MineableElement game records).
 * Hand-mineable ores use isHandMineableOre() instead of these tiers.
 */

import { isHandMineableType } from './miningOreNames.mjs'

export const ORE_RARITY_TIERS = {
  legendary: ['Quantainium', 'Savrilium', 'Stileron'],
  epic: ['Lindinium', 'Ouratite', 'Riccite'],
  rare: ['Beryl', 'Bexalite', 'Laranite', 'Agricium', 'Borase', 'Hephaestanite', 'Gold', 'Aslarite'],
  // Torite: wiki mineable tier "uncommon" (broad 28.5% Pyro asteroid spawns, ~7-8.5k/SCU)
  uncommon: ['Corundum', 'Quartz', 'Titanium', 'Tungsten', 'Diamond', 'Taranite', 'Torite'],
  common: ['Aluminum', 'Copper', 'Iron', 'Silicon', 'Tin', 'Ice'],
  handMineable: ['Aphorite', 'Dolivine', 'Hadanite', 'Janalite', 'Glacosite', 'Feynmaline', 'Sadaryx', 'Carinite'],
}

export function assignOreRarity(oreName) {
  // FPS gems AND ground-vehicle gems both live in the gem tier — a ROC gem like
  // Beradom must not fall through to the 'common' ship-ore tier.
  if (isHandMineableType(oreName)) return 'handMineable'
  for (const [tier, ores] of Object.entries(ORE_RARITY_TIERS)) {
    if (ores.some((o) => o.toLowerCase() === oreName.toLowerCase())) {
      return tier
    }
  }
  return 'common'
}
