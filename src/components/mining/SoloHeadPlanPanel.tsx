import React, { useMemo } from 'react'
import LoadoutProTipsList from './LoadoutProTipsList'
import MoleHeadPlanPanel from './MoleHeadPlanPanel'
import SoloMoleGaragePanel from './SoloMoleGaragePanel'
import { isRockBreakabilityTargetReady, type RockBreakabilityTarget } from '../../lib/miningLoadoutCompare'
import type { MiningLaserSlotConfig } from '../../lib/miningLaserStats'
import { suggestModuleSwaps, type ModuleSwapSuggestion } from '../../lib/miningModuleSwapAdvice'
import {
  recommendActiveModulesForHeads,
  type HeadActiveModuleAdvice,
} from '../../lib/miningActiveModuleAdvice'
import { findBestMoleLoadoutStrategy } from '../../lib/moleLoadoutStrategy'
import { analyzeSoloMoleGarage } from '../../lib/soloMoleLoadoutAdvice'
import type { MiningVesselId } from '../../lib/miningVessels'

function ActiveModulePlanPanel({
  advice,
  showHeadLabel,
}: {
  advice: HeadActiveModuleAdvice[]
  showHeadLabel: boolean
}) {
  const actionable = advice.filter(
    (a) => a.hasEquippedActives && !a.cracksOnPassive && a.cracksWithRecommended && a.recommendedModuleNames.length > 0
  )
  if (!actionable.length) return null

  return (
    <div className="rounded-lg border border-sky-800/50 bg-sky-950/20 p-3 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-sky-400/80">
        Active modules · switch on to crack this rock
      </p>
      {actionable.map((a) => (
        <p key={`active-${a.slotIndex}`} className="text-[11px] text-sky-200/85 leading-snug">
          {showHeadLabel ? <span className="text-sky-300/90">Head {a.slotIndex + 1}</span> : <span className="text-sky-300/90">This head</span>}{' '}
          · turn on {a.recommendedModuleNames.join(' + ')}
          {a.throttlePercent != null ? ` — then drive @ ${a.throttlePercent}%` : ''}
        </p>
      ))}
      <p className="text-[10px] text-sky-500/80 leading-snug">
        Fewest actives needed — leave the rest off to save charge and avoid extra instability.
      </p>
    </div>
  )
}

function ModuleSwapSuggestionsPanel({ suggestions }: { suggestions: ModuleSwapSuggestion[] }) {
  if (!suggestions.length) return null
  return (
    <div className="rounded-lg border border-amber-900/40 bg-amber-950/15 p-3 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-amber-500/80">
        Module swap ideas · modules change on the fly at the head
      </p>
      {suggestions.map((s) => (
        <p key={`${s.slotIndex}-${s.portIndex}-${s.addModule}`} className="text-[11px] text-amber-200/80 leading-snug">
          <span className="text-amber-300/90">Head {s.slotIndex + 1}</span> · {s.reason}
          <span className="text-amber-600/80"> (if you're carrying one)</span>
        </p>
      ))}
    </div>
  )
}

interface SoloHeadPlanPanelProps {
  vesselId: MiningVesselId
  lasers: MiningLaserSlotConfig[]
  rockTarget: RockBreakabilityTarget | null
}

export default function SoloHeadPlanPanel({
  vesselId,
  lasers,
  rockTarget,
}: SoloHeadPlanPanelProps) {
  const isMole = vesselId === 'mole'
  const rockReady = isRockBreakabilityTargetReady(rockTarget)

  const soloRockPlan = useMemo(() => {
    if (!isMole || !rockReady || !rockTarget) return null
    return findBestMoleLoadoutStrategy(lasers, rockTarget, { soloMining: true })
  }, [isMole, lasers, rockReady, rockTarget])

  const garageAdvice = useMemo(() => {
    if (!isMole) return null
    return analyzeSoloMoleGarage(lasers)
  }, [isMole, lasers])

  const swapSuggestions = useMemo(() => {
    if (!rockReady || !rockTarget) return []
    return suggestModuleSwaps(lasers, rockTarget)
  }, [lasers, rockReady, rockTarget])

  const activeAdvice = useMemo(() => {
    if (isMole || !rockReady || !rockTarget) return []
    return recommendActiveModulesForHeads(lasers, rockTarget)
  }, [isMole, lasers, rockReady, rockTarget])

  if (isMole) {
    return (
      <div className="space-y-3">
        {soloRockPlan ? (
          <MoleHeadPlanPanel strategy={soloRockPlan} oreName={rockTarget?.oreName} />
        ) : (
            <p className="text-[11px] text-slate-500 leading-snug rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              Enter the <strong className="text-slate-300">mass</strong> and{' '}
              <strong className="text-slate-300">resistance</strong> from your pilot-seat scan into the
              Rock Calculator. The plan then adjusts resistance for each head&apos;s modules — a 74%
              pilot reading can drop to ~52% on a Helix turret.
            </p>
        )}
        <ModuleSwapSuggestionsPanel suggestions={swapSuggestions} />
        {garageAdvice ? (
          <SoloMoleGaragePanel advice={garageAdvice} oreName={rockTarget?.oreName} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ActiveModulePlanPanel advice={activeAdvice} showHeadLabel={lasers.length > 1} />
      <ModuleSwapSuggestionsPanel suggestions={swapSuggestions} />
      <LoadoutProTipsList
        vesselId={vesselId}
        slots={lasers}
        showHeadLabel={lasers.length > 1}
      />
    </div>
  )
}
