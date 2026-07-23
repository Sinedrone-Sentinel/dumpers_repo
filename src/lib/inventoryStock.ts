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

/** Stock cards with no usable note (Empty chip). */
export const EMPTY_LOCATION_KEY = '__empty__'

/** Can Craft / filters: no location restriction. */
export const ALL_LOCATION_KEY = 'all'

export type LocationFilterOption = {
  key: string
  label: string
  count: number
}

export function locationKeyForNote(note: string | null | undefined): string {
  return normalizeLocationSearch(note) || EMPTY_LOCATION_KEY
}

/** Unique note locations from stock cards (Empty first, then A–Z by label). */
export function buildLocationFilterOptions(
  cards: { note?: string | null }[]
): LocationFilterOption[] {
  const byKey = new Map<string, { label: string; count: number }>()
  for (const card of cards) {
    const key = locationKeyForNote(card.note)
    const existing = byKey.get(key)
    if (existing) {
      existing.count += 1
    } else {
      byKey.set(key, {
        label: key === EMPTY_LOCATION_KEY ? 'Empty' : (card.note ?? '').trim(),
        count: 1,
      })
    }
  }
  return [...byKey.entries()]
    .map(([key, meta]) => ({ key, label: meta.label, count: meta.count }))
    .sort((a, b) => {
      if (a.key === EMPTY_LOCATION_KEY) return -1
      if (b.key === EMPTY_LOCATION_KEY) return 1
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    })
}

export function cardMatchesLocationFilter(
  note: string | null | undefined,
  filterKey: string | null | undefined
): boolean {
  if (!filterKey || filterKey === ALL_LOCATION_KEY) return true
  return locationKeyForNote(note) === filterKey
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
