import React from 'react'
import { minPowerWarningMessage } from '../../lib/miningMinPowerWarning'
import { formatSignedPercent } from '../../lib/miningLoadoutStatSemantics'
import { buildWindowBarModel } from '../../lib/miningWindowDisplay'
import WindowSizeBar from './WindowSizeBar'
import type { MoleLoadoutStrategy } from '../../lib/moleLoadoutStrategy'

interface MoleHeadPlanPanelProps {
  strategy: MoleLoadoutStrategy
  /** Rock ore from the calculator — enables per-head estimated window bars. */
  oreName?: string | null
  /** Omit outer card chrome when nested inside Smart Cracker advisor panel */
  embedded?: boolean
}

export default function MoleHeadPlanPanel({ strategy, oreName = null, embedded = false }: MoleHeadPlanPanelProps) {
  const body = (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        Head plan{strategy.soloMining ? ' · solo' : ' · crew'}
      </p>
      <p className="text-[11px] text-slate-400 leading-snug">{strategy.summary}</p>
      {!strategy.canBreak ? (
        <p className="text-xs text-red-400/90">
          No head on this loadout can crack this rock solo at full throttle — check MW after modules
          and the pilot RES → mining-seat RES shift on each head. Open Smart Cracker to edit modules or
          try crew mode.
        </p>
      ) : null}
      <div className="space-y-1.5">
        {strategy.assignments.map((head) => {
          const isWorkableBackup = head.role === 'idle' && head.backupViability === 'works'
          const headClass =
            head.role === 'primary'
              ? 'text-green-400/90'
              : head.role === 'support'
                ? 'text-cyan-300/90'
                : isWorkableBackup
                  ? 'text-yellow-400/80'
                  : 'text-slate-600'
          const statusLabel =
            head.role === 'primary'
              ? 'Drive'
              : head.role === 'support' && head.throttlePercent === 100
                ? 'Full'
                : head.role === 'support'
                  ? 'Support'
                  : isWorkableBackup
                    ? 'Backup'
                    : 'Off'
          const windowBar =
            strategy.soloMining && oreName && head.backupViability !== 'cannot'
              ? buildWindowBarModel(oreName, head.windowModifierPercent)
              : null
          return (
            <div key={head.slotIndex} className={`text-xs ${headClass}`}>
              <p>
                Head {head.slotIndex + 1}: {head.label}
                <span className={isWorkableBackup ? 'text-yellow-600/80' : 'text-slate-500'}>
                  {' '}
                  · {statusLabel}
                  {head.role !== 'idle' ? ` @ ${head.throttlePercent}%` : ''}
                </span>
              </p>
              {head.detail ? (
                <p
                  className={`pl-2 text-[11px] leading-snug ${
                    isWorkableBackup ? 'text-yellow-700/80' : 'text-slate-500'
                  }`}
                >
                  {head.detail}
                </p>
              ) : null}
              {windowBar ? (
                <div className="pl-2 pt-1 flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 whitespace-nowrap tabular-nums">
                    window{' '}
                    {head.windowModifierPercent !== 0
                      ? `${formatSignedPercent(head.windowModifierPercent)} mods`
                      : 'stock'}
                  </span>
                  <WindowSizeBar model={windowBar} />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {strategy.combinedWindowModifier !== 0 ||
      strategy.combinedInstabilityModifier !== 0 ||
      (!strategy.soloMining && oreName && strategy.canBreak) ? (
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-mono tabular-nums text-slate-500">
            Active heads combined:
            {strategy.combinedWindowModifier !== 0
              ? ` ${formatSignedPercent(strategy.combinedWindowModifier)} window`
              : ''}
            {strategy.combinedInstabilityModifier !== 0
              ? ` ${formatSignedPercent(strategy.combinedInstabilityModifier)} instability`
              : ''}
          </p>
          {!strategy.soloMining && oreName && strategy.canBreak
            ? (() => {
                const combinedBar = buildWindowBarModel(oreName, strategy.combinedWindowModifier)
                return combinedBar ? <WindowSizeBar model={combinedBar} /> : null
              })()
            : null}
        </div>
      ) : null}
      {strategy.minPowerWarnings.length > 0 ? (
        <div className="space-y-1.5">
          {strategy.minPowerWarnings.map((warning) => (
            <div
              key={`mole-min-${warning.slotIndex}`}
              className="rounded-md border px-2 py-1.5 text-[11px] leading-snug border-red-900/50 bg-red-950/20 text-red-300/90"
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
