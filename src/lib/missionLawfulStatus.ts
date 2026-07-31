/**
 * Verified vs Unverified contract type (legal vs illegal board).
 *
 * In-game Contracts app: Verified = meets UEE/local law; Unverified = may violate law.
 * We map that to isLawful from the contractor's faction reputation key
 * (lawful_* / unlawful_*) — not mission category (Bounty Hunter, Mercenary, etc.).
 *
 * unknown/non-prefixed factionKey = generic board without unlawful rep → Verified.
 */

export interface MissionLawfulInput {
  factionKey?: string | null
  factionName?: string | null
  debugName?: string | null
}

export function resolveMissionIsLawful(input: MissionLawfulInput): boolean {
  const factionKey = (input.factionKey || '').toLowerCase()

  if (factionKey.startsWith('unlawful_')) return false
  if (factionKey.startsWith('lawful_')) return true

  // unknown/non-prefixed keys (generic board work, wikelo) default to Verified.
  return true
}

/** @deprecated Prefer resolveMissionIsLawful with factionKey + debugName. */
export function isUnlawfulFactionName(factionName: string): boolean {
  return !resolveMissionIsLawful({ factionName })
}
