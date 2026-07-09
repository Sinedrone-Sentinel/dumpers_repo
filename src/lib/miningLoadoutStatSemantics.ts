import type { MiningLaser } from '../data'
import {
  computeLaserLoadoutBreakdown,
  type LaserLoadoutBreakdown,
} from './miningLoadoutStats'
import type { MiningLaserSlotConfig } from './miningLaserStats'
import {
  getMiningModuleByName,
  listMiningModules,
  normalizeModuleSelection,
} from './miningModules'
import {
  MAX_LOADOUT_PRO_TIPS,
  MINING_STAT_EXTREMES,
  MINING_STAT_PRIORITY_RANK,
  type PriorityMiningStat,
} from './miningStatPriority'
import {
  getMiningLaserByName,
  getMiningVessel,
  listMiningLasersForVessel,
  type MiningVesselId,
} from './miningVessels'

export type StatSentiment = 'good' | 'bad' | 'neutral'

export interface LoadoutProTip {
  statKey: string
  statLabel: string
  message: string
}

type TipStatKey = 'module-power' | Exclude<PriorityMiningStat, 'power'>

interface DetectedProblem {
  key: TipStatKey
  label: string
  displayValue: string
  numericValue: number
  priority: number
  severity: number
}

interface SwapCandidate {
  description: string
  projectedDisplay: string
  delta: number
}

const STAT_LABELS: Record<TipStatKey, string> = {
  'module-power': 'Module power',
  resistance: 'Resistance shift',
  window: 'Charge window',
  instability: 'Laser instability',
}

const MIN_SWAP_IMPROVEMENT = {
  window: 8,
  resistance: 6,
  instability: 4,
  'module-power': 10,
} as const

/** Parse signed % or raw number from display strings. MW lines return null. */
export function parseModifierValue(value: string): number | null {
  if (value.includes('MW')) return null
  const cleaned = value.replace(/%/g, '').trim()
  const num = Number.parseFloat(cleaned)
  return Number.isFinite(num) ? num : null
}

export function isNeutralModifierValue(value: string): boolean {
  return value === '0%' || value === '0'
}

export function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0%'
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  const rounded = Math.round(value * 10) / 10
  const text = rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1)
  return `${rounded > 0 ? '+' : ''}${text}`
}

function formatProjectedStat(
  breakdown: LaserLoadoutBreakdown,
  key: TipStatKey,
  projected: number
): string {
  const line = effectiveLine(breakdown, key)
  if (line) return line.value
  return key === 'instability' ? formatSignedNumber(projected) : formatSignedPercent(projected)
}

export function statSentiment(key: string, value: string): StatSentiment {
  if (isNeutralModifierValue(value)) return 'neutral'
  const num = parseModifierValue(value)
  if (num === null || num === 0) return 'neutral'

  switch (key) {
    case 'resistance':
      return num < 0 ? 'good' : 'bad'
    case 'window':
    case 'filter':
      return num > 0 ? 'good' : 'bad'
    case 'instability':
      return num < 0 ? 'good' : 'bad'
    case 'shatter':
      return num < 0 ? 'good' : 'bad'
    case 'craft-power':
    case 'module-power':
      return num > 0 ? 'good' : 'bad'
    default:
      return 'neutral'
  }
}

export function statValueColorClass(key: string, value: string, compact = false): string {
  if (key === 'power' && value.includes('MW')) {
    return compact ? 'text-sm font-semibold text-amber-300' : 'text-[10px] font-semibold text-amber-300'
  }
  if (isNeutralModifierValue(value)) {
    return compact ? 'text-xs text-slate-600' : 'text-slate-600'
  }

  const sentiment = statSentiment(key, value)
  if (sentiment === 'good') return compact ? 'text-xs text-emerald-400' : 'text-emerald-400'
  if (sentiment === 'bad') return compact ? 'text-xs text-red-400' : 'text-red-400'
  return compact ? 'text-xs text-slate-200' : 'text-slate-200'
}

function effectiveLine(breakdown: LaserLoadoutBreakdown, key: string) {
  return breakdown.effective.find((line) => line.key === key)
}

function effectiveNumeric(breakdown: LaserLoadoutBreakdown, key: string): number | null {
  const line = effectiveLine(breakdown, key)
  if (!line) return null
  return parseModifierValue(line.value)
}

function breakdownForSlot(slot: MiningLaserSlotConfig): LaserLoadoutBreakdown | null {
  return computeLaserLoadoutBreakdown(slot)
}

function withHead(slot: MiningLaserSlotConfig, laserName: string): MiningLaserSlotConfig {
  return {
    laserName,
    mode: 'stock',
    modules: undefined,
    slotQualities: undefined,
    customLabel: slot.customLabel,
  }
}

function withModuleAt(
  slot: MiningLaserSlotConfig,
  modIndex: number,
  moduleName: string | null
): MiningLaserSlotConfig {
  const modules = normalizeModuleSelection(slot.laserName, slot.modules)
  modules[modIndex] = moduleName
  return { ...slot, modules }
}

function higherIsBetter(key: TipStatKey): boolean {
  return key === 'window' || key === 'module-power'
}

function statDelta(current: number, projected: number, key: TipStatKey): number {
  return higherIsBetter(key) ? projected - current : current - projected
}

function blameForStat(
  laser: MiningLaser,
  equipped: (string | null)[],
  key: 'window' | 'resistance' | 'instability'
): string {
  const headValue =
    key === 'window'
      ? laser.optimalWindowModifier
      : key === 'resistance'
        ? laser.resistanceModifier
        : laser.instabilityModifier

  const parts: string[] = []
  if (headValue !== 0) {
    parts.push(`${laser.displayName} ${formatSignedPercent(headValue)}`)
  }

  const counts = new Map<string, number>()
  for (const name of equipped) {
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  for (const [name, count] of counts) {
    const mod = getMiningModuleByName(name)
    if (!mod) continue
    const value =
      key === 'window'
        ? mod.optimalWindowModifier
        : key === 'resistance'
          ? mod.resistanceModifier
          : mod.instabilityModifier
    if (value === 0) continue
    const label = count > 1 ? `${count}× ${mod.displayName}` : mod.displayName
    parts.push(`${label} ${formatSignedPercent(value * count)}`)
  }

  return parts.length ? parts.join('; ') : 'combined head + module stack'
}

function rankModuleSwaps(
  slot: MiningLaserSlotConfig,
  key: TipStatKey,
  current: number
): SwapCandidate[] {
  const modules = normalizeModuleSelection(slot.laserName, slot.modules)
  const candidates: SwapCandidate[] = []
  const minGain = MIN_SWAP_IMPROVEMENT[key]

  for (let modIndex = 0; modIndex < modules.length; modIndex++) {
    const currentName = modules[modIndex]
    for (const option of listMiningModules()) {
      if (option.name === currentName) continue

      const trial = withModuleAt(slot, modIndex, option.name)
      const breakdown = breakdownForSlot(trial)
      if (!breakdown) continue

      const projected =
        key === 'module-power'
          ? effectiveNumeric(breakdown, 'module-power')
          : effectiveNumeric(breakdown, key)
      if (projected == null) continue

      const delta = statDelta(current, projected, key)
      if (delta < minGain) continue

      const projectedDisplay = formatProjectedStat(breakdown, key, projected)

      candidates.push({
        description: `Mod ${modIndex + 1} → ${option.displayName}`,
        projectedDisplay,
        delta,
      })
    }
  }

  return candidates.sort((a, b) => b.delta - a.delta)
}

function rankHeadSwaps(
  slot: MiningLaserSlotConfig,
  vesselId: MiningVesselId,
  key: TipStatKey,
  current: number
): SwapCandidate[] {
  const vessel = getMiningVessel(vesselId)
  if (!vessel || vessel.isBespoke) return []

  const candidates: SwapCandidate[] = []
  const minGain = MIN_SWAP_IMPROVEMENT[key]

  for (const head of listMiningLasersForVessel(vessel)) {
    if (head.name === slot.laserName) continue

    const trial = withHead(slot, head.name)
    const breakdown = breakdownForSlot(trial)
    if (!breakdown) continue

    const projected =
      key === 'module-power'
        ? effectiveNumeric(breakdown, 'module-power')
        : effectiveNumeric(breakdown, key)
    if (projected == null) continue

    const delta = statDelta(current, projected, key)
    if (delta < minGain) continue

    const powerLine = effectiveLine(breakdown, 'power')
    const projectedDisplay = formatProjectedStat(breakdown, key, projected)

    const powerNote = powerLine ? ` @ ${powerLine.value}` : ''
    candidates.push({
      description: `${head.displayName}${powerNote}`,
      projectedDisplay,
      delta,
    })
  }

  return candidates.sort((a, b) => b.delta - a.delta).slice(0, 2)
}

function formatSwapSuggestions(swaps: SwapCandidate[], currentDisplay: string): string {
  if (!swaps.length) return ''

  const seen = new Set<string>()
  const unique: SwapCandidate[] = []
  for (const swap of swaps) {
    if (seen.has(swap.projectedDisplay)) continue
    seen.add(swap.projectedDisplay)
    unique.push(swap)
    if (unique.length >= 2) break
  }

  return unique
    .map((swap) => {
      const gain =
        swap.projectedDisplay.includes('%') || swap.projectedDisplay.includes('MW')
          ? formatSignedPercent(swap.delta)
          : formatSignedNumber(swap.delta)
      return `${swap.description} → ${swap.projectedDisplay} (from ${currentDisplay}, improves by ${gain})`
    })
    .join('; ')
}

function detectProblems(breakdown: LaserLoadoutBreakdown): DetectedProblem[] {
  const problems: DetectedProblem[] = []

  const modulePower = effectiveNumeric(breakdown, 'module-power')
  if (modulePower != null && modulePower <= MINING_STAT_EXTREMES.modulePowerDrastic) {
    problems.push({
      key: 'module-power',
      label: STAT_LABELS['module-power'],
      displayValue: effectiveLine(breakdown, 'module-power')!.value,
      numericValue: modulePower,
      priority: MINING_STAT_PRIORITY_RANK.power,
      severity: Math.abs(modulePower - MINING_STAT_EXTREMES.modulePowerDrastic),
    })
  }

  const resistance = effectiveNumeric(breakdown, 'resistance')
  if (resistance != null && resistance >= MINING_STAT_EXTREMES.resistanceBad) {
    problems.push({
      key: 'resistance',
      label: STAT_LABELS.resistance,
      displayValue: effectiveLine(breakdown, 'resistance')!.value,
      numericValue: resistance,
      priority: MINING_STAT_PRIORITY_RANK.resistance,
      severity: resistance - MINING_STAT_EXTREMES.resistanceBad,
    })
  }

  const window = effectiveNumeric(breakdown, 'window')
  if (window != null && window <= MINING_STAT_EXTREMES.windowBad) {
    problems.push({
      key: 'window',
      label: STAT_LABELS.window,
      displayValue: effectiveLine(breakdown, 'window')!.value,
      numericValue: window,
      priority: MINING_STAT_PRIORITY_RANK.window,
      severity: MINING_STAT_EXTREMES.windowBad - window,
    })
  }

  const instability = effectiveNumeric(breakdown, 'instability')
  if (instability != null && instability >= MINING_STAT_EXTREMES.instabilityBad) {
    problems.push({
      key: 'instability',
      label: STAT_LABELS.instability,
      displayValue: effectiveLine(breakdown, 'instability')!.value,
      numericValue: instability,
      priority: MINING_STAT_PRIORITY_RANK.instability,
      severity: instability - MINING_STAT_EXTREMES.instabilityBad,
    })
  }

  return problems.sort((a, b) => a.priority - b.priority || b.severity - a.severity)
}

function buildDynamicTip(
  problem: DetectedProblem,
  slot: MiningLaserSlotConfig,
  laser: MiningLaser,
  vesselId: MiningVesselId
): LoadoutProTip {
  const equipped = normalizeModuleSelection(slot.laserName, slot.modules)
  const blame =
    problem.key === 'window' || problem.key === 'resistance' || problem.key === 'instability'
      ? blameForStat(laser, equipped, problem.key)
      : null

  const moduleSwaps = rankModuleSwaps(slot, problem.key, problem.numericValue)
  const headSwaps = rankHeadSwaps(slot, vesselId, problem.key, problem.numericValue)

  const intro = (() => {
    switch (problem.key) {
      case 'module-power':
        return `Module stack is dragging fracture power (${problem.displayValue})`
      case 'resistance':
        return `Resistance shift is working against you (${problem.displayValue})`
      case 'window':
        return `Charge window is extremely tight (${problem.displayValue})`
      case 'instability':
        return `Laser instability is high (${problem.displayValue})`
      default:
        return `${problem.label} is out of band (${problem.displayValue})`
    }
  })()

  const parts: string[] = []
  if (blame) parts.push(`Mainly from ${blame}`)

  const swapText = formatSwapSuggestions(moduleSwaps, problem.displayValue)
  if (swapText) parts.push(swapText)

  const headText = formatSwapSuggestions(headSwaps, problem.displayValue)
  if (headText) parts.push(`Head swap: ${headText}`)

  if (!parts.length) {
    parts.push('Try a different head or module mix — simulate swaps above to recover this stat')
  }

  return {
    statKey: problem.key,
    statLabel: problem.label,
    message: `${intro}. ${parts.join('. ')}.`,
  }
}

export function analyzeLoadoutProTips(
  breakdown: LaserLoadoutBreakdown,
  slot: MiningLaserSlotConfig,
  vesselId: MiningVesselId
): LoadoutProTip[] {
  const laser = getMiningLaserByName(slot.laserName)
  if (!laser) return []

  const problems = detectProblems(breakdown).slice(0, MAX_LOADOUT_PRO_TIPS)
  return problems.map((problem) => buildDynamicTip(problem, slot, laser, vesselId))
}
