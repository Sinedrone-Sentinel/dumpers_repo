import React from 'react'
import type { HaulAvailabilityRow, HaulSideAvailability } from './smartHauler'
import { fetchHaulAvailability } from './smartHaulerAvailability'

/** UEX buy status is the terminal's stock, 1 (out) to 7 (max). */
const BUY_STATUS_LABELS: Record<number, string> = {
  1: 'Out of stock',
  2: 'Very low stock',
  3: 'Low stock',
  4: 'Medium stock',
  5: 'High stock',
  6: 'Very high stock',
  7: 'Max stock',
}

/** UEX sell status is how full the terminal's inventory is, so a low number means it wants more. */
const SELL_STATUS_LABELS: Record<number, string> = {
  1: 'Very high demand',
  2: 'High demand',
  3: 'Good demand',
  4: 'Medium demand',
  5: 'Low demand',
  6: 'Very low demand',
  7: 'Full, no demand',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CACHE_MS = 10 * 60 * 1000

export function uexStatusLabel(status: number, side: 'buy' | 'sell'): string | null {
  return (side === 'buy' ? BUY_STATUS_LABELS : SELL_STATUS_LABELS)[status] ?? null
}

/** `Status 4 · Medium stock · 1,200 SCU · Oct 26, 2026` */
export function uexStockLine(report: HaulSideAvailability, side: 'buy' | 'sell'): string {
  const parts: string[] = []
  if (report.status != null) {
    const label = uexStatusLabel(report.status, side)
    parts.push(label ? `Status ${report.status} · ${label}` : `Status ${report.status}`)
  }
  if (report.scu != null && report.scu > 0) parts.push(`${report.scu.toLocaleString()} SCU`)
  if (report.verifiedAt != null && Number.isFinite(report.verifiedAt)) {
    const date = new Date(report.verifiedAt)
    if (!Number.isNaN(date.getTime())) {
      parts.push(`${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`)
    }
  }
  return parts.join(' · ')
}

export type UexStockState =
  | { state: 'idle' | 'loading' | 'unavailable' }
  | { state: 'ready'; byTerminal: Map<number, HaulAvailabilityRow> }

const cache = new Map<number, { at: number; request: Promise<HaulAvailabilityRow[] | null> }>()

function loadCommodity(commodityId: number): Promise<HaulAvailabilityRow[] | null> {
  const hit = cache.get(commodityId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.request
  const request = fetchHaulAvailability([commodityId]).then((rows) => {
    if (rows == null) cache.delete(commodityId)
    return rows
  })
  cache.set(commodityId, { at: Date.now(), request })
  return request
}

/** Live UEX stock and demand for one commodity, keyed by terminal. Prices stay baked. */
export function useUexCommodityStock(commodityId: number | null | undefined): UexStockState {
  const [stock, setStock] = React.useState<UexStockState>({ state: 'idle' })

  React.useEffect(() => {
    if (commodityId == null) {
      setStock({ state: 'idle' })
      return
    }
    let cancelled = false
    setStock({ state: 'loading' })
    void loadCommodity(commodityId).then((rows) => {
      if (cancelled) return
      if (rows == null) {
        setStock({ state: 'unavailable' })
        return
      }
      const byTerminal = new Map<number, HaulAvailabilityRow>()
      for (const row of rows) if (row.commodityId === commodityId) byTerminal.set(row.terminalId, row)
      setStock({ state: 'ready', byTerminal })
    })
    return () => {
      cancelled = true
    }
  }, [commodityId])

  return stock
}
