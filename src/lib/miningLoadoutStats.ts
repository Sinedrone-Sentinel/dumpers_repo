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
      value: formatSignedPercent(mod.instabilityModifier),
      affectsCracking: true,
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
      value: formatSignedPercent(laser.instabilityModifier),
      affectsCracking: true,
    },
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

  const resistanceOf = (mods: typeof passiveMods) =>
    formatSignedPercent(laser.resistanceModifier + mods.resistanceModifier)
  const windowOf = (mods: typeof passiveMods) =>
    formatSignedPercent(laser.optimalWindowModifier + mods.optimalWindowModifier)
  const filterOf = (mods: typeof passiveMods) =>
    formatSignedPercent(laser.filterModifier + mods.filterModifier)
  const instabilityOf = (mods: typeof passiveMods) =>
    formatSignedPercent(laser.instabilityModifier + mods.instabilityModifier)
  const shatterOf = (mods: typeof passiveMods) => formatSignedPercent(mods.shatterDamageModifier)

  lines.push(
    {
      key: 'resistance',
      label: 'Resistance',
      value: resistanceOf(passiveMods),
      activeValue: activeOverlay(resistanceOf(passiveMods), resistanceOf(activeMods)),
      affectsCracking: true,
    },
    {
      key: 'window',
      label: 'Optimal charge window',
      value: windowOf(passiveMods),
      activeValue: activeOverlay(windowOf(passiveMods), windowOf(activeMods)),
      affectsCracking: false,
    },
    {
      key: 'filter',
      label: 'Inert filter',
      value: filterOf(passiveMods),
      activeValue: activeOverlay(filterOf(passiveMods), filterOf(activeMods)),
      affectsCracking: false,
    },
    {
      key: 'instability',
      label: 'Laser instability',
      value: instabilityOf(passiveMods),
      activeValue: activeOverlay(instabilityOf(passiveMods), instabilityOf(activeMods)),
      affectsCracking: true,
    },
    {
      key: 'shatter',
      label: 'Shatter damage',
      value: shatterOf(passiveMods),
      activeValue: activeOverlay(shatterOf(passiveMods), shatterOf(activeMods)),
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
