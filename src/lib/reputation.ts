import { REPUTATION_MIN_COMPLETED } from '../config/reputation'

export interface MemberReputation {
  completedCount: number
  ratingCount: number
  score: number | null
  isPending: boolean
  avgDeliverySeconds: number | null
  deliverySampleCount: number
}

export interface MemberReputationRow {
  user_id: string
  buyer_completed_count: number
  buyer_rating_count: number
  buyer_reputation: number | null
  buyer_is_pending: boolean
  fulfiller_completed_count: number
  fulfiller_rating_count: number
  fulfiller_reputation: number | null
  fulfiller_is_pending: boolean
  fulfiller_avg_delivery_seconds?: number | null
  fulfiller_delivery_sample_count?: number
}

function toScore(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatReputationScore(score: number): string {
  return score.toFixed(1)
}

export function buyerReputationFromRow(row: MemberReputationRow | undefined): MemberReputation {
  if (!row) return emptyReputation()
  return {
    completedCount: row.buyer_completed_count,
    ratingCount: row.buyer_rating_count,
    score: toScore(row.buyer_reputation),
    isPending: row.buyer_is_pending,
    avgDeliverySeconds: null,
    deliverySampleCount: 0,
  }
}

export function fulfillerReputationFromRow(row: MemberReputationRow | undefined): MemberReputation {
  if (!row) return emptyReputation()
  return {
    completedCount: row.fulfiller_completed_count,
    ratingCount: row.fulfiller_rating_count,
    score: toScore(row.fulfiller_reputation),
    isPending: row.fulfiller_is_pending,
    avgDeliverySeconds: row.fulfiller_avg_delivery_seconds ?? null,
    deliverySampleCount: row.fulfiller_delivery_sample_count ?? 0,
  }
}

export function emptyReputation(): MemberReputation {
  return {
    completedCount: 0,
    ratingCount: 0,
    score: null,
    isPending: true,
    avgDeliverySeconds: null,
    deliverySampleCount: 0,
  }
}

/** Format seconds as ddd:HH:mm (zero-padded days, hours, minutes). */
export function formatDeliveryDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(safe / 86400)
  const hours = Math.floor((safe % 86400) / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  return `${String(days).padStart(3, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatReputationLabel(rep: MemberReputation): string {
  if (rep.isPending || rep.score == null) {
    const remaining = Math.max(0, REPUTATION_MIN_COMPLETED - rep.completedCount)
    if (remaining > 0) {
      return `Pending (${rep.completedCount}/${REPUTATION_MIN_COMPLETED})`
    }
    return 'Pending'
  }
  return formatReputationScore(rep.score)
}

export function passesBuyerRepFilter(
  buyerRep: MemberReputation,
  minFilter: number | null
): boolean {
  if (!minFilter || minFilter < 1) return true
  if (buyerRep.isPending || buyerRep.score == null) return true
  return buyerRep.score >= minFilter
}

export function fulfillerMeetsOrderMinRep(
  fulfillerRep: MemberReputation,
  orderMin: number | null | undefined
): boolean {
  if (orderMin == null || orderMin < 1) return true
  if (fulfillerRep.isPending || fulfillerRep.score == null) return true
  return fulfillerRep.score >= orderMin
}
