import type { MiningModule, MiningModuleKind } from '../data'
import {
  computeEffectiveLaserStats,
  getBlueprintForLaser,
  type MiningLaserSlotConfig,
} from './miningLaserStats'
import {
  combineModuleModifiers,
  getMiningModuleByName,
  normalizeModuleSelection,
} from './miningModules'
import { getMiningLaserByName } from './miningVessels'
import { computeBlueprintEffectiveModifiers } from './blueprintEffectiveStats'

function headPowerMultiplier(slot: MiningLaserSlotConfig): number {
  if (slot.mode !== 'custom') return 1
  const blueprint = getBlueprintForLaser(slot.laserName)
  if (!blueprint?.slots?.length) return 1
  const modifiers = computeBlueprintEffectiveModifiers(blueprint, slot.slotQualities ?? null)
  const damageMod = modifiers.find((m) => m.property.toLowerCase() === 'weapon_damage')
  return damageMod?.combinedModifier ?? 1
}

export interface ModifierStatLine {
  key: string
  label: string
  /** Formatted display value */
  value: string
  /** Whether this stat feeds rock fracture math in the loadout compare */
  affectsCracking: boolean
}

export interface EquippedModuleStats {
  name: string
  displayName: string
  kind: MiningModuleKind
  lines: ModifierStatLine[]
}

export interface LaserLoadoutBreakdown {
  laserName: string
  displayName: string
  equippedModules: EquippedModuleStats[]
  /** Stock head values before craft/modules */
  stock: ModifierStatLine[]
  /** Combined effective values (craft + modules applied) */
  effective: ModifierStatLine[]
  laserPower: number
  stockLaserPower: number
}

function formatSignedPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value) || value === 0) return '0%'
  const rounded =
    decimals > 0 ? Math.round(value * 10 ** decimals) / 10 ** decimals : Math.round(value)
  const text =
    decimals > 0 && rounded % 1 !== 0 ? rounded.toFixed(decimals) : String(Math.round(rounded))
  return `${rounded > 0 ? '+' : ''}${text}%`
}

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  const rounded = Math.round(value * 10) / 10
  const text = rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1)
  return `${rounded > 0 ? '+' : ''}${text}`
}

function moduleStatLines(mod: MiningModule): ModifierStatLine[] {
  const powerPct = (mod.powerMultiplier - 1) * 100
  return [
    {
      key: 'power',
      label: 'Laser power',
      value: formatSignedPercent(powerPct),
      affectsCracking: true,
    },
    {
      key: 'resistance',
      label: 'Resistance',
      value: formatSignedPercent(mod.resistanceModifier),
      affectsCracking: true,
    },
    {
      key: 'window',
      label: 'Optimal charge window',
      value: formatSignedPercent(mod.optimalWindowModifier),
      affectsCracking: false,
    },
    {
      key: 'filter',
      label: 'Inert filter',
      value: formatSignedPercent(mod.filterModifier),
      affectsCracking: false,
    },
    {
      key: 'instability',
      label: 'Laser instability',
      value: formatSignedNumber(mod.instabilityModifier),
      affectsCracking: false,
    },
    {
      key: 'shatter',
      label: 'Shatter damage',
      value: formatSignedPercent(mod.shatterDamageModifier),
      affectsCracking: false,
    },
  ]
}

function stockHeadLines(laser: NonNullable<ReturnType<typeof getMiningLaserByName>>): ModifierStatLine[] {
  return [
    {
      key: 'power',
      label: 'Laser power',
      value: `${laser.laserPower.toLocaleString()} MW`,
      affectsCracking: true,
    },
    {
      key: 'resistance',
      label: 'Resistance',
      value: formatSignedPercent(laser.resistanceModifier),
      affectsCracking: true,
    },
    {
      key: 'window',
      label: 'Optimal charge window',
      value: formatSignedPercent(laser.optimalWindowModifier),
      affectsCracking: false,
    },
    {
      key: 'filter',
      label: 'Inert filter',
      value: formatSignedPercent(laser.filterModifier),
      affectsCracking: false,
    },
    {
      key: 'instability',
      label: 'Laser instability',
      value: formatSignedNumber(laser.instabilityModifier),
      affectsCracking: false,
    },
  ]
}

function effectiveHeadLines(
  laser: NonNullable<ReturnType<typeof getMiningLaserByName>>,
  slot: MiningLaserSlotConfig,
  effective: NonNullable<ReturnType<typeof computeEffectiveLaserStats>>
): ModifierStatLine[] {
  const moduleMods = combineModuleModifiers(normalizeModuleSelection(slot.laserName, slot.modules))
  const craftMult = headPowerMultiplier(slot)
  const craftPowerPct = (craftMult - 1) * 100

  const lines: ModifierStatLine[] = [
    {
      key: 'power',
      label: 'Laser power',
      value: `${effective.laserPower.toLocaleString()} MW`,
      affectsCracking: true,
    },
  ]

  if (craftPowerPct !== 0) {
    lines.push({
      key: 'craft-power',
      label: 'Craft head power',
      value: formatSignedPercent(craftPowerPct),
      affectsCracking: true,
    })
  }

  if (moduleMods.powerChangeSum !== 0) {
    lines.push({
      key: 'module-power',
      label: 'Module power (from base)',
      value: formatSignedPercent(moduleMods.powerChangeSum * 100),
      affectsCracking: true,
    })
  }

  const effectiveResistance = laser.resistanceModifier + moduleMods.resistanceModifier
  const effectiveWindow = laser.optimalWindowModifier + moduleMods.optimalWindowModifier
  const effectiveFilter = laser.filterModifier + moduleMods.filterModifier
  const effectiveInstability = laser.instabilityModifier + moduleMods.instabilityModifier

  lines.push(
    {
      key: 'resistance',
      label: 'Resistance',
      value: formatSignedPercent(effectiveResistance),
      affectsCracking: true,
    },
    {
      key: 'window',
      label: 'Optimal charge window',
      value: formatSignedPercent(effectiveWindow),
      affectsCracking: false,
    },
    {
      key: 'filter',
      label: 'Inert filter',
      value: formatSignedPercent(effectiveFilter),
      affectsCracking: false,
    },
    {
      key: 'instability',
      label: 'Laser instability',
      value: formatSignedNumber(effectiveInstability),
      affectsCracking: false,
    },
    {
      key: 'shatter',
      label: 'Shatter damage',
      value: formatSignedPercent(moduleMods.shatterDamageModifier),
      affectsCracking: false,
    }
  )

  return lines
}

export function computeLaserLoadoutBreakdown(
  slot: MiningLaserSlotConfig
): LaserLoadoutBreakdown | null {
  const laser = getMiningLaserByName(slot.laserName)
  const effective = computeEffectiveLaserStats(slot)
  if (!laser || !effective) return null

  const moduleNames = normalizeModuleSelection(slot.laserName, slot.modules)
  const equippedModules: EquippedModuleStats[] = []

  for (const name of moduleNames) {
    if (!name) continue
    const mod = getMiningModuleByName(name)
    if (!mod) continue
    equippedModules.push({
      name: mod.name,
      displayName: mod.displayName,
      kind: mod.kind,
      lines: moduleStatLines(mod),
    })
  }

  return {
    laserName: laser.name,
    displayName: effective.displayName,
    equippedModules,
    stock: stockHeadLines(laser),
    effective: effectiveHeadLines(laser, slot, effective),
    laserPower: effective.laserPower,
    stockLaserPower: effective.stockLaserPower,
  }
}
