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
