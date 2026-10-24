import { supabase } from './supabase'
import type { HaulAvailabilityRow } from './smartHauler'

const TIMEOUT_MS = 8000

/**
 * Live UEX buy and sell availability for Smart Hauler. Prices and terminals stay baked.
 * Returns null when the check cannot run, so the planner falls back to the baked list.
 */
export async function fetchHaulAvailability(commodityIds?: number[]): Promise<HaulAvailabilityRow[] | null> {
  try {
    const request = supabase.functions.invoke('smart-hauler-availability', {
      body: { commodityIds: commodityIds?.length ? [...new Set(commodityIds)] : null },
    })
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
    const result = await Promise.race([request, timeout])
    if (!result || result.error) return null
    const rows = (result.data as { rows?: unknown } | null)?.rows
    return Array.isArray(rows) ? (rows as HaulAvailabilityRow[]) : null
  } catch {
    return null
  }
}
