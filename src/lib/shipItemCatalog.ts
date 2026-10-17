import gameShipItems from '../data/game-ship-item-stats.json'
import type { ShipItemStats } from './shipShopMath'

const SHIP_SPEC_PREFIXES = ['Veh. Comp.', 'Veh. Weapons', 'Ind. Comp.']

const itemsByClass = new Map<string, ShipItemStats>()

function aliasKeys(entityClass: string): string[] {
  const key = entityClass.toLowerCase()
  const keys = [key]
  if (key.endsWith('_scitem')) keys.push(key.slice(0, -'_scitem'.length))
  return keys
}

for (const item of (gameShipItems as unknown as { items: ShipItemStats[] }).items) {
  for (const key of aliasKeys(item.entityClass)) {
    if (!itemsByClass.has(key)) itemsByClass.set(key, item)
  }
}

export function getShipItem(entityClass: string | null | undefined): ShipItemStats | null {
  if (!entityClass) return null
  return itemsByClass.get(entityClass.toLowerCase()) ?? null
}

export function catalogStatsForEntity(entityClass: string | null | undefined): Record<string, number> | null {
  const item = getShipItem(entityClass)
  if (!item || Object.keys(item.stats).length === 0) return null
  return item.stats
}

export function showsShipCatalogStats(categoryName?: string | null): boolean {
  if (!categoryName) return false
  return SHIP_SPEC_PREFIXES.some((prefix) => categoryName.startsWith(prefix))
}

export function shipItems(): ShipItemStats[] {
  return [...itemsByClass.values()].filter(
    (item, index, list) => list.findIndex((other) => other.entityClass === item.entityClass) === index,
  )
}
