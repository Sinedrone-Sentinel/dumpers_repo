import React, { useMemo, useState } from 'react'
import BlueprintSlotQualityCard from '../BlueprintSlotQualityCard'
import SiteTooltip from '../SiteTooltip'
import {
  buildDefaultSlotQualities,
  mergeSlotQualities,
} from '../../lib/blueprintQuality'
import { calculateSlotModifiers } from '../../lib/qualityModifiers'
import {
  computeEffectiveLaserStats,
  describeLaserHead,
  formatLaserPowerMw,
  getBlueprintForLaser,
  laserHasBlueprint,
  type MiningLaserSlotConfig,
} from '../../lib/miningLaserStats'
import {
  computeLaserLoadoutBreakdown,
  type EquippedModuleStats,
  type LaserLoadoutBreakdown,
  type ModifierStatLine,
} from '../../lib/miningLoadoutStats'
import {
  getMiningModuleByName,
  listMiningModules,
  normalizeModuleSelection,
} from '../../lib/miningModules'
import {
  analyzeLoadoutProTips,
  statValueColorClass,
  type LoadoutProTip,
  type LoadoutProTipSection,
  type ProTipSectionKind,
} from '../../lib/miningLoadoutStatSemantics'
import {
  getMiningLaserByName,
  getMiningVessel,
  listMiningLasersForVessel,
  type MiningVesselId,
} from '../../lib/miningVessels'

const STAT_COPY: Record<string, { title: string; hint: string }> = {
  power: {
    title: 'Fracture power',
    hint: 'MW this head puts into the rock while cracking.',
  },
  resistance: {
    title: 'Resistance shift',
    hint: 'Lowers or raises effective rock resistance. Negative helps on tough rocks.',
  },
  window: {
    title: 'Charge window',
    hint: 'Wider window = easier to stay in the green fracture band.',
  },
  filter: {
    title: 'Inert filter',
    hint: 'How aggressively this head ignores inert material.',
  },
  instability: {
    title: 'Laser instability',
    hint: 'Extra instability added while the laser is charging.',
  },
  shatter: {
    title: 'Shatter damage',
    hint: 'Extra yield lost if the rock cracks while overcharged. Negative reduces shatter; positive punishes sloppy fractures.',
  },
  'craft-power': {
    title: 'Crafted head power',
    hint: 'Power change from your blueprint craft slot qualities.',
  },
  'module-power': {
    title: 'Module power change',
    hint: 'Power shift from modules, calculated from the stock head base.',
  },
}

const EMPTY_MODULE_LINES: ModifierStatLine[] = [
  { key: 'power', label: 'Laser power', value: '0%', affectsCracking: true },
  { key: 'resistance', label: 'Resistance', value: '0%', affectsCracking: true },
  { key: 'window', label: 'Optimal charge window', value: '0%', affectsCracking: false },
  { key: 'filter', label: 'Inert filter', value: '0%', affectsCracking: false },
  { key: 'instability', label: 'Laser instability', value: '0%', affectsCracking: true },
  { key: 'shatter', label: 'Shatter damage', value: '0%', affectsCracking: false },
]

const SLOT_GRID_COLS: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

function statCopy(line: ModifierStatLine) {
  return (
    STAT_COPY[line.key] ?? {
      title: line.label,
      hint: line.affectsCracking ? 'Used when comparing breakability to your rock.' : '',
    }
  )
}

function StatLabel({ title, hint }: { title: string; hint?: string }) {
  if (!hint) {
    return <span className="text-[10px] font-medium text-slate-400 truncate">{title}</span>
  }
  return (
    <SiteTooltip content={hint} side="top">
      <span className="text-[10px] font-medium text-slate-400 truncate cursor-help border-b border-dotted border-slate-600/80">
        {title}
      </span>
    </SiteTooltip>
  )
}

function StatValueRow({ line }: { line: ModifierStatLine }) {
  const copy = statCopy(line)

  return (
    <div className="site-surface flex items-center justify-between gap-1 rounded px-1.5 py-0.5 min-w-0">
      <div className="flex items-center gap-0.5 min-w-0">
        <StatLabel title={copy.title} hint={copy.hint} />
        {line.affectsCracking ? (
          <span className="text-[8px] uppercase tracking-wide text-orange-400/75 font-semibold shrink-0">
            F
          </span>
        ) : null}
      </div>
      <span
        className={`text-[10px] font-mono tabular-nums shrink-0 leading-none ${statValueColorClass(line.key, line.value)}`}
      >
        {line.value}
      </span>
    </div>
  )
}

function EffectiveStatTile({ line }: { line: ModifierStatLine }) {
  const copy = statCopy(line)

  return (
    <div className="site-surface rounded px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 min-w-0 text-center">
      <div className="flex items-center gap-1">
        <StatLabel title={copy.title} hint={copy.hint} />
        {line.affectsCracking ? (
          <span className="text-[8px] uppercase tracking-wide text-orange-400/75 font-semibold">
            F
          </span>
        ) : null}
      </div>
      <span className="font-mono tabular-nums leading-none">
        <span className={statValueColorClass(line.key, line.value, true)}>{line.value}</span>
        {line.activeValue ? (
          <>
            <span className="text-slate-600"> / </span>
            <SiteTooltip content="With every equipped active module turned on." side="top">
              <span className="text-sky-400 cursor-help">{line.activeValue}</span>
            </SiteTooltip>
          </>
        ) : null}
      </span>
    </div>
  )
}

function LoadoutCard({
  title,
  titleHint,
  header,
  children,
  badge,
}: {
  title: string
  titleHint?: string
  header?: React.ReactNode
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="site-section flex flex-col min-w-0">
      <div className="site-section-header !px-2 !py-1.5 space-y-1 shrink-0">
        <div className="flex items-center justify-between gap-1">
          <StatLabel title={title} hint={titleHint} />
          {badge}
        </div>
        {header}
      </div>
      <div className="site-section-body !p-1.5 flex-1 flex flex-col gap-0.5 min-w-0">{children}</div>
    </div>
  )
}

function StockStatsBody({ lines }: { lines: ModifierStatLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <StatValueRow key={`stock-${line.key}`} line={line} />
      ))}
    </>
  )
}

function ModuleStatsBody({ mod, empty }: { mod?: EquippedModuleStats; empty?: boolean }) {
  const lines = empty || !mod ? EMPTY_MODULE_LINES : mod.lines
  return (
    <>
      {lines.map((line) => (
        <StatValueRow key={`mod-${line.key}-${line.value}`} line={line} />
      ))}
    </>
  )
}

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

function ProTipBlock({
  tip,
  collapsible,
}: {
  tip: LoadoutProTip
  collapsible: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (!collapsible) {
    return (
      <div className="site-surface border-amber-900/40 p-2 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90 px-0.5">
          Pro-tip · {tip.statLabel}
        </p>
        {tip.sections.map((section, index) => (
          <ProTipSectionBar key={`${tip.statKey}-${section.kind}-${index}`} section={section} />
        ))}
      </div>
    )
  }

  return (
    <div className="site-section border-amber-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="site-section-header w-full flex items-center justify-between gap-2 !px-2 !py-1.5 text-left transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90">
          Pro-tip · {tip.statLabel}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded ? (
        <div className="px-2 pb-2 space-y-1.5 border-t border-amber-900/25">
          {tip.sections.map((section, index) => (
            <ProTipSectionBar key={`${tip.statKey}-${section.kind}-${index}`} section={section} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EffectiveTotalsCard({
  breakdown,
  slot,
  vesselId,
  moleSoloMining,
}: {
  breakdown: LaserLoadoutBreakdown
  slot: MiningLaserSlotConfig
  vesselId: MiningVesselId
  moleSoloMining: boolean
}) {
  const proTips = useMemo(() => {
    if (vesselId === 'mole' && !moleSoloMining) return []
    return analyzeLoadoutProTips(breakdown, slot, vesselId)
  }, [breakdown, slot, vesselId, moleSoloMining])

  const collapsibleProTips = vesselId === 'mole'

  return (
    <div className="site-section col-span-full">
      <div className="site-section-header !px-2 !py-1.5">
        <StatLabel
          title="Effective totals"
          hint="Combined head + craft + passive modules — used for breakability vs your rock. A blue value after the / shows the stat with all active modules turned on."
        />
      </div>
      <div className="p-2 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {breakdown.effective.map((line) => (
          <EffectiveStatTile key={`eff-${line.key}`} line={line} />
        ))}
      </div>
      {proTips.length > 0 ? (
        <div className="px-2 pb-2 space-y-2">
          {proTips.map((tip) => (
            <ProTipBlock key={tip.statKey} tip={tip} collapsible={collapsibleProTips} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CraftSlotsPanel({
  blueprint,
  resolvedQualities,
  onQualityChange,
  effective,
}: {
  blueprint: NonNullable<ReturnType<typeof getBlueprintForLaser>>
  resolvedQualities: Record<number, number>
  onQualityChange: (bpSlotIndex: number, quality: number) => void
  effective: ReturnType<typeof computeEffectiveLaserStats>
}) {
  const [expanded, setExpanded] = useState(true)
  const slotCount = blueprint.slots?.length ?? 0

  if (!slotCount) return null

  return (
    <div className="site-section border-orange-900/35 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="site-section-header w-full flex items-center justify-between gap-2 !px-2 !py-1.5 text-left transition-colors border-b border-orange-900/20"
        aria-expanded={expanded}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide text-orange-300/90">
          Craft slots
          <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-500">
            ({slotCount} {slotCount === 1 ? 'slot' : 'slots'})
          </span>
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded ? (
        <div className="p-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 min-w-0">
            {blueprint.slots!.map((bpSlot, bpIdx) => {
              const quality = resolvedQualities[bpIdx]
              const modifiers = bpSlot.options?.[0]?.modifiers
              const modifierResults = calculateSlotModifiers(quality, modifiers)
              return (
                <BlueprintSlotQualityCard
                  key={bpIdx}
                  slot={bpSlot}
                  slotIndex={bpIdx}
                  quality={quality}
                  onQualityChange={onQualityChange}
                  modifierResults={modifierResults}
                  compact
                />
              )
            })}
          </div>
          {effective && effective.powerMultiplier !== 1 ? (
            <p className="text-[9px] text-slate-500 px-0.5">
              Craft power: {effective.powerMultiplier >= 1 ? '+' : ''}
              {Math.round((effective.powerMultiplier - 1) * 100)}%
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface HeadSlotCardsProps {
  slotIndex: number
  slot: MiningLaserSlotConfig
  vesselId: MiningVesselId
  editable: boolean
  moleSoloMining: boolean
  onChange: (next: MiningLaserSlotConfig) => void
  showHeadLabel: boolean
}

function HeadSlotCards({
  slotIndex,
  slot,
  vesselId,
  editable,
  moleSoloMining,
  onChange,
  showHeadLabel,
}: HeadSlotCardsProps) {
  const vessel = getMiningVessel(vesselId)
  const laserOptions = useMemo(
    () => (vessel ? listMiningLasersForVessel(vessel) : []),
    [vessel]
  )
  const laser = getMiningLaserByName(slot.laserName)
  const blueprint = getBlueprintForLaser(slot.laserName)
  const hasBp = laserHasBlueprint(slot.laserName)
  const effective = computeEffectiveLaserStats(slot)
  const moduleOptions = useMemo(() => listMiningModules(), [])
  const moduleSlots = laser?.moduleSlotCount ?? 0
  const resolvedModules = useMemo(
    () => normalizeModuleSelection(slot.laserName, slot.modules),
    [slot.laserName, slot.modules]
  )
  const breakdown = useMemo(() => computeLaserLoadoutBreakdown(slot), [slot])
  const showCraftedHead = editable && hasBp && slot.mode === 'custom'

  const resolvedQualities = useMemo(
    () => (blueprint ? mergeSlotQualities(blueprint, slot.slotQualities) : {}),
    [blueprint, slot.slotQualities]
  )

  const equippedBySlot = useMemo(() => {
    const map = new Map<number, EquippedModuleStats>()
    if (!breakdown) return map
    resolvedModules.forEach((name, index) => {
      if (!name) return
      const mod = breakdown.equippedModules.find((row) => row.name === name)
      if (mod) map.set(index, mod)
    })
    return map
  }, [breakdown, resolvedModules])

  const handleModuleChange = (moduleIndex: number, moduleName: string) => {
    const next = [...resolvedModules]
    next[moduleIndex] = moduleName || null
    onChange({ ...slot, modules: next })
  }

  const handleQualityChange = (bpSlotIndex: number, quality: number) => {
    onChange({
      ...slot,
      mode: 'custom',
      slotQualities: { ...(slot.slotQualities ?? {}), [bpSlotIndex]: quality },
    })
  }

  const enableCustomHead = () => {
    if (!blueprint) return
    const seeded =
      slot.slotQualities && Object.keys(slot.slotQualities).length > 0
        ? slot.slotQualities
        : buildDefaultSlotQualities(blueprint)
    onChange({ ...slot, mode: 'custom', slotQualities: seeded })
  }

  const headTitle = showHeadLabel ? `Head ${slotIndex + 1}` : 'Mining head'
  const powerBadge = effective ? (
    <span className="text-[10px] font-mono tabular-nums text-amber-300/90 shrink-0">
      {formatLaserPowerMw(effective.laserPower)}
    </span>
  ) : null

  const headHeader = (
    <div className="space-y-1">
      {editable && laserOptions.length > 1 ? (
        <select
          value={slot.laserName}
          onChange={(e) =>
            onChange({
              laserName: e.target.value,
              mode: 'stock',
              modules: undefined,
            })
          }
          className="site-input w-full px-1.5 py-1 text-[11px]"
        >
          {laserOptions.map((opt) => (
            <option key={opt.name} value={opt.name}>
              {opt.displayName}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-[11px] text-white leading-snug truncate" title={describeLaserHead(slot, laser)}>
          {describeLaserHead(slot, laser)}
        </p>
      )}

      {editable && hasBp ? (
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={slot.mode === 'custom'}
            onChange={(e) =>
              e.target.checked
                ? enableCustomHead()
                : onChange({ ...slot, mode: 'stock', slotQualities: undefined })
            }
            className="site-checkbox focus:ring-orange-500/40"
          />
          <span className="text-[10px] text-slate-300">Crafted head</span>
        </label>
      ) : null}

      {editable && slot.mode === 'custom' && hasBp ? (
        <input
          type="text"
          value={slot.customLabel ?? ''}
          onChange={(e) => onChange({ ...slot, customLabel: e.target.value })}
          placeholder="Label (optional)"
          className="site-input w-full px-1.5 py-0.5 text-[10px]"
        />
      ) : null}
    </div>
  )

  const craftBody =
    showCraftedHead && blueprint?.slots?.length ? (
      <CraftSlotsPanel
        blueprint={blueprint}
        resolvedQualities={resolvedQualities}
        onQualityChange={handleQualityChange}
        effective={effective}
      />
    ) : null

  const rowSlotCount = moduleSlots > 0 ? 1 + moduleSlots : 2
  const gridColsClass = SLOT_GRID_COLS[rowSlotCount] ?? 'grid-cols-4'

  return (
    <div className="space-y-2 min-w-0">
      <div className={`grid ${gridColsClass} gap-1.5 min-w-0`}>
        <LoadoutCard
          title={headTitle}
          titleHint="Stock head stats before modules and craft bonuses."
          header={headHeader}
          badge={powerBadge}
        >
          {breakdown ? (
            <StockStatsBody lines={breakdown.stock} />
          ) : (
            <p className="text-[10px] text-slate-500">Unavailable</p>
          )}
        </LoadoutCard>

        {moduleSlots > 0 ? (
          Array.from({ length: moduleSlots }, (_, modIdx) => {
            const selected = resolvedModules[modIdx]
            const equipped = equippedBySlot.get(modIdx)
            const modMeta = selected ? getMiningModuleByName(selected) : null

            return (
              <LoadoutCard
                key={`mod-${modIdx}`}
                title={`Mod ${modIdx + 1}`}
                titleHint={
                  modMeta
                    ? modMeta.kind === 'active'
                      ? 'Active module — off by default; switch it on when you need it. Every installed active can run at once. Effective totals show its bonus as the blue value.'
                      : 'Passive module — always on for this head.'
                    : 'No module equipped in this slot.'
                }
                header={
                  editable ? (
                    <select
                      value={selected ?? ''}
                      onChange={(e) => handleModuleChange(modIdx, e.target.value)}
                      className="site-input w-full px-1.5 py-1 text-[11px]"
                    >
                      <option value="">— Empty —</option>
                      {moduleOptions.map((mod) => (
                        <option key={mod.name} value={mod.name}>
                          {mod.displayName}
                          {mod.kind === 'active' ? ' (A)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-slate-300 truncate">
                      {modMeta?.displayName ?? '— Empty —'}
                    </p>
                  )
                }
              >
                <ModuleStatsBody mod={equipped} empty={!selected} />
              </LoadoutCard>
            )
          })
        ) : (
          <LoadoutCard
            title="Modules"
            titleHint="This mining head cannot equip modules."
          >
            <p className="text-[10px] text-slate-500">No hardpoints</p>
          </LoadoutCard>
        )}
      </div>

      {craftBody}

      {breakdown ? (
        <EffectiveTotalsCard
          breakdown={breakdown}
          slot={slot}
          vesselId={vesselId}
          moleSoloMining={moleSoloMining}
        />
      ) : (
        <div className="site-surface px-2 py-1.5">
          <p className="text-[10px] text-slate-500">Effective totals unavailable</p>
        </div>
      )}
    </div>
  )
}

export interface LoadoutHeadCardsGridProps {
  vesselId: MiningVesselId
  slots: MiningLaserSlotConfig[]
  editable: boolean
  moleSoloMining?: boolean
  onSlotChange: (index: number, next: MiningLaserSlotConfig) => void
}

export default function LoadoutHeadCardsGrid({
  vesselId,
  slots,
  editable,
  moleSoloMining = true,
  onSlotChange,
}: LoadoutHeadCardsGridProps) {
  if (slots.length === 0) return null

  const isMole = vesselId === 'mole' && slots.length > 1

  return (
    <section className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Head breakdown
      </p>

      {isMole ? (
        <div className="space-y-3">
          {slots.map((slot, index) => (
            <HeadSlotCards
              key={`head-col-${index}`}
              slotIndex={index}
              slot={slot}
              vesselId={vesselId}
              editable={editable}
              moleSoloMining={moleSoloMining}
              onChange={(next) => onSlotChange(index, next)}
              showHeadLabel
            />
          ))}
        </div>
      ) : (
        <HeadSlotCards
          slotIndex={0}
          slot={slots[0]}
          vesselId={vesselId}
          editable={editable}
          moleSoloMining={moleSoloMining}
          onChange={(next) => onSlotChange(0, next)}
          showHeadLabel={slots.length > 1}
        />
      )}
    </section>
  )
}
