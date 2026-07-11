import React from 'react'
import AppModal from '../layout/AppModal'
import SoloHeadPlanPanel from './SoloHeadPlanPanel'
import type { RockBreakabilityTarget } from '../../lib/miningLoadoutCompare'
import type { MiningLaserSlotConfig } from '../../lib/miningLaserStats'
import type { MiningVesselId } from '../../lib/miningVessels'

interface SoloHeadPlanModalProps {
  vesselId: MiningVesselId
  lasers: MiningLaserSlotConfig[]
  rockTarget: RockBreakabilityTarget | null
  loadoutLabel: string
  onClose: () => void
}

export default function SoloHeadPlanModal({
  vesselId,
  lasers,
  rockTarget,
  loadoutLabel,
  onClose,
}: SoloHeadPlanModalProps) {
  const subtitle =
    vesselId === 'mole'
      ? `${loadoutLabel} · which Mole head to run solo on this rock`
      : `${loadoutLabel} · solo loadout breakdown and pro-tips`

  return (
    <AppModal title="Solo Head Plan" subtitle={subtitle} size="md" onClose={onClose}>
      <SoloHeadPlanPanel vesselId={vesselId} lasers={lasers} rockTarget={rockTarget} />
    </AppModal>
  )
}
