import React, { useMemo } from 'react'
import BlueprintSlotQualityCard from '../BlueprintSlotQualityCard'
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
  getMiningLaserByName,
  getMiningVessel,
  isBespokeVessel,
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
    hint: 'Bonus damage when the rock shatters.',
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
  { key: 'instability', label: 'Laser instability', value: '0', affectsCracking: false },
  { key: 'shatter', label: 'Shatter damage', value: '0%', affectsCracking: false },
]

function statCopy(line: ModifierStatLine) {
  return (
    STAT_COPY[line.key] ?? {
      title: line.label,
      hint: line.affectsCracking ? 'Used when comparing breakability to your rock.' : '',
    }
  )
}

function StatValueBlock({ line }: { line: ModifierStatLine }) {
  const copy = statCopy(line)
  const isPowerMw = line.key === 'power' && line.value.includes('MW')
  const isEmpty = line.value === '0%' || line.value === '0'

  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-2.5 py-2 space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-[11px] font-medium text-slate-300">{copy.title}</p>
        {line.affectsCracking ? (
          <span className="text-[9px] uppercase tracking-wide text-orange-400/80 font-semibold">
            Fracture
          </span>
        ) : null}
      </div>
      <p
        className={`font-mono tabular-nums leading-none ${
          isPowerMw
            ? 'text-lg font-semibold text-amber-300'
            : isEmpty
              ? 'text-sm text-slate-600'
              : 'text-sm text-slate-200'
        }`}
      >
        {line.value}
      </p>
      {copy.hint ? <p className="text-[10px] text-slate-500 leading-snug">{copy.hint}</p> : null}
    </div>
  )
}

function LoadoutCard({
  title,
  subtitle,
  header,
  children,
  badge,
}: {
  title: string
  subtitle?: string
  header?: React.ReactNode
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="blueprint-card-fixed rounded-xl border border-slate-700/70 bg-slate-900/55 flex flex-col min-h-[11rem]">
      <div className="px-3 py-2.5 border-b border-slate-700/60 bg-slate-800/50 rounded-t-xl space-y-2 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-100">{title}</p>
            {subtitle ? (
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{subtitle}</p>
            ) : null}
          </div>
          {badge}
        </div>
        {header}
      </div>
      <div className="p-3 flex-1 space-y-2">{children}</div>
    </div>
  )
}

function StockStatsBody({ lines }: { lines: ModifierStatLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <StatValueBlock key={`stock-${line.key}`} line={line} />
      ))}
    </>
  )
}

function ModuleStatsBody({ mod, empty }: { mod?: EquippedModuleStats; empty?: boolean }) {
  if (empty || !mod) {
    return (
      <>
        <p className="text-[11px] text-slate-500 leading-snug">
          Empty slot — no module bonuses applied to this head.
        </p>
        {EMPTY_MODULE_LINES.map((line) => (
          <StatValueBlock key={`empty-${line.key}`} line={line} />
        ))}
      </>
    )
  }

  return (
    <>
      {mod.lines.map((line) => (
        <StatValueBlock key={`${mod.name}-${line.key}`} line={line} />
      ))}
    </>
  )
}

function EffectiveStatsBody({ breakdown }: { breakdown: LaserLoadoutBreakdown }) {
  return (
    <>
      {breakdown.effective.map((line) => (
        <StatValueBlock key={`eff-${line.key}`} line={line} />
      ))}
    </>
  )
}

interface HeadSlotCardsProps {
  slotIndex: number
  slot: MiningLaserSlotConfig
  vesselId: MiningVesselId
  editable: boolean
  onChange: (next: MiningLaserSlotConfig) => void
  showHeadLabel: boolean
}

function HeadSlotCards({
  slotIndex,
  slot,
  vesselId,
  editable,
  onChange,
  showHeadLabel,
}: HeadSlotCardsProps) {
  const vessel = getMiningVessel(vesselId)
  const isBespoke = isBespokeVessel(vesselId)
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
  const showCraftedHead = editable && hasBp && (isBespoke || slot.mode === 'custom')

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
      mode: isBespoke ? 'custom' : slot.mode,
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
    <span className="text-xs font-mono tabular-nums text-amber-300/90 shrink-0">
      {formatLaserPowerMw(effective.laserPower)} MW
    </span>
  ) : null

  const headHeader = (
    <div className="space-y-2">
      {editable && !isBespoke && laserOptions.length > 1 ? (
        <select
          value={slot.laserName}
          onChange={(e) =>
            onChange({
              laserName: e.target.value,
              mode: 'stock',
              modules: undefined,
            })
          }
          className="site-input w-full px-2 py-1.5 text-xs"
        >
          {laserOptions.map((opt) => (
            <option key={opt.name} value={opt.name}>
              {opt.displayName}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-white leading-snug">{describeLaserHead(slot, laser)}</p>
      )}

      {editable && hasBp && !isBespoke ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={slot.mode === 'custom'}
            onChange={(e) =>
              e.target.checked
                ? enableCustomHead()
                : onChange({ ...slot, mode: 'stock', slotQualities: undefined })
            }
            className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/40"
          />
          <span className="text-xs text-slate-300">My crafted mining head</span>
        </label>
      ) : null}

      {editable && slot.mode === 'custom' && hasBp && !isBespoke ? (
        <input
          type="text"
          value={slot.customLabel ?? ''}
          onChange={(e) => onChange({ ...slot, customLabel: e.target.value })}
          placeholder="Optional label (e.g. Q847 Helix)"
          className="site-input w-full px-2 py-1 text-xs"
        />
      ) : null}

      {showCraftedHead && isBespoke ? (
        <input
          type="text"
          value={slot.customLabel ?? ''}
          onChange={(e) => onChange({ ...slot, mode: 'custom', customLabel: e.target.value })}
          placeholder="Optional label (e.g. Q720 Pitman)"
          className="site-input w-full px-2 py-1 text-xs"
        />
      ) : null}
    </div>
  )

  const craftBody =
    showCraftedHead && blueprint?.slots?.length ? (
      <div className="space-y-2 pb-1 border-b border-slate-800/80">
        {blueprint.slots.map((bpSlot, bpIdx) => {
          const quality = resolvedQualities[bpIdx]
          const modifiers = bpSlot.options?.[0]?.modifiers
          const modifierResults = calculateSlotModifiers(quality, modifiers)
          return (
            <BlueprintSlotQualityCard
              key={bpIdx}
              slot={bpSlot}
              slotIndex={bpIdx}
              quality={quality}
              onQualityChange={handleQualityChange}
              modifierResults={modifierResults}
              compact
            />
          )
        })}
        {effective && effective.powerMultiplier !== 1 ? (
          <p className="text-[11px] text-slate-500">
            Craft roll: {effective.powerMultiplier >= 1 ? '+' : ''}
            {Math.round((effective.powerMultiplier - 1) * 100)}% power vs stock
          </p>
        ) : null}
      </div>
    ) : null

  const cards: React.ReactNode[] = []

  cards.push(
    <LoadoutCard
      key="head"
      title={headTitle}
      subtitle="Stock head stats before modules and craft bonuses."
      header={headHeader}
      badge={powerBadge}
    >
      {craftBody}
      {breakdown ? (
        <StockStatsBody lines={breakdown.stock} />
      ) : (
        <p className="text-[11px] text-slate-500">Head data unavailable.</p>
      )}
    </LoadoutCard>
  )

  if (moduleSlots > 0) {
    for (let modIdx = 0; modIdx < moduleSlots; modIdx++) {
      const selected = resolvedModules[modIdx]
      const equipped = equippedBySlot.get(modIdx)
      const modMeta = selected ? getMiningModuleByName(selected) : null

      cards.push(
        <LoadoutCard
          key={`mod-${modIdx}`}
          title={`Module slot ${modIdx + 1}`}
          subtitle={
            modMeta
              ? modMeta.kind === 'active'
                ? 'Active module — bonuses while the laser runs.'
                : 'Passive module — always on for this head.'
              : 'No module equipped in this slot.'
          }
          header={
            editable ? (
              <select
                value={selected ?? ''}
                onChange={(e) => handleModuleChange(modIdx, e.target.value)}
                className="site-input w-full px-2 py-1.5 text-xs"
              >
                <option value="">— Empty —</option>
                {moduleOptions.map((mod) => (
                  <option key={mod.name} value={mod.name}>
                    {mod.displayName}
                    {mod.kind === 'active' ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-300">
                {modMeta?.displayName ?? '— Empty —'}
              </p>
            )
          }
        >
          <ModuleStatsBody mod={equipped} empty={!selected} />
        </LoadoutCard>
      )
    }
  } else {
    cards.push(
      <LoadoutCard
        key="no-modules"
        title="Module slots"
        subtitle="This mining head cannot equip modules."
      >
        <p className="text-[11px] text-slate-500 leading-snug">
          No module hardpoints on this head — only stock and craft stats apply.
        </p>
      </LoadoutCard>
    )
  }

  cards.push(
    <LoadoutCard
      key="effective"
      title="Effective totals"
      subtitle="Combined head + craft + modules — used for breakability vs your rock."
    >
      {breakdown ? (
        <EffectiveStatsBody breakdown={breakdown} />
      ) : (
        <p className="text-[11px] text-slate-500">Totals unavailable.</p>
      )}
    </LoadoutCard>
  )

  return <>{cards}</>
}

export interface LoadoutHeadCardsGridProps {
  vesselId: MiningVesselId
  slots: MiningLaserSlotConfig[]
  editable: boolean
  onSlotChange: (index: number, next: MiningLaserSlotConfig) => void
}

export default function LoadoutHeadCardsGrid({
  vesselId,
  slots,
  editable,
  onSlotChange,
}: LoadoutHeadCardsGridProps) {
  if (slots.length === 0) return null

  const isMole = vesselId === 'mole' && slots.length > 1

  return (
    <section className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Head breakdown
      </p>

      {isMole ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
          {slots.map((slot, index) => (
            <div key={`head-col-${index}`} className="space-y-3 min-w-0">
              <HeadSlotCards
                slotIndex={index}
                slot={slot}
                vesselId={vesselId}
                editable={editable}
                onChange={(next) => onSlotChange(index, next)}
                showHeadLabel
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="blueprint-card-grid items-stretch">
          <HeadSlotCards
            slotIndex={0}
            slot={slots[0]}
            vesselId={vesselId}
            editable={editable}
            onChange={(next) => onSlotChange(0, next)}
            showHeadLabel={slots.length > 1}
          />
        </div>
      )}
    </section>
  )
}
