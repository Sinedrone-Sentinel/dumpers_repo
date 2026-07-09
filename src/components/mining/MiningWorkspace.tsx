import React, { useCallback, useState } from 'react'
import RockCalculator from './RockCalculator'
import MiningLoadoutPanel from './MiningLoadoutPanel'
import type { RockBreakabilityTarget } from '../../lib/miningLoadoutCompare'
import type { MiningTrackerEntry } from '../../lib/localGuestCache'
import {
  readMiningTrackerUiState,
  writeMiningTrackerUiState,
} from '../../lib/miningTrackerUiState'

interface MiningWorkspaceProps {
  loadEntry: MiningTrackerEntry | null
  loadToken: number
  rockTarget: RockBreakabilityTarget | null
  onRockTargetChange: (target: RockBreakabilityTarget) => void
}

export default function MiningWorkspace({
  loadEntry,
  loadToken,
  rockTarget,
  onRockTargetChange,
}: MiningWorkspaceProps) {
  const [uiState, setUiState] = useState(readMiningTrackerUiState)

  const setSmartCrackerExpanded = useCallback((expanded: boolean) => {
    setUiState((prev) => {
      const next = { ...prev, smartCrackerExpanded: expanded }
      writeMiningTrackerUiState(next)
      return next
    })
  }, [])

  const setCalculatorDetailsExpanded = useCallback((expanded: boolean) => {
    setUiState((prev) => {
      const next = { ...prev, calculatorDetailsExpanded: expanded }
      writeMiningTrackerUiState(next)
      return next
    })
  }, [])

  return (
    <div className="sticky top-14 z-30 -mx-1 sm:mx-0 mb-4">
      <div className="rounded-xl border border-slate-700 bg-slate-950/95 backdrop-blur-sm shadow-lg shadow-black/20">
        <RockCalculator
          variant="strip"
          loadEntry={loadEntry}
          loadToken={loadToken}
          onRockTargetChange={onRockTargetChange}
          detailsExpanded={uiState.calculatorDetailsExpanded}
          onDetailsExpandedChange={setCalculatorDetailsExpanded}
        />

        <div className="border-t border-slate-700/80">
          <button
            type="button"
            onClick={() => setSmartCrackerExpanded(!uiState.smartCrackerExpanded)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800/50 transition-colors rounded-b-xl"
            aria-expanded={uiState.smartCrackerExpanded}
          >
            <svg
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                uiState.smartCrackerExpanded ? 'rotate-90' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/90">
                Smart Cracker
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                Loadout planner, breakability, Mole head plan &amp; gadget fit
              </p>
            </div>
            <span className="text-[10px] text-slate-600 shrink-0 hidden sm:inline">
              {uiState.smartCrackerExpanded ? 'Collapse' : 'Expand'}
            </span>
          </button>

          {uiState.smartCrackerExpanded ? (
            <div className="border-t border-slate-700/60 max-h-[min(50vh,28rem)] overflow-y-auto overscroll-contain">
              <MiningLoadoutPanel rockTarget={rockTarget} variant="workspace" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
