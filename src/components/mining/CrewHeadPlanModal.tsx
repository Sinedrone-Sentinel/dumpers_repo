import React from 'react'
import AppModal from '../layout/AppModal'
import MoleHeadPlanPanel from './MoleHeadPlanPanel'
import type { MoleLoadoutStrategy } from '../../lib/moleLoadoutStrategy'

interface CrewHeadPlanModalProps {
  strategy: MoleLoadoutStrategy
  loadoutLabel: string
  oreName?: string | null
  /** 2 = two-person crew (2X CHP), 3 = full crew (3X+ CHP). */
  crewSize?: 2 | 3
  onClose: () => void
}

export default function CrewHeadPlanModal({
  strategy,
  loadoutLabel,
  oreName = null,
  crewSize = 3,
  onClose,
}: CrewHeadPlanModalProps) {
  return (
    <AppModal
      title={crewSize === 2 ? 'Crew Head Plan · 2-person crew' : 'Crew Head Plan · full crew'}
      subtitle={`${loadoutLabel} · Mole crew turrets vs rock in calculator`}
      size="md"
      onClose={onClose}
    >
      <p className="text-[11px] text-slate-400 mb-2">
        {crewSize === 2
          ? 'Two seats manned — only two heads can be used. The plan below picks your best pair.'
          : 'Full crew — every seat is available. The plan uses the fewest heads that crack the rock with the best power headroom.'}
      </p>
      <MoleHeadPlanPanel strategy={strategy} oreName={oreName} />
    </AppModal>
  )
}
