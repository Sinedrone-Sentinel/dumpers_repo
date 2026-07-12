import type { ClusterDisplayProfile, LocationSpawnProfile } from './miningClusterProfiles'
import { getMineableElementStats, oreResistanceToHudPercent } from './mineableElementStats'
import { applyRockMultiplicativePercent } from './miningGadgets'

/** Ship mining global mass coefficient (from MiningGlobalParamsShip decayPerMass). */
export const MINING_MASS_COEFFICIENT = 0.2

/**
 * Instability scaling factor for crackable power calculation (quadratic formula).
 * Instability effect is non-linear — gets exponentially worse at higher values.
 * Formula: margin = (instability / SCALE)²
 * At 500 instability: 2.0× equalization power needed
 * At 1000 instability: 5.0× equalization power needed
 */
export const INSTABILITY_QUADRATIC_SCALE = 500

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
 * Crackable power (MW) — the actual power needed to fracture a rock.
 * This is equalization power PLUS margin for instability fluctuations.
 * Higher instability = exponentially more margin needed (quadratic scaling).
 *
 * Formula: crackablePower = equalizationPower × (1 + (instability / SCALE)²)
 *
 * Examples:
 *   100 inst → 1.04× equalization
 *   300 inst → 1.36× equalization
 *   500 inst → 2.00× equalization
 *   700 inst → 2.96× equalization
 *  1000 inst → 5.00× equalization
 */
export function crackablePower(
  scannerMass: number,
  resistancePercent: number,
  instability: number,
  resistanceModifier = 1
): number {
  const eqPower = equalizationPower(scannerMass, resistancePercent, resistanceModifier)
  if (!Number.isFinite(eqPower)) return eqPower
  const normalized = Math.max(0, instability) / INSTABILITY_QUADRATIC_SCALE
  const instabilityMargin = normalized * normalized
  return eqPower * (1 + instabilityMargin)
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
 * Format the crackable power for display.
 * Includes instability margin when provided.
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
