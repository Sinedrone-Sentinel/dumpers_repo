import gameReputationData from '../data/game-reputation.json'

export interface StoredAuecPayout {
  min: number
  max: number
}

type BrokerMission = {
  titleKey?: string
  aUecReward?: { min?: number; max?: number }
}

/** Drop a zero max so a fixed reward is a single figure. Ignore a pair with no pay. */
export function normalizeStoredPayout(min: number, max: number): StoredAuecPayout | null {
  const lo = Number.isFinite(min) ? min : 0
  const hi = Number.isFinite(max) ? max : 0
  if (lo <= 0 && hi <= 0) return null
  if (hi <= 0 || hi === lo) {
    const amount = lo > 0 ? lo : hi
    return { min: amount, max: amount }
  }
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) }
}

/** One stored pair, or the spread across several broker rows that share a title. */
export function combineStoredAuecPayouts(
  pairs: Array<{ min: number; max: number }>
): StoredAuecPayout | null {
  const normalized = pairs
    .map((pair) => normalizeStoredPayout(pair.min, pair.max))
    .filter((pair): pair is StoredAuecPayout => pair != null)
  if (normalized.length === 0) return null
  return {
    min: Math.min(...normalized.map((pair) => pair.min)),
    max: Math.max(...normalized.map((pair) => pair.max)),
  }
}

export function formatStoredAuecLabel(min?: number | null, max?: number | null): string | null {
  const payout = normalizeStoredPayout(min ?? 0, max ?? 0)
  if (!payout) return null
  if (payout.min === payout.max) return `${payout.min.toLocaleString('en-US')} aUEC`
  return `${payout.min.toLocaleString('en-US')}\u2013${payout.max.toLocaleString('en-US')} aUEC`
}

export function normalizeMissionTitleKey(titleKey: string | null | undefined): string {
  return (titleKey ?? '').trim().replace(/^@/, '').toLowerCase()
}

const payoutsByTitleKey = new Map<string, Array<{ min: number; max: number }>>()

for (const mission of Object.values(gameReputationData.missions as Record<string, BrokerMission>)) {
  const key = normalizeMissionTitleKey(mission?.titleKey)
  const reward = mission?.aUecReward
  if (!key || !reward) continue
  const pair = { min: reward.min ?? 0, max: reward.max ?? 0 }
  if (!normalizeStoredPayout(pair.min, pair.max)) continue
  const list = payoutsByTitleKey.get(key)
  if (list) list.push(pair)
  else payoutsByTitleKey.set(key, [pair])
}

/** Stored broker payout for a contract title key. Null when the file has no number. */
export function payoutForTitleKey(titleKey: string | null | undefined): StoredAuecPayout | null {
  const key = normalizeMissionTitleKey(titleKey)
  if (!key) return null
  return combineStoredAuecPayouts(payoutsByTitleKey.get(key) ?? [])
}
