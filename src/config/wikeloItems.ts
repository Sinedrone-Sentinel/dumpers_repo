import gameWikeloTrades from '../data/game-wikelo-trades.json'
import type { ExtractedBlueprintResource } from '../lib/blueprintResources'

/**
 * Wikelo Emporium reward items — every ITEM Wikelo can award (armor, weapons,
 * magazines) is tradable in-game and listable on WTS/WTB. Excluded: blueprints
 * (crafted via BP system) and game-bound vehicles (cannot change hands).
 *
 * Derived from game-wikelo-trades.json rewards so the catalog stays in sync
 * with each game-data extraction. Wikelo currency (Favor, Polaris Bit, scrips)
 * lives in extraResources.ts as WIKELO_CURRENCY_RESOURCE_KEYS.
 */

interface WikeloTradeRewardRow {
  entityClass: string
  name: string
  kind: string
}

interface WikeloTradeRow {
  rewards?: WikeloTradeRewardRow[]
}

function slugifyItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Currency entities already cataloged under their own resource keys. */
const CURRENCY_ENTITY_TO_RESOURCE_KEY: Record<string, string> = {
  carryable_1h_cy_banu_favour_wikelo: 'wikelo_favor',
  carryable_1h_cy_banu_favour_wikelo_special: 'polaris_bit',
  carryable_1h_cy_physical_currency_scrip_council_1: 'council_scrip',
  carryable_1h_cy_physical_currency_scrip_merc_1: 'mg_scrip',
}

const itemsByKey = new Map<string, ExtractedBlueprintResource>()
const resourceKeyByEntityClass = new Map<string, string>()

for (const trade of (gameWikeloTrades as { trades: WikeloTradeRow[] }).trades) {
  for (const reward of trade.rewards ?? []) {
    if (reward.kind !== 'item') continue
    const currencyKey = CURRENCY_ENTITY_TO_RESOURCE_KEY[reward.entityClass]
    if (currencyKey) {
      resourceKeyByEntityClass.set(reward.entityClass, currencyKey)
      continue
    }
    const resourceKey = slugifyItemName(reward.name)
    if (!resourceKey) continue
    resourceKeyByEntityClass.set(reward.entityClass, resourceKey)
    if (!itemsByKey.has(resourceKey)) {
      itemsByKey.set(resourceKey, { resourceKey, label: reward.name })
    }
  }
}

/** Wikelo reward gear (armor, weapons, magazines) — whole-unit tradable items. */
export const WIKELO_ITEM_RESOURCES: ExtractedBlueprintResource[] = [...itemsByKey.values()].sort(
  (a, b) => a.label.localeCompare(b.label)
)

export const WIKELO_ITEM_RESOURCE_KEYS = new Set(itemsByKey.keys())

/** Resource key for a Wikelo reward entityClass (currency or gear); null for vehicles/unknown. */
export function wikeloRewardResourceKey(entityClass: string): string | null {
  return resourceKeyByEntityClass.get(entityClass) ?? null
}
