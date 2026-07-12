import React from 'react'
import {
  soloMoleGarageRoleHint,
  soloMoleGarageRoleLabel,
  type SoloMoleGarageAdvice,
} from '../../lib/soloMoleLoadoutAdvice'
import { buildWindowBarModel } from '../../lib/miningWindowDisplay'
import WindowSizeBar from './WindowSizeBar'

interface SoloMoleGaragePanelProps {
  advice: SoloMoleGarageAdvice
  /** Selected ore — enables the per-head estimated window bar (head+module mods applied). */
  oreName?: string | null
}

export default function SoloMoleGaragePanel({ advice, oreName = null }: SoloMoleGaragePanelProps) {
  return (
    <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/15 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300/90">
        Solo garage · 3-head spread
      </p>
      <p className="text-[11px] text-slate-400 leading-snug">{advice.summary}</p>
      <div className="space-y-1.5">
        {advice.heads.map((head) => {
          const windowBar = oreName ? buildWindowBarModel(oreName, head.windowModifier) : null
          return (
            <div key={`garage-${head.slotIndex}`} className="text-xs text-slate-300">
              <p className="flex items-center gap-2 flex-wrap">
                <span>
                  <span className="text-cyan-300/90">Head {head.slotIndex + 1}</span>
                  <span className="text-slate-500"> · </span>
                  <span className="text-slate-200">{soloMoleGarageRoleLabel(head.role)}</span>
                  <span className="text-slate-500"> — {head.label}</span>
                </span>
                {windowBar ? <WindowSizeBar model={windowBar} /> : null}
                {windowBar?.saturated ? (
                  <span className="text-[10px] text-slate-500">maxed</span>
                ) : null}
              </p>
              <p className="pl-2 text-[11px] text-slate-500 leading-snug">
                {head.detail}. {soloMoleGarageRoleHint(head.role)}
              </p>
            </div>
          )
        })}
      </div>
      {advice.gaps.length > 0 ? (
        <div className="space-y-1.5 pt-1 border-t border-cyan-900/30">
          {advice.gaps.map((gap) => (
            <p key={gap} className="text-[11px] text-amber-200/90 leading-snug">
              {gap}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
