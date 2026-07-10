import React from 'react'
import AppModal from '../layout/AppModal'
import MiningLoadoutPanel, { type MiningLoadoutSelection } from './MiningLoadoutPanel'
import type { RockBreakabilityTarget } from '../../lib/miningLoadoutCompare'

interface SmartCrackerModalProps {
  rockTarget: RockBreakabilityTarget | null
  selection: MiningLoadoutSelection
  onClose: () => void
  moleSoloMining?: boolean
  onMoleSoloMiningChange?: (solo: boolean) => void
}

export default function SmartCrackerModal({
  rockTarget,
  selection,
  onClose,
  moleSoloMining,
  onMoleSoloMiningChange,
}: SmartCrackerModalProps) {
  return (
    <AppModal
      title="Smart Cracker"
      subtitle="Loadout planner — edit freely, then Save or Save as New · breakability & gadget fit"
      size="xl"
      onClose={onClose}
    >
      <MiningLoadoutPanel
        rockTarget={rockTarget}
        selection={selection}
        embedded
        moleSoloMining={moleSoloMining}
        onMoleSoloMiningChange={onMoleSoloMiningChange}
      />
    </AppModal>
  )
}
