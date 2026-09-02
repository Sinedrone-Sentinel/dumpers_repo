/**
 * Quality modifier calculation utilities for blueprint simulation.
 * Allows users to see how resource quality affects final item stats.
 */

export interface Modifier {
  gameplayProperty: string
  startQuality: number
  endQuality: number
  modifierAtStart: number
  modifierAtEnd: number
  isIntegerAdditive?: boolean
}

/** Raw modifier shape from game-blueprints.json (parse-extracted-data.mjs output) */
export interface RawModifier {
  gameplayProperty?: string
  property?: string
  startQuality?: number
  endQuality?: number
  modifierAtStart?: number
  modifierAtEnd?: number
  baseAmount?: number
  perQuality?: number
  additiveAtStart?: number
  additiveAtEnd?: number
  additiveModifierAtStart?: number
  additiveModifierAtEnd?: number
  isIntegerAdditive?: boolean
}

/**
 * Normalize modifier data from either legacy or parsed game-file format.
 * Legacy: gameplayProperty + modifierAtStart/modifierAtEnd
 * Parsed: property + baseAmount/perQuality
 */
export function normalizeModifier(raw: RawModifier | Modifier | null | undefined): Modifier | null {
  if (!raw) return null

  const gameplayProperty = raw.gameplayProperty ?? raw.property
  if (!gameplayProperty) return null

  const startQuality = raw.startQuality ?? 0
  const endQuality = raw.endQuality ?? 1000
  const range = endQuality - startQuality

  if (raw.isIntegerAdditive) {
    const start =
      raw.additiveAtStart ??
      raw.additiveModifierAtStart ??
      raw.modifierAtStart ??
      raw.baseAmount ??
      0
    const end =
      raw.additiveAtEnd ??
      raw.additiveModifierAtEnd ??
      raw.modifierAtEnd ??
      start
    return {
      gameplayProperty,
      startQuality,
      endQuality,
      modifierAtStart: start,
      modifierAtEnd: end,
      isIntegerAdditive: true,
    }
  }

  if (raw.modifierAtStart !== undefined && raw.modifierAtEnd !== undefined) {
    return {
      gameplayProperty,
      startQuality,
      endQuality,
      modifierAtStart: raw.modifierAtStart,
      modifierAtEnd: raw.modifierAtEnd,
    }
  }

  if (raw.baseAmount !== undefined && raw.perQuality !== undefined && range !== 0) {
    return {
      gameplayProperty,
      startQuality,
      endQuality,
      modifierAtStart: raw.baseAmount,
      modifierAtEnd: raw.baseAmount + raw.perQuality * range,
    }
  }

  if (raw.baseAmount !== undefined) {
    return {
      gameplayProperty,
      startQuality,
      endQuality,
      modifierAtStart: raw.baseAmount,
      modifierAtEnd: raw.baseAmount,
    }
  }

  return null
}

export function normalizeModifiers(
  modifiers: Array<RawModifier | Modifier> | undefined
): Modifier[] {
  if (!modifiers?.length) return []
  return modifiers
    .map(normalizeModifier)
    .filter((mod): mod is Modifier => mod !== null)
}

export interface SlotModifierResult {
  property: string
  propertyLabel: string
  modifier: number
  percentChange: number
  /** Flat stat delta from LinearIntegerAdditive crafting ranges */
  additiveAmount?: number
  isIntegerAdditive?: boolean
}

export interface AggregatedModifier {
  property: string
  propertyLabel: string
  combinedModifier: number
  percentChange: number
  additiveChange?: number
  baseValue?: number
  finalValue?: number
  isIntegerAdditive?: boolean
}

const PROPERTY_LABELS: Record<string, string> = {
  'Health_Maxhealth': 'Integrity',
  'Shield_Maxhealth': 'Max Shield',
  'Armor_Damagemitigation': 'Damage Mitigation',
  'Armor_Temperaturemin': 'Min Temperature',
  'Armor_Temperaturemax': 'Max Temperature',
  'Armor_Radiationdissipation': 'Radiation Dissipation',
  'Armor_Radiationcapacity': 'Radiation Capacity',
  'Weapon_Damage': 'Damage',
  'Weapon_Damage_Override_Laser': 'Mining Power',
  'Mining_ExtractionPower': 'Extraction Power',
  'Mining_OptimalRange': 'Optimal Range (m)',
  'Mining_MaxRange': 'Max Range (m)',
  'Weapon_Range': 'Effective Range (m)',
  'Weapon_MagazineSize': 'Magazine Size',
  'Weapon_Recoil_Smoothness': 'Recoil Smoothness',
  'Weapon_Recoil_Handling': 'Recoil Handling',
  'Weapon_Recoil_Kick': 'Recoil Kick',
  'Weapon_Firerate': 'Fire Rate',
  'Weapon_Spread': 'Spread',
  'Weapon_Reloadspeed': 'Reload Speed',
  'Itemresource_Coolantgeneration': 'Coolant Generation',
  'Itemresource_Powergeneration': 'Power Pips',
  'Quantum_Speed': 'Quantum Speed',
  'Quantum_Fuelrequirement': 'Fuel Requirement',
  'Radar_Minaimassistdistance': 'Min Aim Assist Distance',
  'Radar_Maxaimassistdistance': 'Max Aim Assist Distance',
  'Weapon_Hullscraping_Efficiency': 'Scraping Efficiency (%)',
  'Weapon_Hullscraping_Radius': 'Scraping Radius (m)',
  'Weapon_Hullscraping_Speed': 'Scraping Speed',
  'Weapon_Tractor_Fullstrengthdist': 'Tractor Full Strength Distance',
  'Weapon_Tractor_Maxdist': 'Tractor Max Distance',
  'Weapon_Tractor_Force': 'Tractor Force',
  'Weapon_Tractor_Maxvolume': 'Tractor Max Volume',
}

/**
 * Stats where LOWER values are better (inverted color coding).
 * For these, a negative percentage is good (green) and positive is bad (red).
 */
const LOWER_IS_BETTER_STATS = new Set([
  'weapon_recoil_smoothness',
  'weapon_recoil_handling',
  'weapon_recoil_kick',
  'weapon_spread',
  'quantum_fuelrequirement',
  'armor_temperaturemin', // More negative = can survive colder
])

/**
 * Check if a stat is one where lower values are better.
 */
export function isLowerBetter(property: string | null | undefined): boolean {
  if (!property) return false
  return LOWER_IS_BETTER_STATS.has(property.toLowerCase())
}

export function getPropertyLabel(property: string | null | undefined): string {
  if (!property) return 'Unknown'
  const key = Object.keys(PROPERTY_LABELS).find(
    k => k.toLowerCase() === property.toLowerCase()
  )
  if (key) return PROPERTY_LABELS[key]
  
  // Fallback: convert snake_case to Title Case
  return property
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Interpolate the modifier value for a given quality within the modifier ranges.
 * Quality ranges are typically 0-500 and 501-1000 with different modifier curves.
 */
export function interpolateModifier(quality: number, modifiers: Modifier[]): number {
  if (!modifiers || modifiers.length === 0) return 1

  // Clamp quality to valid range
  const clampedQuality = Math.max(1, Math.min(1000, quality))

  for (const mod of modifiers) {
    if (clampedQuality >= mod.startQuality && clampedQuality <= mod.endQuality) {
      const range = mod.endQuality - mod.startQuality
      if (range === 0) return mod.modifierAtStart
      
      const position = (clampedQuality - mod.startQuality) / range
      return mod.modifierAtStart + position * (mod.modifierAtEnd - mod.modifierAtStart)
    }
  }

  // If quality is below all ranges, use the first range's start
  const sortedMods = [...modifiers].sort((a, b) => a.startQuality - b.startQuality)
  if (clampedQuality < sortedMods[0].startQuality) {
    return sortedMods[0].modifierAtStart
  }

  // If quality is above all ranges, use the last range's end
  const lastMod = sortedMods[sortedMods.length - 1]
  if (clampedQuality > lastMod.endQuality) {
    return lastMod.modifierAtEnd
  }

  return 1
}

/**
 * Format a modifier value as a percentage change string.
 * 0.8 → "-20.00%", 1.0 → "0.00%", 1.2 → "+20.00%"
 */
export function formatModifierPercent(modifier: number): string {
  const percentChange = (modifier - 1) * 100
  const sign = percentChange >= 0 ? '+' : ''
  return `${sign}${percentChange.toFixed(2)}%`
}

export function formatAdditiveModifier(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value}`
}

export function formatSlotModifierDisplay(result: SlotModifierResult): string {
  if (result.isIntegerAdditive) {
    return formatAdditiveModifier(result.additiveAmount ?? 0)
  }
  return formatModifierPercent(result.modifier)
}

export function formatAggregatedModifierDisplay(mod: AggregatedModifier): string {
  if (mod.isIntegerAdditive) {
    return formatAdditiveModifier(mod.additiveChange ?? 0)
  }
  return formatModifierPercent(mod.combinedModifier)
}

/**
 * Get the color class for a modifier value.
 * For stats where lower is better, colors are inverted.
 */
export function getModifierColorClass(modifier: number, property?: string): string {
  const inverted = property ? isLowerBetter(property) : false
  
  if (modifier < 0.9999) {
    return inverted ? 'text-green-400' : 'text-red-400'
  }
  if (modifier > 1.0001) {
    return inverted ? 'text-red-400' : 'text-green-400'
  }
  return 'text-slate-400'
}

export function getAdditiveColorClass(value: number): string {
  if (value > 0) return 'text-green-400'
  if (value < 0) return 'text-red-400'
  return 'text-slate-400'
}

export function getSlotModifierColorClass(result: SlotModifierResult): string {
  if (result.isIntegerAdditive) {
    return getAdditiveColorClass(result.additiveAmount ?? 0)
  }
  return getModifierColorClass(result.modifier, result.property)
}

export function getAggregatedModifierColorClass(mod: AggregatedModifier): string {
  if (mod.isIntegerAdditive) {
    return getAdditiveColorClass(mod.additiveChange ?? 0)
  }
  return getModifierColorClass(mod.combinedModifier, mod.property)
}

/**
 * Calculate all modifier results for a slot at a given quality.
 */
export function calculateSlotModifiers(
  quality: number,
  modifiers: Array<RawModifier | Modifier> | undefined
): SlotModifierResult[] {
  const normalized = normalizeModifiers(modifiers)
  if (normalized.length === 0) return []

  // Group modifiers by property
  const byProperty = new Map<string, Modifier[]>()
  for (const mod of normalized) {
    const key = mod.gameplayProperty.toLowerCase()
    if (!byProperty.has(key)) {
      byProperty.set(key, [])
    }
    byProperty.get(key)!.push(mod)
  }

  const results: SlotModifierResult[] = []
  for (const [_property, mods] of byProperty) {
    const isIntegerAdditive = mods.some((mod) => mod.isIntegerAdditive)
    const value = interpolateModifier(quality, mods)
    if (isIntegerAdditive) {
      results.push({
        property: mods[0].gameplayProperty,
        propertyLabel: getPropertyLabel(mods[0].gameplayProperty),
        modifier: 1,
        percentChange: 0,
        additiveAmount: Math.round(value),
        isIntegerAdditive: true,
      })
    } else {
      results.push({
        property: mods[0].gameplayProperty,
        propertyLabel: getPropertyLabel(mods[0].gameplayProperty),
        modifier: value,
        percentChange: (value - 1) * 100,
      })
    }
  }

  return results
}

/**
 * Aggregate modifiers from multiple slots by property.
 * Same properties are multiplied together.
 */
export function aggregateModifiers(
  slotResults: SlotModifierResult[][],
  baseStats?: Record<string, number>
): AggregatedModifier[] {
  const byProperty = new Map<
    string,
    {
      label: string
      percentChanges: number[]
      additiveAmounts: number[]
      originalProperty: string
      isIntegerAdditive: boolean
    }
  >()

  for (const slotResult of slotResults) {
    for (const result of slotResult) {
      const key = result.property.toLowerCase()
      if (!byProperty.has(key)) {
        byProperty.set(key, {
          label: result.propertyLabel,
          percentChanges: [],
          additiveAmounts: [],
          originalProperty: result.property,
          isIntegerAdditive: !!result.isIntegerAdditive,
        })
      }
      const entry = byProperty.get(key)!
      if (result.isIntegerAdditive) {
        entry.isIntegerAdditive = true
        entry.additiveAmounts.push(result.additiveAmount ?? 0)
      } else {
        entry.percentChanges.push(result.percentChange)
      }
    }
  }

  const aggregated: AggregatedModifier[] = []
  for (const [property, data] of byProperty) {
    const percentChange = data.percentChanges.reduce((acc, p) => acc + p, 0)
    const additiveChange = data.additiveAmounts.reduce((acc, p) => acc + p, 0)
    const combinedModifier = 1 + percentChange / 100

    const baseKey = Object.keys(baseStats || {}).find(
      (k) => k.toLowerCase() === property.toLowerCase()
    )
    const baseValue = baseKey ? baseStats![baseKey] : undefined
    const rawFinal =
      baseValue !== undefined ? baseValue * combinedModifier + additiveChange : undefined
    // Keep full precision for damage-taken multipliers so mitigation % can show XX.XXX.
    const finalValue =
      rawFinal === undefined
        ? undefined
        : isArmorDamageTakenStat(data.originalProperty)
          ? rawFinal
          : Math.round(rawFinal * 100) / 100

    aggregated.push({
      property: data.originalProperty,
      propertyLabel: data.label,
      combinedModifier,
      percentChange,
      additiveChange: data.isIntegerAdditive ? additiveChange : undefined,
      baseValue,
      finalValue,
      isIntegerAdditive: data.isIntegerAdditive,
    })
  }

  // Sort by property label
  return aggregated.sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel))
}

/** CIG stores this as a damage-taken multiplier (0.6 = take 60% = mitigate 40%). */
export function isArmorDamageTakenStat(property?: string | null): boolean {
  if (!property) return false
  const key = property.trim().toLowerCase()
  return key === 'armor_damagemitigation' || key === 'damage mitigation'
}

/** Convert a taken-multiplier to the mitigated percent members actually care about. */
export function formatMitigationPercent(takenMultiplier: number): string {
  const pct = (1 - takenMultiplier) * 100
  return `${pct.toFixed(3)}%`
}

/**
 * Format a number with locale-specific thousands separators, rounded to 2 decimal places.
 * Armor damage mitigation is shown as actual blocked percent (XX.XXX%).
 */
export function formatStatValue(value: number, property?: string | null): string {
  if (isArmorDamageTakenStat(property)) {
    return formatMitigationPercent(value)
  }
  const rounded = Math.round(value * 100) / 100
  return rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
