import type { MissionRepEffect } from '../lib/blueprintMissionRewards'

interface MissionRepEffectTagsProps {
  /** Per-faction rep changes on completion (own faction first, losses negative). */
  repEffects?: MissionRepEffect[] | null
  /** Fallback single gain when repEffects is unavailable (older data paths). */
  repPoints?: number | null
  /** Faction the mission is listed under — its own gain renders without a name. */
  missionFaction?: string | null
}

/**
 * Rep reward tags for a mission: "+400 rep" for the mission giver, plus
 * "+50 Citizens for Prosperity rep" / "−250 Head Hunters rep" for any other
 * faction the mission touches on completion.
 */
export default function MissionRepEffectTags({
  repEffects,
  repPoints,
  missionFaction,
}: MissionRepEffectTagsProps) {
  const effects: MissionRepEffect[] = repEffects?.length
    ? repEffects
    : repPoints
      ? [{ factionKey: '', faction: missionFaction ?? '', amount: repPoints }]
      : []

  if (effects.length === 0) return null

  return (
    <>
      {effects.map((effect, idx) => {
        const isLoss = effect.amount < 0
        const isOwnFaction =
          idx === 0 || !effect.faction || effect.faction === missionFaction
        const amountText = `${isLoss ? '−' : '+'}${Math.abs(effect.amount).toLocaleString()}`
        const label = isOwnFaction ? `${amountText} rep` : `${amountText} ${effect.faction} rep`

        return (
          <span
            key={effect.factionKey || effect.faction || 'own'}
            className={`text-[10px] ${isLoss ? 'text-red-400/90 font-medium' : 'text-emerald-400/90'}`}
            title={
              isLoss
                ? `Completing this mission LOWERS your ${effect.faction} reputation`
                : effect.faction && !isOwnFaction
                  ? `Completing this mission also raises your ${effect.faction} reputation`
                  : undefined
            }
          >
            {label}
          </span>
        )
      })}
    </>
  )
}
