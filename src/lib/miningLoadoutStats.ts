import type { MiningModule, MiningModuleKind } from '../data'
import {
  computeEffectiveLaserStats,
  getBlueprintForLaser,
  type MiningLaserSlotConfig,
} from './miningLaserStats'
import {
  combineModuleModifiers,
  combinePassiveModuleModifiers,
  getActivePortIndices,
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
  /** Formatted display value (passive baseline — active modules off) */
  value: string
  /**
   * Formatted display value with every equipped active module turned on.
   * Only set when the head has active modules that change this stat, so the UI
   * can show "passive / actives-on" (actives-on rendered in blue).
   */
  activeValue?: string
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

type PercentStatKey =
  | 'resistance'
  | 'window'
  | 'window-rate'
  | 'filter'
  | 'instability'
  | 'shatter'
  | 'cluster'
  | 'catastrophic-rate'

type PercentStatDef = {
  key: PercentStatKey
  label: string
  laserField?: keyof NonNullable<ReturnType<typeof getMiningLaserByName>>
  moduleField: keyof CombinedPercentFields
  affectsCracking: boolean
}

type CombinedPercentFields = {
  resistanceModifier: number
  optimalWindowModifier: number
  optimalWindowRateModifier: number
  filterModifier: number
  instabilityModifier: number
  shatterDamageModifier: number
  clusterFactorModifier: number
  catastrophicChargeWindowRateModifier: number
}

const PERCENT_STAT_DEFS: PercentStatDef[] = [
  {
    key: 'resistance',
    label: 'Resistance',
    laserField: 'resistanceModifier',
    moduleField: 'resistanceModifier',
    affectsCracking: true,
  },
  {
    key: 'window',
    label: 'Optimal charge window',
    laserField: 'optimalWindowModifier',
    moduleField: 'optimalWindowModifier',
    affectsCracking: false,
  },
  {
    key: 'window-rate',
    label: 'Charge window rate',
    laserField: 'optimalWindowRateModifier',
    moduleField: 'optimalWindowRateModifier',
    affectsCracking: false,
  },
  {
    key: 'filter',
    label: 'Inert filter',
    laserField: 'filterModifier',
    moduleField: 'filterModifier',
    affectsCracking: false,
  },
  {
    key: 'instability',
    label: 'Laser instability',
    laserField: 'instabilityModifier',
    moduleField: 'instabilityModifier',
    affectsCracking: true,
  },
  {
    key: 'shatter',
    label: 'Shatter damage',
    laserField: 'shatterDamageModifier',
    moduleField: 'shatterDamageModifier',
    affectsCracking: false,
  },
  {
    key: 'cluster',
    label: 'Cluster factor',
    laserField: 'clusterFactorModifier',
    moduleField: 'clusterFactorModifier',
    affectsCracking: false,
  },
  {
    key: 'catastrophic-rate',
    label: 'Overcharge rate',
    laserField: 'catastrophicChargeWindowRateModifier',
    moduleField: 'catastrophicChargeWindowRateModifier',
    affectsCracking: false,
  },
]

function fieldValue(record: object | undefined, field: string | undefined): number {
  if (!record || !field) return 0
  const value = (record as Record<string, unknown>)[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function percentLine(
  def: PercentStatDef,
  value: number,
  activeValue?: string
): ModifierStatLine {
  return {
    key: def.key,
    label: def.label,
    value: formatSignedPercent(value),
    activeValue,
    affectsCracking: def.affectsCracking,
  }
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
    ...PERCENT_STAT_DEFS.map((def) => percentLine(def, fieldValue(mod, def.moduleField))),
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
    ...PERCENT_STAT_DEFS.map((def) =>
      percentLine(def, fieldValue(laser, def.laserField))
    ),
  ]
}

function effectiveHeadLines(
  laser: NonNullable<ReturnType<typeof getMiningLaserByName>>,
  slot: MiningLaserSlotConfig,
  effective: NonNullable<ReturnType<typeof computeEffectiveLaserStats>>
): ModifierStatLine[] {
  const moduleNames = normalizeModuleSelection(slot.laserName, slot.modules)
  const passiveMods = combinePassiveModuleModifiers(moduleNames)
  const activePorts = new Set(getActivePortIndices(moduleNames))
  const hasActives = activePorts.size > 0
  const activeMods = hasActives ? combineModuleModifiers(moduleNames, activePorts) : passiveMods
  const activeEffective = hasActives ? computeEffectiveLaserStats(slot, activePorts) : null
  const craftMult = headPowerMultiplier(slot)
  const craftPowerPct = (craftMult - 1) * 100

  /** activeValue set only when actives change the stat vs the passive baseline. */
  const activeOverlay = (passiveDisplay: string, activeDisplay: string): string | undefined =>
    hasActives && activeDisplay !== passiveDisplay ? activeDisplay : undefined

  const powerValue = `${effective.laserPower.toLocaleString()} MW`
  const lines: ModifierStatLine[] = [
    {
      key: 'power',
      label: 'Laser power',
      value: powerValue,
      activeValue:
        activeEffective
          ? activeOverlay(powerValue, `${activeEffective.laserPower.toLocaleString()} MW`)
          : undefined,
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

  if (passiveMods.powerChangeSum !== 0 || (hasActives && activeMods.powerChangeSum !== 0)) {
    const passivePower = formatSignedPercent(passiveMods.powerChangeSum * 100)
    lines.push({
      key: 'module-power',
      label: 'Module power (from base)',
      value: passivePower,
      activeValue: activeOverlay(passivePower, formatSignedPercent(activeMods.powerChangeSum * 100)),
      affectsCracking: true,
    })
  }

  const stacked = (mods: CombinedPercentFields, def: PercentStatDef) =>
    fieldValue(laser, def.laserField) + fieldValue(mods, def.moduleField)

  for (const def of PERCENT_STAT_DEFS) {
    const passiveDisplay = formatSignedPercent(stacked(passiveMods, def))
    lines.push(
      percentLine(
        def,
        stacked(passiveMods, def),
        activeOverlay(passiveDisplay, formatSignedPercent(stacked(activeMods, def)))
      )
    )
  }

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
