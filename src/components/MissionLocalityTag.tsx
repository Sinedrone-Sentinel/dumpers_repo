import React from 'react'
import type { MissionLocality } from '../lib/blueprintMissionRewards'

/**
 * Locality gate tag: the mission only appears in the in-game Contracts app
 * while the player is physically in this area (game MissionLocality records).
 */
export default function MissionLocalityTag({ locality }: { locality?: MissionLocality | null }) {
  if (!locality?.label) return null

  return (
    <span
      className="text-[10px] px-1.5 py-0.5 bg-sky-950/50 text-sky-300 border border-sky-500/40 rounded"
      title="This contract only shows up in your Contracts app while you're in this area"
    >
      📍 {locality.label}
    </span>
  )
}
