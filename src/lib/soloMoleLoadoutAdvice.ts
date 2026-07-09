import type { MiningLaserSlotConfig } from './miningLaserStats'
import { formatSignedNumber, formatSignedPercent } from './miningLoadoutStatSemantics'
import { buildMoleHeadProfile } from './moleLoadoutStrategy'
import { listMiningLasersForSize } from './miningVessels'

export type SoloMoleGarageRole = 'heavy' | 'workhorse' | 'finesse'

export interface SoloMoleGarageHead {
  slotIndex: number
  label: string
  role: SoloMoleGarageRole
  powerMw: number
  windowModifier: number
  resistanceModifier: number
  detail: string
}

export interface SoloMoleGarageAdvice {
  summary: string
  heads: SoloMoleGarageHead[]
  gaps: string[]
}

const ROLE_LABELS: Record<SoloMoleGarageRole, string> = {
  heavy: 'Heavy hitter',
  workhorse: 'Daily driver',
  finesse: 'Finesse',
}

const ROLE_HINTS: Record<SoloMoleGarageRole, string> = {
  heavy: 'Tough rocks — lean on raw MW and negative resistance when you need to brute-force fracture.',
  workhorse: 'Middle-weight rocks — balanced power and modifiers without extreme tradeoffs.',
  finesse: 'Tight charge windows — wide window and helpful resistance shift so you can stay in the green.',
}

/** Minimum MW spread between your strongest and lightest solo picks. */
const MIN_POWER_SPREAD_MW = 700
/** Finesse slot should reach at least this effective window modifier. */
const MIN_FINESSE_WINDOW = 15
/** Heavy slot should generally sit at or above this MW (stock S2 reference). */
const HEAVY_POWER_FLOOR_MW = 3600

interface SlotSnapshot {
  slotIndex: number
  label: string
  powerMw: number
  windowModifier: number
  resistanceModifier: number
  instabilityModifier: number
}

function finesseScore(slot: SlotSnapshot): number {
  return slot.windowModifier - Math.max(0, slot.resistanceModifier) * 0.35
}

function assignRoles(slots: SlotSnapshot[]): Map<number, SoloMoleGarageRole> {
  const roles = new Map<number, SoloMoleGarageRole>()
  if (!slots.length) return roles

  const byPower = [...slots].sort((a, b) => b.powerMw - a.powerMw)
  const byFinesse = [...slots].sort((a, b) => finesseScore(b) - finesseScore(a))

  const heavyIndex = byPower[0].slotIndex
  roles.set(heavyIndex, 'heavy')

  let finesseIndex = byFinesse[0].slotIndex
  if (finesseIndex === heavyIndex) {
    finesseIndex = byFinesse[1]?.slotIndex ?? byPower[byPower.length - 1].slotIndex
  }
  roles.set(finesseIndex, 'finesse')

  for (const slot of slots) {
    if (!roles.has(slot.slotIndex)) {
      roles.set(slot.slotIndex, 'workhorse')
    }
  }

  return roles
}

function slotDetail(slot: SlotSnapshot): string {
  const parts = [`${slot.powerMw.toLocaleString()} MW`]
  if (slot.windowModifier !== 0) {
    parts.push(`${formatSignedPercent(slot.windowModifier)} window`)
  }
  if (slot.resistanceModifier !== 0) {
    parts.push(`${formatSignedPercent(slot.resistanceModifier)} resistance`)
  }
  if (slot.instabilityModifier !== 0) {
    parts.push(`${formatSignedNumber(slot.instabilityModifier)} instability`)
  }
  return parts.join(' · ')
}

function stockHeadExamples(): {
  heavy: string[]
  finesse: string[]
  workhorse: string[]
} {
  const lasers = listMiningLasersForSize(2)
  const heavy = lasers
    .filter((l) => l.laserPower >= HEAVY_POWER_FLOOR_MW)
    .sort((a, b) => b.laserPower - a.laserPower)
    .slice(0, 2)
    .map((l) => l.displayName)
  const finesse = lasers
    .filter((l) => l.optimalWindowModifier >= 20)
    .sort((a, b) => b.optimalWindowModifier - a.optimalWindowModifier)
    .slice(0, 2)
    .map((l) => l.displayName)
  const workhorse = lasers
    .filter((l) => l.laserPower >= 3000 && l.laserPower < 3800)
    .slice(0, 2)
    .map((l) => l.displayName)

  return { heavy, finesse, workhorse }
}

function detectGaps(
  slots: SlotSnapshot[],
  roles: Map<number, SoloMoleGarageRole>
): string[] {
  const gaps: string[] = []
  if (slots.length < 3) return gaps

  const powers = slots.map((s) => s.powerMw)
  const powerSpread = Math.max(...powers) - Math.min(...powers)
  const heavySlot = slots.find((s) => roles.get(s.slotIndex) === 'heavy')
  const finesseSlot = slots.find((s) => roles.get(s.slotIndex) === 'finesse')
  const examples = stockHeadExamples()

  if (powerSpread < MIN_POWER_SPREAD_MW) {
    gaps.push(
      `Your three heads sit too close in power (${powerSpread.toLocaleString()} MW spread) — aim for a heavy tier around ${HEAVY_POWER_FLOOR_MW.toLocaleString()}+ MW, a mid head near 3,300 MW, and a lighter finesse build with Focus modules.`
    )
  }

  if (heavySlot && heavySlot.powerMw < HEAVY_POWER_FLOOR_MW) {
    const names = examples.heavy.join(' or ')
    gaps.push(
      `No true heavy hitter yet — stock picks like ${names} give you headroom on high-resistance rocks.`
    )
  }

  if (finesseSlot && finesseSlot.windowModifier < MIN_FINESSE_WINDOW) {
    const names = examples.finesse.join(' or ')
    gaps.push(
      `Finesse head needs a wider charge window (target ${formatSignedPercent(MIN_FINESSE_WINDOW)} or better) — try ${names} plus Focus III modules on your lightest hardpoint.`
    )
  }

  if (finesseSlot && finesseSlot.powerMw >= 3800 && finesseSlot.windowModifier < 30) {
    gaps.push(
      'Your finesse slot is still a high-power head with a narrow window — move Focus modules to a lighter head so you keep a wide-window option.'
    )
  }

  const signatures = new Map<string, number[]>()
  for (const slot of slots) {
    const key = `${slot.label}|${slot.powerMw}|${slot.windowModifier}|${slot.resistanceModifier}`
    const list = signatures.get(key) ?? []
    list.push(slot.slotIndex)
    signatures.set(key, list)
  }
  for (const indices of signatures.values()) {
    if (indices.length > 1) {
      gaps.push(
        `Head ${indices.map((i) => i + 1).join(' and ')} are configured the same — solo garage works best when each hardpoint covers a different job.`
      )
    }
  }

  const negativeWindowCount = slots.filter((s) => s.windowModifier < 0).length
  if (negativeWindowCount >= 2 && (finesseSlot?.windowModifier ?? 0) < MIN_FINESSE_WINDOW) {
    gaps.push(
      'Multiple heads have negative charge windows — keep one dedicated finesse build so you are not stuck with Helix-style narrow windows on every rock.'
    )
  }

  return gaps
}

function buildSummary(heads: SoloMoleGarageHead[], gaps: string[]): string {
  const roleLines = heads
    .map((head) => `Head ${head.slotIndex + 1} → ${ROLE_LABELS[head.role]} (${head.detail})`)
    .join('; ')

  if (!gaps.length) {
    return `Solo garage looks well spread — pick the matching head per rock. ${roleLines}.`
  }

  return `Solo mining uses one head at a time — configure all three for different jobs. ${roleLines}.`
}

export function analyzeSoloMoleGarage(
  lasers: MiningLaserSlotConfig[]
): SoloMoleGarageAdvice | null {
  if (lasers.length < 3) return null

  const snapshots: SlotSnapshot[] = []
  for (let slotIndex = 0; slotIndex < lasers.length; slotIndex++) {
    const profile = buildMoleHeadProfile(lasers[slotIndex], slotIndex)
    if (!profile) return null
    snapshots.push({
      slotIndex,
      label: profile.label,
      powerMw: profile.laserPower,
      windowModifier: profile.optimalWindowModifier,
      resistanceModifier: profile.resistanceModifier,
      instabilityModifier: profile.instabilityModifier,
    })
  }

  const roles = assignRoles(snapshots)
  const heads: SoloMoleGarageHead[] = snapshots.map((slot) => {
    const role = roles.get(slot.slotIndex) ?? 'workhorse'
    return {
      slotIndex: slot.slotIndex,
      label: slot.label,
      role,
      powerMw: slot.powerMw,
      windowModifier: slot.windowModifier,
      resistanceModifier: slot.resistanceModifier,
      detail: slotDetail(slot),
    }
  })

  const gaps = detectGaps(snapshots, roles)

  return {
    summary: buildSummary(heads, gaps),
    heads,
    gaps,
  }
}

export function soloMoleGarageRoleHint(role: SoloMoleGarageRole): string {
  return ROLE_HINTS[role]
}

export function soloMoleGarageRoleLabel(role: SoloMoleGarageRole): string {
  return ROLE_LABELS[role]
}
