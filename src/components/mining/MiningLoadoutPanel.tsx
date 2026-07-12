import React, { useEffect, useMemo, useState } from 'react'
import SignInMenu from '../auth/SignInMenu'
import { useMiningLoadouts } from '../../contexts/MiningLoadoutContext'
import {
  compareLoadoutToRock,
  isRockBreakabilityTargetReady,
  type LoadoutBreakabilityComparison,
  type RockBreakabilityTarget,
} from '../../lib/miningLoadoutCompare'
import { minPowerWarningMessage } from '../../lib/miningMinPowerWarning'
import MoleHeadPlanPanel from './MoleHeadPlanPanel'
import {
  buildSmartCracker,
  type SmartCrackerResult,
} from '../../lib/miningGadgetRecommendations'
import type { MiningLaserSlotConfig } from '../../lib/miningLaserStats'
import { analyzeSoloMoleGarage } from '../../lib/soloMoleLoadoutAdvice'
import SoloMoleGaragePanel from './SoloMoleGaragePanel'
import LoadoutHeadCardsGrid from './LoadoutHeadCards'
import {
  areLaserSlotsEqual,
  canCreateMoreLoadouts,
  canDeleteLoadout,
  cloneLaserSlots,
  isCustomLoadoutKey,
  listLoadoutsForVessel,
  type LoadoutKey,
} from '../../lib/miningLoadoutStorage'
import {
  getPreferredBuildById,
  listPreferredBuildsForVessel,
  preferredBuildLaserSlots,
} from '../../lib/miningPreferredBuilds'
import { matchPreferredBuild } from '../../lib/matchPreferredBuild'
import {
  getMiningVessel,
  MINING_VESSELS,
  type MiningVesselId,
} from '../../lib/miningVessels'

export interface MiningLoadoutSelection {
  vesselId: MiningVesselId
  loadoutKey: LoadoutKey
  onVesselChange: (id: MiningVesselId) => void
  onLoadoutChange: (key: LoadoutKey) => void
}

interface MiningLoadoutPanelProps {
  rockTarget: RockBreakabilityTarget | null
  selection: MiningLoadoutSelection
  /** Modal body: no card chrome, details always visible */
  embedded?: boolean
  moleSoloMining?: boolean
  onMoleSoloMiningChange?: (solo: boolean) => void
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

function MoleSoloMiningToggle({
  solo,
  onChange,
}: {
  solo: boolean
  onChange: (solo: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-md border border-slate-700/60 bg-slate-900/50 px-2.5 py-2 cursor-pointer">
      <input
        type="checkbox"
        checked={solo}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/40"
      />
      <span className="text-xs text-slate-400 leading-snug">
        <span className="text-slate-200">Solo mining</span> — one laser only, same as a Prospector.
        Mole just gives you three heads to choose from. Uncheck for <span className="text-slate-200">crew</span>{' '}
        mode when friends are on the other turrets.
      </span>
    </label>
  )
}

function SmartCrackerPanel({
  result,
  oreName,
}: {
  result: SmartCrackerResult
  oreName?: string | null
}) {
  const { gadgetSuggestions, moleStrategy, slowCrack } = result
  const hasGadget = gadgetSuggestions.length > 0
  const recommendedGadget = gadgetSuggestions.find((suggestion) => suggestion.recommended)
  const alternateGadgets = gadgetSuggestions.filter((suggestion) => !suggestion.recommended)

  if (!hasGadget && !moleStrategy && !slowCrack) return null

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 p-3 space-y-3">
      {moleStrategy ? <MoleHeadPlanPanel strategy={moleStrategy} oreName={oreName} embedded /> : null}

      {slowCrack ? (
        <div
          className={`rounded-md border px-2.5 py-2 space-y-1 ${
            slowCrack.worthWaiting
              ? 'border-amber-900/50 bg-amber-950/20'
              : 'border-orange-900/50 bg-orange-950/20'
          }`}
        >
          <p
            className={`text-xs font-medium ${
              slowCrack.worthWaiting ? 'text-amber-300' : 'text-orange-300'
            }`}
          >
            {slowCrack.headline}
          </p>
          <p className="text-[11px] text-slate-400 leading-snug">{slowCrack.detail}</p>
          <p className="text-[11px] font-mono tabular-nums text-slate-500">
            Full-blast {slowCrack.deliveredMw.toLocaleString()} MW vs{' '}
            {slowCrack.equalizingMw.toLocaleString()} MW equalizer
          </p>
        </div>
      ) : null}

      {hasGadget ? (
        <div
          className={`space-y-2 ${moleStrategy ? 'pt-2 border-t border-slate-700/60' : ''}`}
        >
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Gadget options</p>
          <p className="text-[11px] text-slate-600 leading-snug">
            Only one gadget per rock — benefits do not stack. Pick the job you need most, or use an
            alternate if you do not have the recommended one.
          </p>

          {recommendedGadget ? (
            <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-2 space-y-1">
              <p className="text-xs font-medium text-amber-300">
                Recommended — {recommendedGadget.gadget.displayName}
                <span className="text-slate-500 font-normal">
                  {' '}
                  ·{' '}
                  {recommendedGadget.role === 'resistance'
                    ? 'fracture power'
                    : recommendedGadget.role === 'instability'
                      ? 'instability control'
                      : 'charge window'}
                </span>
              </p>
              <p className="text-[11px] text-slate-400 leading-snug">{recommendedGadget.reason}</p>
              {recommendedGadget.requiredPower != null ? (
                <p className="text-[11px] font-mono tabular-nums text-slate-500">
                  Required {recommendedGadget.requiredPower.toLocaleString()} MW with this gadget
                </p>
              ) : null}
            </div>
          ) : null}

          {alternateGadgets.length > 0 ? (
            <div className="space-y-1.5">
              {alternateGadgets.map((suggestion) => (
                <div
                  key={suggestion.gadget.name}
                  className="rounded-md border border-slate-700/70 bg-slate-900/40 p-2 space-y-1"
                >
                  <p className="text-xs font-medium text-slate-300">
                    Also consider — {suggestion.gadget.displayName}
                    <span className="text-slate-500 font-normal">
                      {' '}
                      ·{' '}
                      {suggestion.role === 'resistance'
                        ? 'fracture power'
                        : suggestion.role === 'instability'
                          ? 'instability control'
                          : 'charge window'}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-400 leading-snug">{suggestion.reason}</p>
                  {suggestion.requiredPower != null ? (
                    <p className="text-[11px] font-mono tabular-nums text-slate-500">
                      Required {suggestion.requiredPower.toLocaleString()} MW with this gadget
                    </p>
                  ) : null}
                </div>
              ))}
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

function ComparisonPanel({
  comparison,
  suppressPerLaserDetail = false,
}: {
  comparison: LoadoutBreakabilityComparison
  suppressPerLaserDetail?: boolean
}) {
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
                warning.level === 'misconfigured'
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

      {multiLaser && !suppressPerLaserDetail ? (
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
      ) : suppressPerLaserDetail ? (
        <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-700/60 leading-snug">
          Mole crew head plan above uses full-blast + drive throttles — per-laser equal split does
          not apply.
        </p>
      ) : null}
    </div>
  )
}

function LoadoutSignInGate({ embedded = false }: { embedded?: boolean }) {
  const body = (
    <div className="text-center space-y-3">
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
  )

  if (embedded) return body

  return (
    <div className="w-full shrink-0">
      <div className="rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="px-3 py-2.5 bg-slate-800/90 border-b border-slate-700 rounded-t-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/90">
            Smart Cracker
          </p>
        </div>
        <div className="p-4">{body}</div>
      </div>
    </div>
  )
}

export default function MiningLoadoutPanel({
  rockTarget,
  selection,
  embedded = false,
  moleSoloMining: moleSoloMiningProp,
  onMoleSoloMiningChange,
}: MiningLoadoutPanelProps) {
  const { canUse, store, loading, saving, saveError, saveLoadout, saveLoadoutAsNew, deleteCustomLoadout } =
    useMiningLoadouts()

  const { vesselId, loadoutKey, onVesselChange, onLoadoutChange } = selection
  const [internalMoleSoloMining, setInternalMoleSoloMining] = useState(true)
  const moleSoloMining = moleSoloMiningProp ?? internalMoleSoloMining
  const setMoleSoloMining = onMoleSoloMiningChange ?? setInternalMoleSoloMining
  const [draftLasers, setDraftLasers] = useState<MiningLaserSlotConfig[] | null>(null)

  const vessel = getMiningVessel(vesselId)
  const loadouts = useMemo(() => listLoadoutsForVessel(store, vesselId), [store, vesselId])
  const activeLoadout = loadouts.find((l) => l.key === loadoutKey) ?? loadouts[0]
  const isCustom = isCustomLoadoutKey(loadoutKey)

  useEffect(() => {
    const current =
      listLoadoutsForVessel(store, vesselId).find((l) => l.key === loadoutKey) ??
      listLoadoutsForVessel(store, vesselId)[0]
    if (!current) {
      setDraftLasers(null)
      return
    }
    setDraftLasers(cloneLaserSlots(current.lasers))
  }, [store, vesselId, loadoutKey])

  const isDirty = useMemo(() => {
    if (!draftLasers || !activeLoadout) return false
    return !areLaserSlotsEqual(draftLasers, activeLoadout.lasers)
  }, [activeLoadout, draftLasers])

  const preferredBuilds = useMemo(() => listPreferredBuildsForVessel(vesselId), [vesselId])

  const preferredMatch = useMemo(() => {
    if (!draftLasers) return null
    return matchPreferredBuild(vesselId, draftLasers)
  }, [draftLasers, vesselId])

  const handleApplyPreferredBuild = (buildId: string) => {
    const build = getPreferredBuildById(buildId)
    if (!build || build.vesselId !== vesselId) return
    setDraftLasers(preferredBuildLaserSlots(build))
  }

  const comparison = useMemo(() => {
    if (!draftLasers || !isRockBreakabilityTargetReady(rockTarget)) return null
    return compareLoadoutToRock(draftLasers, rockTarget!)
  }, [draftLasers, rockTarget])

  const smartCracker = useMemo(() => {
    if (!draftLasers || !comparison || !isRockBreakabilityTargetReady(rockTarget)) return null
    return buildSmartCracker(vesselId, draftLasers, rockTarget!, comparison, {
      moleSoloMining,
    })
  }, [draftLasers, comparison, rockTarget, vesselId, moleSoloMining])

  const soloMoleGarage = useMemo(() => {
    if (vesselId !== 'mole' || !moleSoloMining || !draftLasers) return null
    return analyzeSoloMoleGarage(draftLasers)
  }, [draftLasers, moleSoloMining, vesselId])

  if (!canUse) {
    return <LoadoutSignInGate embedded={embedded} />
  }

  const handleVesselChange = (nextId: MiningVesselId) => {
    onVesselChange(nextId)
    onLoadoutChange('default')
  }

  const handleCreateLoadout = async () => {
    if (!draftLasers) return
    const created = await saveLoadoutAsNew(vesselId, draftLasers)
    if (created) onLoadoutChange(`custom-${created}`)
  }

  const handleSaveLoadout = async () => {
    if (!draftLasers || !isCustom) return
    await saveLoadout(vesselId, loadoutKey, draftLasers)
  }

  const handleDeleteLoadout = async () => {
    if (!canDeleteLoadout(loadoutKey)) return
    if (!isCustomLoadoutKey(loadoutKey)) return
    const slot = Number(loadoutKey.replace('custom-', '')) as 1 | 2 | 3
    await deleteCustomLoadout(vesselId, slot)
    onLoadoutChange('default')
  }

  const handleLaserChange = (index: number, next: MiningLaserSlotConfig) => {
    if (!draftLasers) return
    setDraftLasers(draftLasers.map((l, i) => (i === index ? next : l)))
  }

  if (!vessel) return null

  if (loading) {
    const spinner = (
      <div className="flex justify-center p-6">
        <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    )
    if (embedded) return spinner
    return (
      <div className="w-full shrink-0 rounded-xl border border-slate-700 bg-slate-900/70">
        {spinner}
      </div>
    )
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

      <div className="flex gap-2">
        <select
          value={vesselId}
          onChange={(e) => handleVesselChange(e.target.value as MiningVesselId)}
          className="site-input flex-1 min-w-0 px-2 py-1.5 text-xs"
        >
          {MINING_VESSELS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.displayName}
            </option>
          ))}
        </select>
        <select
          value={loadoutKey}
          onChange={(e) => onLoadoutChange(e.target.value as LoadoutKey)}
          className="site-input flex-1 min-w-0 px-2 py-1.5 text-xs"
        >
          {loadouts.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {vesselId === 'mole' ? (
        <MoleSoloMiningToggle solo={moleSoloMining} onChange={setMoleSoloMining} />
      ) : null}

      {preferredBuilds.length > 0 ? (
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Premade build
          </label>
          <select
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value
              if (!id) return
              handleApplyPreferredBuild(id)
              e.target.value = ''
            }}
            className="site-input w-full px-2 py-1.5 text-xs"
          >
            <option value="">Load a premade into editor…</option>
            {preferredBuilds.map((build) => (
              <option key={build.id} value={build.id}>
                {build.displayName}
              </option>
            ))}
          </select>
          {preferredMatch ? (
            <p className="text-[11px] text-cyan-300/90">
              Matches {preferredMatch.build.displayName}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isCustom ? (
          <button
            type="button"
            onClick={handleSaveLoadout}
            disabled={!isDirty || saving || !draftLasers}
            className="flex-1 min-w-[7rem] px-2 py-1.5 text-xs rounded-lg border border-orange-700/60 bg-orange-950/30 text-orange-200 hover:bg-orange-950/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleCreateLoadout}
          disabled={!canCreateMoreLoadouts(store, vesselId) || saving || !draftLasers}
          className="flex-1 min-w-[7rem] px-2 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save as New
        </button>
        {canDeleteLoadout(loadoutKey) && isCustom ? (
          <button
            type="button"
            onClick={handleDeleteLoadout}
            disabled={saving}
            className="flex-1 min-w-[7rem] px-2 py-1.5 text-xs rounded-lg border border-red-900/60 text-red-400/90 hover:bg-red-950/40 transition-colors disabled:opacity-40"
          >
            Delete
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-500 leading-snug">
        {isCustom
          ? 'Tweak heads and modules freely — changes preview below until you Save. Use Save as New to copy this setup into another slot.'
          : 'Default is factory stock — edit here to experiment, then Save as New to keep your setup. Default itself is never overwritten.'}
        {isDirty ? (
          <span className="text-amber-300/90"> Unsaved changes.</span>
        ) : null}
      </p>

      {soloMoleGarage ? (
        <SoloMoleGaragePanel advice={soloMoleGarage} oreName={rockTarget?.oreName} />
      ) : null}

      {draftLasers?.length ? (
        <LoadoutHeadCardsGrid
          vesselId={vesselId}
          slots={draftLasers}
          editable
          moleSoloMining={moleSoloMining}
          onSlotChange={handleLaserChange}
        />
      ) : null}

      {comparison ? (
        <ComparisonPanel
          comparison={comparison}
          suppressPerLaserDetail={
            vesselId === 'mole' && !moleSoloMining && smartCracker?.moleStrategy != null
          }
        />
      ) : null}

      {smartCracker ? (
        <SmartCrackerPanel result={smartCracker} oreName={rockTarget?.oreName} />
      ) : null}

      {rockTarget && !isRockBreakabilityTargetReady(rockTarget) ? (
        <p className="text-[11px] text-slate-500">
          Enter scanner mass and resistance in the Rock Calculator to compare breakability.
        </p>
      ) : null}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{panelBody}</div>
  }

  return (
    <div className="w-full shrink-0">
      <div className="rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="px-3 py-2.5 bg-slate-800/90 border-b border-slate-700 rounded-t-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/90">
            Smart Cracker
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare laser power to the rock in the calculator · synced to your account
          </p>
        </div>

        <div className="p-3 space-y-3">{panelBody}</div>
      </div>
    </div>
  )
}
