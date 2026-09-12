import gameBlueprints from '../data/game-blueprints.json'
import { EXTRA_CATALOG_RESOURCE_KEYS } from '../config/extraResources'
import { extractBlueprintResources, slugifyResourceName } from './blueprintResources'
import { exactRelinkBlueprintId } from './canonicalizeBlueprintId'
import { MINING_RARITY_ORDER, ORE_SIGNATURES } from './miningConstants'

const blueprintInternalNames = new Set(
  gameBlueprints.blueprints
    .map((bp) => bp.internalName)
    .filter((name): name is string => Boolean(name))
)

const bundledResourceKeys = new Set([
  ...extractBlueprintResources(gameBlueprints.blueprints).map((r) => r.resourceKey),
  ...EXTRA_CATALOG_RESOURCE_KEYS,
])

const validMiningRarities = new Set<string>(MINING_RARITY_ORDER)
const validMiningOres = new Set(Object.keys(ORE_SIGNATURES))

export function isValidBlueprintInternalName(id: string): boolean {
  return blueprintInternalNames.has(id)
}

/** Normalize to catalog internalName; null if unknown. Exact remaps only. */
export function canonicalizeBlueprintInternalName(blueprintId: string): string | null {
  const relinked = exactRelinkBlueprintId(blueprintId, blueprintInternalNames)
  return relinked.ok ? relinked.canon : null
}

/** Normalize to catalog internalName; null if unknown. */
export function normalizeGuestBlueprintId(blueprintId: string): string | null {
  return canonicalizeBlueprintInternalName(blueprintId)
}

export function isValidBundledResourceKey(resourceKey: string): boolean {
  return bundledResourceKeys.has(resourceKey)
}

/** Slugify and validate against bundled catalog keys. */
export function normalizeGuestResourceKey(raw: string): string | null {
  const key = slugifyResourceName(raw)
  if (!key || !bundledResourceKeys.has(key)) return null
  return key
}

export function isValidMiningOreName(oreName: string): boolean {
  return validMiningOres.has(oreName)
}

export function isValidMiningRarity(rarity: string): boolean {
  return validMiningRarities.has(rarity)
}

export function validateGuestMiningEntry(
  oreName: string,
  rarity: string
): { oreName: string; rarity: string } | null {
  if (!isValidMiningOreName(oreName) || !isValidMiningRarity(rarity)) return null
  return { oreName, rarity }
}

export { blueprintInternalNames as VALID_BLUEPRINT_INTERNAL_NAMES }
