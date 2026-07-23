import type { ResourceInventoryRow } from './operations'
import { isWholeUnitResource } from '../config/resourceTypes'
import { addResourceQuantities } from './resourceQuantity'

/** Case-insensitive note identity for stock card merge / lookup. */
export function normalizeStockNoteKey(note: string | null | undefined): string {
  const trimmed = (note ?? '').trim()
  return trimmed === '' ? '' : trimmed.toLowerCase()
}

/**
 * Location-style note search: case-insensitive, ignore whitespace and
 * punctuation so "arcL1", "Arc l1", "ARC-l1", and "arc_L1" all match "arcl1".
 */
export function normalizeLocationSearch(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function inventoryLineKey(
  resourceKey: string,
  quality: number,
  note?: string | null
): string {
  return `${resourceKey}::${quality}::${normalizeStockNoteKey(note)}`
}

export type StockQuantityTotals = {
  totalScu: number
  totalUnits: number
}

export function sumStockQuantityTotals(
  rows: Pick<{ resource_key: string; quantity: number }, 'resource_key' | 'quantity'>[]
): StockQuantityTotals {
  let totalScu = 0
  let totalUnits = 0

  for (const row of rows) {
    const qty = Number(row.quantity)
    if (!Number.isFinite(qty) || qty <= 0) continue

    if (isWholeUnitResource(row.resource_key)) {
      totalUnits += Math.trunc(qty)
    } else {
      totalScu = addResourceQuantities(totalScu, qty)
    }
  }

  return { totalScu, totalUnits }
}

export function buildStockTotalsByResource(
  rows: Pick<ResourceInventoryRow, 'resource_key' | 'quantity'>[]
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    totals[row.resource_key] = addResourceQuantities(
      totals[row.resource_key] ?? 0,
      Number(row.quantity)
    )
  }
  return totals
}
