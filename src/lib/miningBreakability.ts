import type { ClusterDisplayProfile, LocationSpawnProfile } from './miningClusterProfiles'
import { getMineableElementStats, oreResistanceToHudPercent } from './mineableElementStats'
import { applyRockMultiplicativePercent } from './miningGadgets'

/** Ship mining global mass coefficient (from MiningGlobalParamsShip decayPerMass). */
export const MINING_MASS_COEFFICIENT = 0.2

/**
 * @deprecated Superseded by the ±MW instability-assist model (see `crackablePower`).
 * Kept only for reference; no longer used in fracture math.
 */
export const INSTABILITY_QUADRATIC_SCALE = 500

/**
 * Instability behaves like a ±MW oscillation on the applied power (RNG per server
 * tick): the effective power swings up AND down around your steady output. A wave
 * *crest* can momentarily reach `power + assist`, letting you tag the fracture window
 * on a rock you couldn't hold steadily — and a *trough* is what makes it easy to
 * overshoot/stall. So higher instability WIDENS the crackable band; it does not raise
 * the barrier. `assist` is the crest reach in MW: instability read straight off the
 * scanner as an MW-equivalent amplitude, times this factor.
 *
 * Factor 1.0 = the absolute possibility boundary (only the highest crest helps, so the
 * bottom of the band is a "risky/patient" crack, not a reliable one).
 */
export const INSTABILITY_ASSIST_FACTOR = 1

/** Crest reach (MW) that instability adds on top of steady applied power. */
export function instabilityAssistMw(instability: number): number {
  return Math.max(0, instability) * INSTABILITY_ASSIST_FACTOR
}

export interface BreakabilityRange {
  min: number
  max: number
}

export interface BreakabilityResult {
  scannerMassRange: BreakabilityRange | null
  breakabilityRange: BreakabilityRange | null
  resistance: number | null
}

type MassSource = Pick<ClusterDisplayProfile | LocationSpawnProfile, 'scannerMassRange'>

function roundDisplay(value: number): number {
  return Math.round(value)
}

/**
 * Effective resistance fraction (0–1) from scanner resistance % and optional laser modifier.
 * `resistancePercent` is the HUD value (e.g. 50 for 50%, not 0.5).
 */
export function effectiveResistanceFraction(
  resistancePercent: number,
  resistanceModifier = 1
): number {
  return Math.max(0, Math.min(1, (resistancePercent / 100) * resistanceModifier))
}

/**
 * Mining-seat HUD resistance from the pilot scan plus head/module resistance shift.
 * Example: pilot 74% with Helix −30% → ~52% on that turret.
 */
export function effectiveHudResistancePercent(
  pilotResistancePercent: number,
  headResistanceModifierPercent: number
): number {
  return Math.round(
    Math.max(
      0,
      Math.min(100, applyRockMultiplicativePercent(pilotResistancePercent, headResistanceModifierPercent))
    )
  )
}

/**
 * Equalization power (MW) — the power at which charge rate equals decay rate.
 * At this power level, the rock's energy stays stable (no growth, no decay).
 * You CANNOT crack a rock at exactly equalization power — you need margin above it.
 */
export function equalizationPower(
  scannerMass: number,
  resistancePercent: number,
  resistanceModifier = 1
): number {
  if (!Number.isFinite(scannerMass) || scannerMass <= 0) return 0
  const effective = effectiveResistanceFraction(resistancePercent, resistanceModifier)
  const denominator = 1 - effective
  if (denominator <= 0) return Infinity
  return (scannerMass * MINING_MASS_COEFFICIENT) / denominator
}

/**
 * Crackable power (MW) — the MINIMUM applied power that gives you a shot at fracturing
 * a rock, accounting for the instability assist.
 *
 * The real barrier is the equalization (hold) point: at/above it you can drive the
 * energy bar up into the fracture window. Instability adds a ±MW wave, so a crest can
 * reach the barrier even when your steady power sits below it — BUT your steady power
 * still has to overcome the equal-and-opposite trough (the "underswing"). That makes a
 * band around equalization, half-width = the instability crest reach:
 *
 *   crackablePower (floor) = max(0, equalizationPower − instabilityAssistMw(instability))
 *
 * - power ≥ equalization + assist ......... clean crack (even troughs stay above the hold point)
 * - floor ≤ power < equalization + assist   risky/patient crack (crests bridge, but you fight the trough)
 * - power < floor ......................... impossible (even the highest crest can't reach)
 *
 * This is the reverse of the old quadratic model for the *floor* — higher instability
 * LOWERS the minimum, matching that high-instability rocks are breakable even when they
 * look "impossible" on base power. The underswing is why being near the floor is a grind,
 * and overshoot risk (not a power requirement) is the cost of a big wave.
 */
export function crackablePower(
  scannerMass: number,
  resistancePercent: number,
  instability: number,
  resistanceModifier = 1
): number {
  const eqPower = equalizationPower(scannerMass, resistancePercent, resistanceModifier)
  if (!Number.isFinite(eqPower)) return eqPower
  return Math.max(0, eqPower - instabilityAssistMw(instability))
}

export type CrackZone = 'clean' | 'assisted' | 'impossible'

export interface CrackZoneResult {
  zone: CrackZone
  /** Equalization / hold point (MW). */
  equalization: number
  /** Minimum power for a shot at cracking (equalization − instability assist). */
  minimum: number
  /** Clean-crack line (MW) — even the trough stays at/above equalization (equalization + assist). */
  clean: number
  /** Instability crest reach (MW) — half-width of the ± wave band. */
  assist: number
}

/**
 * Classify a loadout's power against a rock's fracture band.
 * `power` is the applied laser power (MW); `resistanceModifier` is the laser/head
 * resistance multiplier (0..1). "clean" requires overcoming the underswing (power at
 * or above equalization + the instability crest reach).
 */
export function classifyCrackZone(
  power: number,
  scannerMass: number,
  resistancePercent: number,
  instability: number,
  resistanceModifier = 1
): CrackZoneResult {
  const equalization = equalizationPower(scannerMass, resistancePercent, resistanceModifier)
  const assist = instabilityAssistMw(instability)
  const minimum = Math.max(0, equalization - assist)
  const clean = equalization + assist
  let zone: CrackZone
  if (!Number.isFinite(equalization)) zone = 'impossible'
  else if (power >= clean) zone = 'clean'
  else if (power >= minimum) zone = 'assisted'
  else zone = 'impossible'
  return { zone, equalization, minimum, clean, assist }
}

/**
 * @deprecated Use equalizationPower or crackablePower instead.
 * This returns equalization power, which is NOT enough to actually crack —
 * use crackablePower for accurate predictions.
 */
export function requiredLaserPower(
  scannerMass: number,
  resistancePercent: number,
  resistanceModifier = 1
): number {
  return equalizationPower(scannerMass, resistancePercent, resistanceModifier)
}

export function computeBreakabilityForOre(
  oreName: string,
  profile?: MassSource | null,
  resistanceOverride?: number | null
): BreakabilityResult {
  const stats = getMineableElementStats(oreName)
  const scannerMassRange = profile?.scannerMassRange ?? null
  const resistance =
    resistanceOverride != null && Number.isFinite(resistanceOverride)
      ? resistanceOverride
      : stats?.resistance != null
        ? oreResistanceToHudPercent(stats.resistance)
        : null

  if (resistance == null) {
    return { scannerMassRange, breakabilityRange: null, resistance: null }
  }

  if (!scannerMassRange) {
    return { scannerMassRange: null, breakabilityRange: null, resistance }
  }

  return {
    scannerMassRange,
    breakabilityRange: {
      min: roundDisplay(requiredLaserPower(scannerMassRange.min, resistance)),
      max: roundDisplay(requiredLaserPower(scannerMassRange.max, resistance)),
    },
    resistance,
  }
}

export function formatScannerMassRange(range: BreakabilityRange | null): string | null {
  if (!range) return null
  const min = roundDisplay(range.min)
  const max = roundDisplay(range.max)
  if (min === max) return min.toLocaleString()
  return `${min.toLocaleString()}–${max.toLocaleString()}`
}

export function formatBreakabilityRange(range: BreakabilityRange | null): string | null {
  if (!range) return null
  const min = roundDisplay(range.min)
  const max = roundDisplay(range.max)
  if (min === max) return min.toLocaleString()
  return `${min.toLocaleString()}–${max.toLocaleString()}`
}

/**
 * Format the MINIMUM fracture power for display — equalization minus the instability
 * assist (the least power that gives a shot at cracking). Shown as a plain number with
 * no zone labels: a miner whose loadout sits above this reads it as comfortable margin.
 */
export function formatRequiredPower(
  scannerMass: number | null,
  resistancePercent: number | null,
  instability: number | null = null
): string | null {
  if (scannerMass == null || resistancePercent == null) return null
  if (!Number.isFinite(scannerMass) || scannerMass <= 0) return null
  if (!Number.isFinite(resistancePercent)) return null
  const power = crackablePower(scannerMass, resistancePercent, instability ?? 0)
  if (!Number.isFinite(power)) return null
  return roundDisplay(power).toLocaleString()
}
