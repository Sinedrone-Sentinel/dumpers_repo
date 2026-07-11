import React from 'react'
import AppModal from '../layout/AppModal'
import SoloMoleGaragePanel from './SoloMoleGaragePanel'
import type { SoloMoleGarageAdvice } from '../../lib/soloMoleLoadoutAdvice'

interface SoloHeadPlanModalProps {
  garageAdvice: SoloMoleGarageAdvice
  loadoutLabel: string
  onClose: () => void
}

export default function SoloHeadPlanModal({
  garageAdvice,
  loadoutLabel,
  onClose,
}: SoloHeadPlanModalProps) {
  return (
    <AppModal
      title="Solo Head Plan"
      subtitle={`${loadoutLabel} · Mole solo garage spread vs rocks you fly solo`}
      size="md"
      onClose={onClose}
    >
      <SoloMoleGaragePanel advice={garageAdvice} />
    </AppModal>
  )
}
