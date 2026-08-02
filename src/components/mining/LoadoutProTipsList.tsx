import React, { useMemo } from 'react'
import { computeLaserLoadoutBreakdown } from '../../lib/miningLoadoutStats'
import { describeLaserHead, type MiningLaserSlotConfig } from '../../lib/miningLaserStats'
import { getMiningLaserByName } from '../../lib/miningVessels'
import {
  analyzeLoadoutProTips,
  type LoadoutProTip,
  type LoadoutProTipSection,
  type ProTipSectionKind,
} from '../../lib/miningLoadoutStatSemantics'
import type { MiningVesselId } from '../../lib/miningVessels'

const PRO_TIP_SECTION_STYLES: Record<
  ProTipSectionKind,
  { container: string; label: string; outcome: string }
> = {
  problem: {
    container: 'border-amber-800/55 bg-amber-950/30',
    label: 'text-amber-200',
    outcome: 'text-amber-100/80',
  },
  cause: {
    container: 'site-surface',
    label: 'text-slate-300',
    outcome: 'text-slate-400',
  },
  'module-suggestion': {
    container: 'border-emerald-900/45 bg-emerald-950/25',
    label: 'text-emerald-300',
    outcome: 'text-emerald-200/90',
  },
  'module-variation': {
    container: 'border-cyan-900/40 bg-cyan-950/20',
    label: 'text-cyan-300/90',
    outcome: 'text-cyan-200/80',
  },
  'head-suggestion': {
    container: 'border-violet-900/45 bg-violet-950/25',
    label: 'text-violet-300',
    outcome: 'text-violet-200/90',
  },
  'head-alternative': {
    container: 'border-indigo-900/40 bg-indigo-950/20',
    label: 'text-indigo-300/90',
    outcome: 'text-indigo-200/80',
  },
  fallback: {
    container: 'site-surface',
    label: 'text-slate-300',
    outcome: 'text-slate-400',
  },
}

function ProTipSectionBar({ section }: { section: LoadoutProTipSection }) {
  const style = PRO_TIP_SECTION_STYLES[section.kind]
  return (
    <div className={`rounded-md border px-2.5 py-2 ${style.container}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${style.label}`}>
        {section.label}
      </p>
      <p className="text-[11px] text-slate-300 leading-snug mt-0.5">{section.body}</p>
      {section.outcome ? (
        <p className={`text-[11px] font-mono tabular-nums mt-1 ${style.outcome}`}>
          <span>→ {section.outcome}</span>
          {section.improvement ? (
            <span className="text-emerald-400/90 font-sans"> · {section.improvement}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

function ProTipBlock({ tip }: { tip: LoadoutProTip }) {
  return (
    <div className="rounded-lg border border-amber-900/40 site-surface p-2 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90 px-0.5">
        Pro-tip · {tip.statLabel}
      </p>
      {tip.sections.map((section, index) => (
        <ProTipSectionBar key={`${tip.statKey}-${section.kind}-${index}`} section={section} />
      ))}
    </div>
  )
}

interface LoadoutProTipsListProps {
  vesselId: MiningVesselId
  slots: MiningLaserSlotConfig[]
  showHeadLabel?: boolean
}

export default function LoadoutProTipsList({
  vesselId,
  slots,
  showHeadLabel = false,
}: LoadoutProTipsListProps) {
  const headTips = useMemo(() => {
    return slots
      .map((slot, slotIndex) => {
        const breakdown = computeLaserLoadoutBreakdown(slot)
        if (!breakdown) return null
        const tips = analyzeLoadoutProTips(breakdown, slot, vesselId)
        if (tips.length === 0) return null
        const laser = getMiningLaserByName(slot.laserName)
        return {
          slotIndex,
          label: describeLaserHead(slot, laser),
          tips,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
  }, [slots, vesselId])

  if (headTips.length === 0) {
    return (
      <p className="site-hint text-[11px] leading-snug site-surface px-2.5 py-2 !mt-0">
        No module or head suggestions for this loadout right now.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {headTips.map((head) => (
        <div key={`shp-tips-${head.slotIndex}`} className="space-y-1.5">
          {showHeadLabel ? (
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Head {head.slotIndex + 1}
              <span className="text-slate-600 font-normal normal-case tracking-normal">
                {' '}
                · {head.label}
              </span>
            </p>
          ) : (
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {head.label}
            </p>
          )}
          <div className="space-y-2">
            {head.tips.map((tip) => (
              <ProTipBlock key={tip.statKey} tip={tip} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
