import React, { useMemo } from 'react'
import LoadoutProTipsList from './LoadoutProTipsList'
import MoleHeadPlanPanel from './MoleHeadPlanPanel'
import SoloMoleGaragePanel from './SoloMoleGaragePanel'
import { isRockBreakabilityTargetReady, type RockBreakabilityTarget } from '../../lib/miningLoadoutCompare'
import type { MiningLaserSlotConfig } from '../../lib/miningLaserStats'
import { findBestMoleLoadoutStrategy } from '../../lib/moleLoadoutStrategy'
import { analyzeSoloMoleGarage } from '../../lib/soloMoleLoadoutAdvice'
import type { MiningVesselId } from '../../lib/miningVessels'

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

  if (isMole) {
    return (
      <div className="space-y-3">
        {soloRockPlan ? (
          <MoleHeadPlanPanel strategy={soloRockPlan} />
        ) : (
            <p className="text-[11px] text-slate-500 leading-snug rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              Enter pilot-scan <strong className="text-slate-300">mass</strong> and{' '}
              <strong className="text-slate-300">resistance</strong> from the Rock Calculator (raw RESULTS
              values). SHP shifts RES per head/modules — e.g. 74% pilot → ~52% on a Helix turret.
            </p>
        )}
        {garageAdvice ? <SoloMoleGaragePanel advice={garageAdvice} /> : null}
      </div>
    )
  }

  return (
    <LoadoutProTipsList
      vesselId={vesselId}
      slots={lasers}
      showHeadLabel={lasers.length > 1}
    />
  )
}
