import gameMiningData from '../data/game-mining.json'
import { GUIDE_LOCATION_SYSTEMS } from './miningLocationNames'

export const MINING_RARITY_ORDER = [
  'legendary',
  'epic',
  'rare',
  'uncommon',
  'common',
  'handMineable',
] as const

/** RS base signatures parsed from mineable rock entity defs (game-mining.json). */
export const ORE_SIGNATURES: Record<string, number> = {
  ...(gameMiningData.oreSignatures ?? {}),
}

/** @deprecated Use getSystemForGuideLocation from miningLocationNames — kept for existing imports. */
export const LOCATION_SYSTEMS: Record<string, string> = GUIDE_LOCATION_SYSTEMS

export const MINING_SYSTEM_COLORS: Record<string, string> = {
  Stanton: 'text-blue-400',
  Pyro: 'text-orange-400',
  Nyx: 'text-purple-400',
}

export const MINING_RARITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  legendary: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  epic: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  rare: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  uncommon: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  common: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
  handMineable: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

export const MINING_RARITY_LABELS: Record<string, string> = {
  legendary: 'Legendary',
  epic: 'Epic',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
  handMineable: 'Hand Mineable',
}
