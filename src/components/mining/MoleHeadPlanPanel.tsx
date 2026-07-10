import React from 'react'
import { minPowerWarningMessage } from '../../lib/miningMinPowerWarning'
import {
  formatSignedNumber,
  formatSignedPercent,
} from '../../lib/miningLoadoutStatSemantics'
import type { MoleLoadoutStrategy } from '../../lib/moleLoadoutStrategy'

interface MoleHeadPlanPanelProps {
  strategy: MoleLoadoutStrategy
  /** Omit outer card chrome when nested inside Smart Cracker advisor panel */
  embedded?: boolean
}

export default function MoleHeadPlanPanel({ strategy, embedded = false }: MoleHeadPlanPanelProps) {
  const body = (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        Head plan{strategy.soloMining ? ' · solo' : ' · crew'}
      </p>
      <p className="text-[11px] text-slate-400 leading-snug">{strategy.summary}</p>
      {!strategy.canBreak ? (
        <p className="text-xs text-red-400/90">
          No head assignment cracks this rock — try another loadout or check gadget fit in Smart
          Cracker.
        </p>
      ) : null}
      <div className="space-y-1.5">
        {strategy.assignments.map((head) => (
          <div
            key={head.slotIndex}
            className={`text-xs ${
              head.role === 'idle'
                ? 'text-slate-600'
                : head.role === 'support'
                  ? 'text-cyan-300/90'
                  : 'text-green-400/90'
            }`}
          >
            <p>
              Head {head.slotIndex + 1}: {head.label}
              <span className="text-slate-500">
                {' '}
                ·{' '}
                {head.role === 'primary'
                  ? 'Drive'
                  : head.role === 'support' && head.throttlePercent === 100
                    ? 'Full'
                    : head.role === 'support'
                      ? 'Support'
                      : 'Off'}
                {head.role !== 'idle' ? ` @ ${head.throttlePercent}%` : ''}
              </span>
            </p>
            {head.detail ? (
              <p className="pl-2 text-[11px] text-slate-500 leading-snug">{head.detail}</p>
            ) : null}
          </div>
        ))}
      </div>
      {strategy.combinedWindowModifier !== 0 || strategy.combinedInstabilityModifier !== 0 ? (
        <p className="text-[11px] font-mono tabular-nums text-slate-500">
          Active heads combined:
          {strategy.combinedWindowModifier !== 0
            ? ` ${formatSignedPercent(strategy.combinedWindowModifier)} window`
            : ''}
          {strategy.combinedInstabilityModifier !== 0
            ? ` ${formatSignedNumber(strategy.combinedInstabilityModifier)} instability`
            : ''}
        </p>
      ) : null}
      {strategy.minPowerWarnings.length > 0 ? (
        <div className="space-y-1.5">
          {strategy.minPowerWarnings.map((warning) => (
            <div
              key={`mole-min-${warning.slotIndex}`}
              className={`rounded-md border px-2 py-1.5 text-[11px] leading-snug ${
                warning.level === 'misconfigured'
                  ? 'border-amber-900/50 bg-amber-950/20 text-amber-200/90'
                  : 'border-red-900/50 bg-red-950/20 text-red-300/90'
              }`}
            >
              {minPowerWarningMessage(warning)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )

  if (embedded) return body

  return (
    <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/15 p-3">{body}</div>
  )
}
