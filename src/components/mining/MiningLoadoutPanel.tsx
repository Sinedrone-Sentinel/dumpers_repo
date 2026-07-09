import React, { useMemo, useState } from 'react'
import SignInMenu from '../auth/SignInMenu'
import BlueprintSlotQualityCard from '../BlueprintSlotQualityCard'
import { useMiningLoadouts } from '../../contexts/MiningLoadoutContext'
import {
  compareLoadoutToRock,
  isRockBreakabilityTargetReady,
  type LoadoutBreakabilityComparison,
  type RockBreakabilityTarget,
} from '../../lib/miningLoadoutCompare'
import { minPowerWarningMessage } from '../../lib/miningMinPowerWarning'
import {
  buildSmartCracker,
  type SmartCrackerResult,
} from '../../lib/miningGadgetRecommendations'
import {
  buildDefaultSlotQualities,
  mergeSlotQualities,
} from '../../lib/blueprintQuality'
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
  type ModifierStatLine,
} from '../../lib/miningLoadoutStats'
import {
  listMiningModules,
  normalizeModuleSelection,
} from '../../lib/miningModules'
import {
  canCreateMoreLoadouts,
  canDeleteLoadout,
  isCustomLoadoutKey,
  listLoadoutsForVessel,
  type LoadoutKey,
} from '../../lib/miningLoadoutStorage'
import { calculateSlotModifiers } from '../../lib/qualityModifiers'
import {
  getMiningLaserByName,
  getMiningVessel,
  isBespokeVessel,
  listMiningLasersForVessel,
  MINING_VESSELS,
  type MiningVesselId,
} from '../../lib/miningVessels'

interface MiningLoadoutPanelProps {
  rockTarget: RockBreakabilityTarget | null
  variant?: 'sidebar' | 'workspace'
}

function CheckIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function StatLineRow({ line }: { line: ModifierStatLine }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-slate-500 shrink-0">
        {line.label}
        {line.affectsCracking ? (
          <span className="text-slate-600" title="Used in rock fracture comparison">
            {' '}
            · crack
          </span>
        ) : null}
      </span>
      <span className="font-mono tabular-nums text-slate-300 text-right">{line.value}</span>
    </div>
  )
}

function LaserStatsInfoPanel({ slot }: { slot: MiningLaserSlotConfig }) {
  const breakdown = useMemo(() => computeLaserLoadoutBreakdown(slot), [slot])

  if (!breakdown) return null

  return (
    <div className="rounded-md border border-slate-700/50 bg-slate-950/40 p-2 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Head stats</p>
      <div className="space-y-0.5">
        {breakdown.stock.map((line) => (
          <StatLineRow key={`stock-${line.key}`} line={line} />
        ))}
      </div>

      {breakdown.equippedModules.length > 0 ? (
        <div className="pt-1 border-t border-slate-700/40 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Modules</p>
          {breakdown.equippedModules.map((mod) => (
            <div key={mod.name} className="space-y-0.5">
              <p className="text-[11px] text-slate-400">
                {mod.displayName}
                {mod.kind === 'active' ? (
                  <span className="text-slate-600"> (active)</span>
                ) : null}
              </p>
              {mod.lines.map((line) => (
                <StatLineRow key={`${mod.name}-${line.key}`} line={line} />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="pt-1 border-t border-slate-700/40 space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Effective</p>
        {breakdown.effective.map((line) => (
          <StatLineRow key={`eff-${line.key}`} line={line} />
        ))}
      </div>
    </div>
  )
}

function SmartCrackerPanel({
  result,
  moleSoloMining,
  onMoleSoloMiningChange,
  showSoloToggle,
}: {
  result: SmartCrackerResult
  moleSoloMining: boolean
  onMoleSoloMiningChange: (solo: boolean) => void
  showSoloToggle: boolean
}) {
  const { crackGadget, qualityGadget, moleStrategy } = result
  const hasGadget = crackGadget != null || qualityGadget != null
  const activeMoleHeads =
    moleStrategy?.assignments.filter((head) => head.role !== 'idle') ?? []

  if (!hasGadget && !moleStrategy && !showSoloToggle) return null

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 p-3 space-y-3">
      {showSoloToggle ? (
        <label className="flex items-start gap-2.5 rounded-md border border-slate-700/60 bg-slate-900/50 px-2.5 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={moleSoloMining}
            onChange={(event) => onMoleSoloMiningChange(event.target.checked)}
            className="mt-0.5 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/40"
          />
          <span className="text-xs text-slate-400 leading-snug">
            <span className="text-slate-200">Solo mining</span> — one laser only, same as a
            Prospector. Mole just gives you three heads to choose from. Uncheck if a friend is
            running extra turrets with you.
          </span>
        </label>
      ) : null}

      {moleStrategy ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            Head plan{moleStrategy.soloMining ? ' · solo' : ' · crew'}
          </p>
          <p className="text-[11px] text-slate-400 leading-snug">{moleStrategy.summary}</p>
          {!moleStrategy.canBreak ? (
            <p className="text-xs text-red-400/90">
              No head assignment cracks this rock — see final gadget fit below or try another
              loadout.
            </p>
          ) : null}
          <div className="space-y-1.5">
            {moleStrategy.assignments.map((head) => (
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
                      ? 'Fracture'
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
          {moleStrategy.combinedWindowModifier > 0 ||
          moleStrategy.combinedInstabilityModifier < 0 ? (
            <p className="text-[11px] font-mono tabular-nums text-slate-500">
              Active heads combined:
              {moleStrategy.combinedWindowModifier !== 0
                ? ` ${moleStrategy.combinedWindowModifier > 0 ? '+' : ''}${Math.round(moleStrategy.combinedWindowModifier)}% window`
                : ''}
              {moleStrategy.combinedInstabilityModifier !== 0
                ? ` ${moleStrategy.combinedInstabilityModifier > 0 ? '+' : ''}${Math.round(moleStrategy.combinedInstabilityModifier)} instability`
                : ''}
            </p>
          ) : null}
          {moleStrategy.minPowerWarnings.length > 0 ? (
            <div className="space-y-1.5">
              {moleStrategy.minPowerWarnings.map((warning) => (
                <div
                  key={`mole-min-${warning.slotIndex}`}
                  className={`rounded-md border px-2 py-1.5 text-[11px] leading-snug ${
                    warning.level === 'feather'
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
      ) : null}

      {hasGadget ? (
        <div
          className={`space-y-2 ${moleStrategy ? 'pt-2 border-t border-slate-700/60' : ''}`}
        >
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Final gadget fit</p>
          <p className="text-[11px] text-slate-600">
            Based on {moleStrategy ? 'the head plan above' : 'your loadout vs this rock'}.
          </p>

          {crackGadget ? (
            <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-2 space-y-1">
              <p className="text-xs font-medium text-amber-300">
                Try {crackGadget.gadget.displayName}
              </p>
              <p className="text-[11px] text-slate-400 leading-snug">{crackGadget.reason}</p>
              <p className="text-[11px] font-mono tabular-nums text-slate-500">
                Required {crackGadget.requiredPower.toLocaleString()} MW with gadget
              </p>
            </div>
          ) : null}

          {qualityGadget ? (
            <div className="rounded-md border border-cyan-900/40 bg-cyan-950/15 p-2 space-y-1">
              <p className="text-xs font-medium text-cyan-300">
                Consider {qualityGadget.gadget.displayName}
              </p>
              <p className="text-[11px] text-slate-400 leading-snug">{qualityGadget.reason}</p>
            </div>
          ) : null}
        </div>
      ) : moleStrategy?.canBreak ? (
        <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-700/60">
          No gadget needed for this rock at the current head plan.
        </p>
      ) : null}
    </div>
  )
}

function ComparisonPanel({ comparison }: { comparison: LoadoutBreakabilityComparison }) {
  const multiLaser = comparison.lasers.length > 1
  const hasMinPowerWarnings = comparison.minPowerWarnings.length > 0

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Rock breakability
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">Required power</span>
        <span className="text-sm font-mono tabular-nums text-amber-300">
          {comparison.requiredPower.toLocaleString()} MW
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">Loadout power</span>
        <span className="text-sm font-mono tabular-nums text-white">
          {comparison.totalLaserPower.toLocaleString()} MW
        </span>
      </div>
      <div
        className={`flex items-center gap-2 text-sm font-medium ${
          comparison.canBreak ? 'text-green-400' : 'text-red-400'
        }`}
      >
        <CheckIcon ok={comparison.canBreak} />
        {comparison.canBreak
          ? 'Can fracture this rock'
          : `Short ${comparison.totalShortfallMw.toLocaleString()} MW`}
      </div>

      {hasMinPowerWarnings ? (
        <div className="pt-2 border-t border-slate-700/60 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Minimum throttle</p>
          {comparison.minPowerWarnings.map((warning) => (
            <div
              key={warning.slotIndex}
              className={`rounded-md border px-2 py-1.5 text-[11px] leading-snug ${
                warning.level === 'feather'
                  ? 'border-amber-900/50 bg-amber-950/20 text-amber-200/90'
                  : 'border-red-900/50 bg-red-950/20 text-red-300/90'
              }`}
            >
              {multiLaser ? (
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
                  Head {warning.slotIndex + 1}: {warning.label}
                </p>
              ) : null}
              {minPowerWarningMessage(warning)}
            </div>
          ))}
        </div>
      ) : null}

      {multiLaser ? (
        <div className="pt-2 border-t border-slate-700/60 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Per laser</p>
          {comparison.lasers.map((row) => (
            <div key={row.slotIndex} className="text-xs space-y-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <CheckIcon ok={row.canBreakShare} />
                <span className="text-slate-300 truncate" title={row.label}>
                  {row.label}
                </span>
              </div>
              <div className="pl-5 font-mono tabular-nums text-slate-400">
                {row.laserPower.toLocaleString()} / {row.requiredShare.toLocaleString()} MW
                {!row.canBreakShare ? (
                  <span className="text-red-400/90"> (−{row.shortfallMw.toLocaleString()})</span>
                ) : row.throttlePercent < 100 ? (
                  <span className="text-slate-500"> @ {row.throttlePercent}% throttle</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LaserSlotEditor({
  slotIndex,
  slot,
  vesselId,
  editable,
  onChange,
}: {
  slotIndex: number
  slot: MiningLaserSlotConfig
  vesselId: MiningVesselId
  editable: boolean
  onChange: (next: MiningLaserSlotConfig) => void
}) {
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
  const showCraftedHead = editable && hasBp && (isBespoke || slot.mode === 'custom')

  const resolvedQualities = useMemo(
    () => (blueprint ? mergeSlotQualities(blueprint, slot.slotQualities) : {}),
    [blueprint, slot.slotQualities]
  )

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
    onChange({
      ...slot,
      mode: 'custom',
      slotQualities: seeded,
    })
  }

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          Laser {slotIndex + 1}
        </span>
        {effective ? (
          <span className="text-xs font-mono tabular-nums text-amber-300/90">
            {formatLaserPowerMw(effective.laserPower)} MW
          </span>
        ) : null}
      </div>

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
        <p className="text-sm text-white">
          {describeLaserHead(slot, laser)}
          {isBespoke && editable ? (
            <span className="block text-[11px] text-slate-500 mt-0.5">
              Bespoke — Pitman head only (crafted)
            </span>
          ) : null}
        </p>
      )}

      {editable && hasBp && !isBespoke ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={slot.mode === 'custom'}
              onChange={(e) =>
                e.target.checked
                  ? enableCustomHead()
                  : onChange({
                      ...slot,
                      mode: 'stock',
                      slotQualities: undefined,
                    })
              }
              className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/40"
            />
            <span className="text-xs text-slate-300">My crafted mining head</span>
          </label>

          {slot.mode === 'custom' ? (
            <>
              <input
                type="text"
                value={slot.customLabel ?? ''}
                onChange={(e) => onChange({ ...slot, customLabel: e.target.value })}
                placeholder="Optional label (e.g. Q847 Helix)"
                className="site-input w-full px-2 py-1 text-xs"
              />
              {blueprint?.slots?.map((bpSlot, bpIdx) => {
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
            </>
          ) : null}
        </div>
      ) : null}

      {showCraftedHead && isBespoke ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Your crafted Pitman head</p>
          <input
            type="text"
            value={slot.customLabel ?? ''}
            onChange={(e) =>
              onChange({ ...slot, mode: 'custom', customLabel: e.target.value })
            }
            placeholder="Optional label (e.g. Q720 Pitman)"
            className="site-input w-full px-2 py-1 text-xs"
          />
          {blueprint?.slots?.map((bpSlot, bpIdx) => {
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
      ) : null}

      {moduleSlots > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            Modules {editable ? '' : '(factory — none)'}
          </p>
          {editable ? (
            resolvedModules.map((selected, modIdx) => (
              <select
                key={modIdx}
                value={selected ?? ''}
                onChange={(e) => handleModuleChange(modIdx, e.target.value)}
                className="site-input w-full px-2 py-1 text-xs"
              >
                <option value="">— Empty —</option>
                {moduleOptions.map((mod) => (
                  <option key={mod.name} value={mod.name}>
                    {mod.displayName}
                    {mod.kind === 'active' ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            ))
          ) : (
            <p className="text-[11px] text-slate-500">No modules equipped</p>
          )}
        </div>
      ) : null}

      <LaserStatsInfoPanel slot={slot} />

      {!editable && slot.mode === 'custom' && slot.customLabel ? (
        <p className="text-[11px] text-slate-500">{slot.customLabel}</p>
      ) : null}
    </div>
  )
}

function LoadoutSignInGate({ variant = 'sidebar' }: { variant?: 'sidebar' | 'workspace' }) {
  if (variant === 'workspace') {
    return (
      <div className="px-3 py-4 text-center space-y-3">
        <p className="text-sm text-slate-400">
          Sign in to plan loadouts, compare laser power, and use Smart Cracker gadget suggestions.
        </p>
        <div className="flex justify-center">
          <SignInMenu />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full shrink-0">
      <div className="rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="px-3 py-2.5 bg-slate-800/90 border-b border-slate-700 rounded-t-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Mining loadout
          </p>
        </div>
        <div className="p-4 text-center space-y-3">
          <p className="text-sm text-slate-400">
            Sign in with a member account to plan mining loadouts and compare laser power against
            rocks. RSI Handle verification is not required.
          </p>
          <p className="text-xs text-slate-500">
            Saved loadouts sync to your account and are available on any device.
          </p>
          <div className="flex justify-center">
            <SignInMenu />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MiningLoadoutPanel({
  rockTarget,
  variant = 'sidebar',
}: MiningLoadoutPanelProps) {
  const { canUse, store, loading, saving, saveError, createCustomLoadout, deleteCustomLoadout, updateLasers } =
    useMiningLoadouts()

  const [vesselId, setVesselId] = useState<MiningVesselId>('prospector')
  const [loadoutKey, setLoadoutKey] = useState<LoadoutKey>('default')
  const [moleSoloMining, setMoleSoloMining] = useState(true)

  const vessel = getMiningVessel(vesselId)
  const loadouts = useMemo(() => listLoadoutsForVessel(store, vesselId), [store, vesselId])
  const activeLoadout = loadouts.find((l) => l.key === loadoutKey) ?? loadouts[0]
  const editable = activeLoadout ? isCustomLoadoutKey(activeLoadout.key) : false

  const comparison = useMemo(() => {
    if (!activeLoadout || !isRockBreakabilityTargetReady(rockTarget)) return null
    return compareLoadoutToRock(activeLoadout.lasers, rockTarget!)
  }, [activeLoadout, rockTarget])

  const smartCracker = useMemo(() => {
    if (!activeLoadout || !comparison || !isRockBreakabilityTargetReady(rockTarget)) return null
    return buildSmartCracker(vesselId, activeLoadout.lasers, rockTarget!, comparison, {
      moleSoloMining,
    })
  }, [activeLoadout, comparison, rockTarget, vesselId, moleSoloMining])

  if (!canUse) {
    return <LoadoutSignInGate variant={variant} />
  }

  const handleVesselChange = (nextId: MiningVesselId) => {
    setVesselId(nextId)
    setLoadoutKey('default')
  }

  const handleCreateLoadout = () => {
    const created = createCustomLoadout(vesselId)
    if (created) setLoadoutKey(`custom-${created}`)
  }

  const handleDeleteLoadout = () => {
    if (!canDeleteLoadout(loadoutKey)) return
    if (!isCustomLoadoutKey(loadoutKey)) return
    const slot = Number(loadoutKey.replace('custom-', '')) as 1 | 2 | 3
    deleteCustomLoadout(vesselId, slot)
    setLoadoutKey('default')
  }

  const handleLaserChange = (index: number, next: MiningLaserSlotConfig) => {
    if (!activeLoadout || !editable) return
    const lasers = activeLoadout.lasers.map((l, i) => (i === index ? next : l))
    updateLasers(vesselId, activeLoadout.key, lasers)
  }

  if (!vessel) return null

  if (loading) {
    const loadingShell =
      variant === 'workspace' ? (
        <div className="p-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="w-full shrink-0 rounded-xl border border-slate-700 bg-slate-900/70 p-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )
    return loadingShell
  }

  const panelBody = (
    <>
      {saveError ? (
        <p className="text-xs text-red-400/90 bg-red-950/20 border border-red-900/40 rounded-lg px-2 py-1.5">
          {saveError}
        </p>
      ) : null}
      {saving ? (
        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Saving…</p>
      ) : null}

      <div className={variant === 'workspace' ? 'flex flex-wrap items-center gap-2' : 'flex gap-2'}>
        <select
          value={vesselId}
          onChange={(e) => handleVesselChange(e.target.value as MiningVesselId)}
          className="site-input flex-1 min-w-[7rem] px-2 py-1.5 text-xs"
        >
          {MINING_VESSELS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.displayName}
            </option>
          ))}
        </select>
        <select
          value={loadoutKey}
          onChange={(e) => setLoadoutKey(e.target.value as LoadoutKey)}
          className="site-input flex-1 min-w-[7rem] px-2 py-1.5 text-xs"
        >
          {loadouts.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
        {canCreateMoreLoadouts(store, vesselId) ? (
          <button
            type="button"
            onClick={handleCreateLoadout}
            className="px-2 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800/80 transition-colors shrink-0"
          >
            Create loadout
          </button>
        ) : null}
        {canDeleteLoadout(loadoutKey) && editable ? (
          <button
            type="button"
            onClick={handleDeleteLoadout}
            className="px-2 py-1.5 text-xs rounded-lg border border-red-900/60 text-red-400/90 hover:bg-red-950/40 transition-colors shrink-0"
          >
            Delete
          </button>
        ) : null}
      </div>

      {!editable ? (
        <p className="text-[11px] text-slate-500">
          Default is factory stock and read-only. Create Mole 1 / 2 / 3 (etc.) to set your mining
          heads and crafted stats.
        </p>
      ) : null}

      <div
        className={
          variant === 'workspace'
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2'
            : 'space-y-2'
        }
      >
        {activeLoadout?.lasers.map((slot, index) => (
          <LaserSlotEditor
            key={`${activeLoadout.key}-${index}`}
            slotIndex={index}
            slot={slot}
            vesselId={vesselId}
            editable={editable}
            onChange={(next) => handleLaserChange(index, next)}
          />
        ))}
      </div>

      <div
        className={
          variant === 'workspace'
            ? 'grid grid-cols-1 lg:grid-cols-2 gap-3 items-start'
            : 'space-y-3'
        }
      >
        {comparison ? <ComparisonPanel comparison={comparison} /> : null}

        {smartCracker ? (
          <SmartCrackerPanel
            result={smartCracker}
            moleSoloMining={moleSoloMining}
            onMoleSoloMiningChange={setMoleSoloMining}
            showSoloToggle={vesselId === 'mole'}
          />
        ) : null}
      </div>

      {rockTarget && !isRockBreakabilityTargetReady(rockTarget) ? (
        <p className="text-[11px] text-slate-500">
          Enter scanner mass and resistance in the Rock Calculator to compare breakability.
        </p>
      ) : null}
    </>
  )

  if (variant === 'workspace') {
    return <div className="p-3 space-y-3">{panelBody}</div>
  }

  return (
    <div className="w-full shrink-0">
      <div className="rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="px-3 py-2.5 bg-slate-800/90 border-b border-slate-700 rounded-t-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/90">
            Smart Cracker
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Loadout planner, breakability, Mole head plan &amp; gadget fit · synced to your account
          </p>
        </div>

        <div className="p-3 space-y-3">{panelBody}</div>
      </div>
    </div>
  )
}
