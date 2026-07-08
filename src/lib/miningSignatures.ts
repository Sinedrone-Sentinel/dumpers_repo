import { ORE_SIGNATURES } from './miningConstants'
import { normalizeMiningOreName } from './miningOreCanonical'

/** First N cluster RS readings for ship mining: base × 1 … base × N (includes base). */
export function getSignatureMultiples(baseSignature: number, count = 6): number[] {
  if (!Number.isFinite(baseSignature) || baseSignature <= 0) return []
  const n = Math.max(1, Math.floor(count))
  return Array.from({ length: n }, (_, i) => baseSignature * (i + 1))
}

export function getOreBaseSignature(oreName: string): number | undefined {
  const canonical = normalizeMiningOreName(oreName)
  return ORE_SIGNATURES[canonical]
}

export function formatRsReading(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString()
}
