import type { ResourceInventoryRow } from './operations'
import { addResourceQuantities } from './resourceQuantity'

/** Case-insensitive note identity for stock card merge / lookup. */
export function normalizeStockNoteKey(note: string | null | undefined): string {
  const trimmed = (note ?? '').trim()
  return trimmed === '' ? '' : trimmed.toLowerCase()
}

export function inventoryLineKey(
  resourceKey: string,
  quality: number,
  note?: string | null
): string {
  return `${resourceKey}::${quality}::${normalizeStockNoteKey(note)}`
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
