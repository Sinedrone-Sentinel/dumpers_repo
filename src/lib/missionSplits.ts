import missionSplitsData from '../data/game-mission-splits.json'

/** What the contract says is shared with the party. */
export type RewardSplit = 'rewards' | 'rep' | 'both' | 'unspecified'

const byId = (missionSplitsData as { byId?: Record<string, RewardSplit> }).byId ?? {}

export function rewardSplitForContract(contractId: string | null | undefined): RewardSplit | null {
  if (!contractId) return null
  const kind = byId[contractId.toLowerCase()]
  if (kind === 'rewards' || kind === 'rep' || kind === 'both' || kind === 'unspecified') return kind
  return null
}

export type RewardSplitKind = 'rewards' | 'rep' | 'unspecified'

/** Chip kinds for one contract. `both` is two chips, Rewards then Rep. */
export function rewardSplitKinds(split: RewardSplit | null | undefined): RewardSplitKind[] {
  if (split === 'both') return ['rewards', 'rep']
  if (split === 'rewards' || split === 'rep' || split === 'unspecified') return [split]
  return []
}

/** Distinct chips for a card that contains several contracts. First-seen order. */
export function collectRewardSplitKinds(
  splits: Array<RewardSplit | null | undefined>,
): RewardSplitKind[] {
  const kinds: RewardSplitKind[] = []
  const seen = new Set<RewardSplitKind>()
  for (const split of splits) {
    for (const kind of rewardSplitKinds(split)) {
      if (seen.has(kind)) continue
      seen.add(kind)
      kinds.push(kind)
    }
  }
  return kinds
}

export function formatRewardSplitTag(kind: RewardSplit): string {
  if (kind === 'rewards') return 'SPLITS Rewards'
  if (kind === 'rep') return 'SPLITS Rep'
  return 'SPLITS'
}

export function rewardSplitTooltip(kind: RewardSplit): string {
  if (kind === 'rewards') return 'Party members split the contract payout.'
  if (kind === 'rep') return 'Party members split the reputation from this contract.'
  return 'Party members split what this contract pays. It does not say whether that is the pay or the reputation.'
}
