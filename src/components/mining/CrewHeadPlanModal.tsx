import React from 'react'
import AppModal from '../layout/AppModal'
import MoleHeadPlanPanel from './MoleHeadPlanPanel'
import type { MoleLoadoutStrategy } from '../../lib/moleLoadoutStrategy'

interface CrewHeadPlanModalProps {
  strategy: MoleLoadoutStrategy
  loadoutLabel: string
  onClose: () => void
}

export default function CrewHeadPlanModal({
  strategy,
  loadoutLabel,
  onClose,
}: CrewHeadPlanModalProps) {
  return (
    <AppModal
      title="Crew Head Plan"
      subtitle={`${loadoutLabel} · Mole crew turrets vs rock in calculator`}
      size="md"
      onClose={onClose}
    >
      <MoleHeadPlanPanel strategy={strategy} />
    </AppModal>
  )
}
