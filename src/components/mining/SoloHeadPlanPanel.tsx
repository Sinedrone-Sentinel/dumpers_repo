import React, { useMemo } from 'react'
import LoadoutHeadCardsGrid from './LoadoutHeadCards'
import MoleHeadPlanPanel from './MoleHeadPlanPanel'
import SoloMoleGaragePanel from './SoloMoleGaragePanel'
import { isRockBreakabilityTargetReady, type RockBreakabilityTarget } from '../../lib/miningLoadoutCompare'
import type { MiningLaserSlotConfig } from '../../lib/miningLaserStats'
import { findBestMoleLoadoutStrategy } from '../../lib/moleLoadoutStrategy'
import { analyzeSoloMoleGarage } from '../../lib/soloMoleLoadoutAdvice'
import { getMiningVessel, type MiningVesselId } from '../../lib/miningVessels'

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
  const vessel = getMiningVessel(vesselId)
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

  const noopSlotChange = () => {}

  return (
    <div className="space-y-3">
      {isMole ? (
        <>
          {soloRockPlan ? (
            <MoleHeadPlanPanel strategy={soloRockPlan} />
          ) : (
            <p className="text-[11px] text-slate-500 leading-snug rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              Enter scanner <strong className="text-slate-300">mass</strong> and{' '}
              <strong className="text-slate-300">resistance</strong> in the Rock Calculator to see which
              Mole head fits this rock.
            </p>
          )}
          {garageAdvice ? <SoloMoleGaragePanel advice={garageAdvice} /> : null}
        </>
      ) : (
        <p className="text-[11px] text-slate-400 leading-snug">
          {vessel?.displayName ?? 'Loadout'} breakdown and module tips for solo mining on this ship.
        </p>
      )}

      <LoadoutHeadCardsGrid
        vesselId={vesselId}
        slots={lasers}
        editable={false}
        moleSoloMining
        onSlotChange={noopSlotChange}
      />
    </div>
  )
}
