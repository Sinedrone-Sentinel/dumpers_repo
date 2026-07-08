import { ORE_SIGNATURES } from './miningConstants'
import { normalizeMiningOreName } from './miningOreCanonical'

/** FPS gems + ground-vehicle gems excluded from the ship RS Tracker reference. */
export const HAND_MINEABLE_ORES = new Set([
  'Aphorite',
  'Dolivine',
  'Hadanite',
  'Janalite',
  'Glacosite',
  'Feynmaline',
  'Sadaryx',
])

/** Ground-vehicle gems (not in RS Tracker reference; not FPS hand-mineable). */
export const GROUND_VEHICLE_GEMS = new Set(['Beradom', 'Glacosite', 'Feynmaline'])

export { normalizeMiningOreName }

export function isHandMineableOre(name: string): boolean {
  return HAND_MINEABLE_ORES.has(normalizeMiningOreName(name))
}

/** Manual mine type: FPS gems + ground-vehicle gems (not the same as rarity tier). */
export function isHandMineableType(name: string): boolean {
  const canonical = normalizeMiningOreName(name)
  return HAND_MINEABLE_ORES.has(canonical) || GROUND_VEHICLE_GEMS.has(canonical)
}

export function isHandMineableRarity(rarity: string | undefined): boolean {
  return rarity === 'handMineable'
}

export function matchesGuideRarityFilter(
  oreName: string,
  storedRarity: string,
  filter: string | null
): boolean {
  if (!filter) return true
  if (filter === 'handMineable') return isHandMineableType(oreName)
  return storedRarity === filter
}

export function hasShipRsSignature(oreName: string): boolean {
  return normalizeMiningOreName(oreName) in ORE_SIGNATURES
}

/** Guide chips for ores without RS spawn profiles (hand-mineables, ground gems, etc.). */
export function isGuideLocationListOnlyOre(oreName: string, rarity: string): boolean {
  return (
    isHandMineableType(oreName) ||
    isHandMineableRarity(rarity) ||
    !hasShipRsSignature(oreName)
  )
}

export function getGuideLocationSpawnLabel(oreName: string): string {
  const name = normalizeMiningOreName(oreName)
  if (isHandMineableOre(name)) return 'Hand-mineable'
  if (GROUND_VEHICLE_GEMS.has(name)) return 'Ground vehicle'
  return 'Compendium'
}

/** Why an ore appears in the guide but not the RS Tracker grid. */
export function rsTrackerUnmappedDetail(oreName: string): string {
  const label = getGuideLocationSpawnLabel(oreName)
  return `${label} at this site. RS Tracker reference not mapped — an in-game signature may still exist.`
}

export function rsTrackerCardUnmappedNote(oreName: string): string {
  const label = getGuideLocationSpawnLabel(oreName)
  return `${label} — RS Tracker reference not mapped`
}
