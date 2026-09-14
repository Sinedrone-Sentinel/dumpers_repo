import { useState } from 'react'
import AppModal from '../layout/AppModal'
import { MiningAdvisorChromeProvider } from './MiningAdvisorChrome'
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
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  const [overlaySlot, setOverlaySlot] = useState<HTMLDivElement | null>(null)

  return (
    <AppModal
      title="Smart Cracker"
      subtitle="Loadout planner — edit freely, then Save or Save as New · breakability & gadget fit"
      size="xl"
      onClose={onClose}
      headerExtra={
        <div
          ref={setHeaderSlot}
          className="flex justify-end px-3 sm:px-4 pb-2 -mt-1 min-h-[2.25rem]"
        />
      }
      overlay={
        <div
          ref={setOverlaySlot}
          className="absolute inset-0 pointer-events-none overflow-hidden z-10"
        />
      }
    >
      <MiningAdvisorChromeProvider headerSlot={headerSlot} overlaySlot={overlaySlot}>
        <MiningLoadoutPanel
          rockTarget={rockTarget}
          selection={selection}
          embedded
          moleSoloMining={moleSoloMining}
          onMoleSoloMiningChange={onMoleSoloMiningChange}
        />
      </MiningAdvisorChromeProvider>
    </AppModal>
  )
}
