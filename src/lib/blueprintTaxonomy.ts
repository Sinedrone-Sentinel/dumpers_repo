export const FPS_WEAPON_TYPE_OPTIONS = [
  'crossbow',
  'hmg',
  'lmg',
  'pistol',
  'rifle',
  'shotgun',
  'smg',
  'sniper',
] as const

export interface BlueprintTaxonomyInput {
  file?: string
  internalName?: string
  blueprintName?: string
  categoryName?: string
  subCategoryName?: string
  subtype?: string | null
  armorWeight?: string | null
  armorSlot?: string | null
}

const ARMOR_SLOT_SUBTYPES = new Set(['helmet', 'arms', 'core', 'legs', 'backpack', 'flight', 'suit', 'undersuit'])

function isFlightSuitName(internalName: string, displayName = ''): boolean {
  const filename = (internalName || '').toLowerCase()
  const label = (displayName || '').toLowerCase()
  if (/_helmet(?:_|$)/.test(filename)) return false
  if (/flightsuit(?:_|$)/.test(filename)) return true
  return /\bflight\b/.test(label) && /\bsuit\b/.test(label)
}

/** Shared slot detection from internal name / filename (bundled JSON has no folder path). */
export function detectArmorSlotFromName(name: string, displayName = ''): string | null {
  const filename = (name || '').toLowerCase()
  if (!filename && !displayName) return null
  if (/_helmet(?:_|$)/.test(filename)) return 'helmet'
  if (/_backpack(?:_|$)/.test(filename)) return 'backpack'
  if (/_pants(?:_|$)/.test(filename)) return 'legs'
  if (/_legs(?:_|$)/.test(filename)) return 'legs'
  if (/_arms(?:_|$)/.test(filename)) return 'arms'
  if (/_core(?:_|$)|_torso(?:_|$)|_jacket(?:_|$)/.test(filename)) return 'core'
  if (/_undersuit(?:_|$)/.test(filename)) return 'undersuit'
  if (isFlightSuitName(filename, displayName)) return 'flight'
  if (/_suit(?:_|$)/.test(filename)) return 'suit'
  return null
}

function getArmorFilename(bp: BlueprintTaxonomyInput): string {
  const raw = (bp.internalName || bp.file || '').trim()
  if (!raw) return ''
  if (raw.includes('\\')) {
    return raw.split('\\').pop()?.toLowerCase() || ''
  }
  return raw.toLowerCase()
}

function getArmorPathParts(bp: BlueprintTaxonomyInput): string[] {
  const raw = bp.file?.includes('\\') ? bp.file : null
  return raw ? raw.split('\\') : []
}

function getFpsWeaponTypeFromFilename(filename: string): string | null {
  const fn = filename.toLowerCase()
  for (const type of FPS_WEAPON_TYPE_OPTIONS) {
    if (fn.includes(`_${type}_`) || fn.includes(`_${type}.`)) return type
  }
  return null
}

export function formatTaxonomyLabel(value: string | null | undefined): string | null {
  if (!value) return null
  if (value === 'superheavy') return 'Super Heavy'
  if (value === 'flight') return 'Flight'
  if (value === 'suit') return 'Suit'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Subtype chip labels (matches blueprint filter formatting). */
export function formatSubtypeLabel(sub: string | null | undefined): string | null {
  if (!sub) return null
  return sub.charAt(0).toUpperCase() + sub.slice(1).replace(/([A-Z])/g, ' $1')
}

export type BlueprintTagKind = 'category' | 'size' | 'armorWeight' | 'armorSlot' | 'subtype'

export interface BlueprintDisplayTag {
  kind: BlueprintTagKind
  label: string
}

/** Tailwind chip classes aligned with blueprint filter chip colors. */
export const BLUEPRINT_TAG_CHIP_CLASS: Record<BlueprintTagKind, string> = {
  category: 'bg-slate-800 text-slate-400 border-slate-700',
  size: 'bg-blue-950/50 text-blue-400 border-blue-500/30',
  armorWeight: 'bg-blue-950/50 text-blue-400 border-blue-500/30',
  armorSlot: 'bg-green-950/50 text-green-400 border-green-500/30',
  subtype: 'bg-orange-950/50 text-orange-400 border-orange-500/30',
}

/** Ordered taxonomy tags for blueprint cards and detail views. */
export function getBlueprintDisplayTags(bp: BlueprintTaxonomyInput): BlueprintDisplayTag[] {
  const tags: BlueprintDisplayTag[] = []
  const size = extractComponentSize(bp.categoryName)
  const baseCategory =
    size && bp.categoryName ? bp.categoryName.replace(/\s+S\d+$/i, '').trim() : bp.categoryName

  if (baseCategory) {
    tags.push({ kind: 'category', label: baseCategory })
  }
  if (size) {
    tags.push({ kind: 'size', label: size })
  }

  const isFpsArmor = bp.categoryName === 'FPSArmours'

  if (isFpsArmor) {
    const armorWeight = getArmorWeight(bp)
    if (armorWeight) {
      const label = formatTaxonomyLabel(armorWeight)
      if (label) tags.push({ kind: 'armorWeight', label })
    }

    const armorSlot = getArmorSlot(bp)
    if (armorSlot) {
      const label = formatTaxonomyLabel(armorSlot)
      if (label) tags.push({ kind: 'armorSlot', label })
    }
  }

  const subType = getBlueprintSubType(bp)
  if (subType) {
    const label = formatSubtypeLabel(subType)
    if (label) tags.push({ kind: 'subtype', label })
  }

  return tags
}

export function getBlueprintSubType(bp: BlueprintTaxonomyInput): string | null {
  const pathKey = bp.file?.includes('\\') ? bp.file : null
  if (pathKey) {
    const parts = pathKey.split('\\')
    const filename = parts[parts.length - 1] || ''

    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === 'vehiclegear' && parts[i + 1] === 'weapons') {
        let next = parts[i + 2]?.replace('$', '')
        if (next === 'templates' && parts[i + 3]) next = parts[i + 3]
        if (next) return next
      }
      if (parts[i] === 'weapons' && parts[i - 1] === 'fpsgear') {
        const sub = parts[i + 1]?.replace('$', '')
        if (sub === 'templates') {
          const fromFile = getFpsWeaponTypeFromFilename(filename)
          if (fromFile) return fromFile
        } else if (sub) {
          return sub
        }
      }
      if (parts[i] === 'ammo' && parts[i - 1] === 'fpsgear') {
        const fromFilename = getFpsWeaponTypeFromFilename(filename)
        if (fromFilename) return fromFilename
        const folderType = parts[i + 1]?.replace('$', '')
        if (folderType && FPS_WEAPON_TYPE_OPTIONS.includes(folderType as (typeof FPS_WEAPON_TYPE_OPTIONS)[number])) {
          return folderType
        }
      }
      if (parts[i] === 'armour' && parts[i - 1] === 'fpsgear') {
        let sub = parts[i + 1]?.replace('$', '')
        if (sub === 'templates' && parts[i + 2]) sub = parts[i + 2]
        if (sub === 'combat') return 'standard'
        if (sub === 'flightsuit') {
          if (filename.includes('_helmet')) return 'standard'
          return 'flightsuit'
        }
        if (sub) return sub
      }
      if (parts[i] === 'vehiclegear' && parts[i + 1] !== 'weapons') {
        const sub = parts[i + 1]?.replace('$', '')
        if (sub) return sub
      }
    }
  }

  const subtype = bp.subtype?.trim()
  if (subtype && !ARMOR_SLOT_SUBTYPES.has(subtype)) return subtype

  if (bp.categoryName === 'FPSWeapons') {
    const fromInternal = getFpsWeaponTypeFromFilename(
      (bp.internalName || bp.file || '').toLowerCase(),
    )
    if (fromInternal) return fromInternal
  }

  return null
}

export function getAmmoDamageType(bp: BlueprintTaxonomyInput): string | null {
  if (bp.categoryName !== 'Ammo') return null
  const pathKey = bp.file?.includes('\\') ? bp.file : null
  if (!pathKey) return null
  const parts = pathKey.split('\\')
  const ammoIdx = parts.indexOf('ammo')
  if (ammoIdx < 0) return null
  const segment = parts[ammoIdx + 1]?.replace('$', '')?.toLowerCase()
  if (!segment || FPS_WEAPON_TYPE_OPTIONS.includes(segment as (typeof FPS_WEAPON_TYPE_OPTIONS)[number])) {
    return null
  }
  return segment
}

function getArmorWeightFromPath(parts: string[]): string | null {
  const armourIdx = parts.indexOf('armour')
  if (armourIdx < 0) return null
  for (let i = armourIdx + 1; i < parts.length - 1; i++) {
    const segment = parts[i]?.toLowerCase()
    if (segment && ['superheavy', 'heavy', 'medium', 'light'].includes(segment)) return segment
  }
  return null
}

function isFlightArmor(parts: string[], filename: string, blueprintName = ''): boolean {
  if (parts.some((p) => p.toLowerCase() === 'flightsuit')) return true
  if (parts.some((p) => p.toLowerCase() === 'racer')) return true
  if (filename.includes('flightsuit')) return true
  const name = blueprintName.toLowerCase()
  return name.includes('flight') || name.includes('racing')
}

export function getArmorWeight(bp: BlueprintTaxonomyInput): string | null {
  if (bp.categoryName && bp.categoryName !== 'FPSArmours') return null
  if (bp.armorWeight) return bp.armorWeight

  const parts = getArmorPathParts(bp)
  const filename = getArmorFilename(bp)
  if (!filename) return null

  const isArmorFromPath = parts.some((p, i) => p === 'armour' && parts[i - 1] === 'fpsgear')
  const isArmor = isArmorFromPath || bp.categoryName === 'FPSArmours'
  if (!isArmor) return null

  if (isFlightArmor(parts, filename, bp.blueprintName) || filename.includes('flightsuit')) {
    return 'flight'
  }
  if (filename.includes('_superheavy_') || filename.includes('_superheavy.')) return 'superheavy'
  if (filename.includes('_heavy_') || filename.includes('_heavy.')) return 'heavy'
  if (filename.includes('_medium_') || filename.includes('_medium.')) return 'medium'
  if (filename.includes('_light_') || filename.includes('_light.')) return 'light'

  const fromPath = getArmorWeightFromPath(parts)
  if (fromPath) return fromPath
  if (parts.some((p) => p.toLowerCase() === 'undersuit') || filename.includes('undersuit')) {
    return 'light'
  }
  if (filename.startsWith('gys_')) return 'medium'

  return null
}

export function getArmorSlot(bp: BlueprintTaxonomyInput): string | null {
  if (bp.categoryName && bp.categoryName !== 'FPSArmours') return null

  const filename = getArmorFilename(bp)
  const displayName = bp.blueprintName || ''

  if (bp.armorSlot) {
    if (bp.armorSlot === 'suit' && isFlightSuitName(filename, displayName)) return 'flight'
    return bp.armorSlot
  }

  const parts = getArmorPathParts(bp)
  if (!filename && !displayName) return null

  const isArmorFromPath = parts.some((p, i) => p === 'armour' && parts[i - 1] === 'fpsgear')
  const isArmor = isArmorFromPath || bp.categoryName === 'FPSArmours'
  if (!isArmor) return null

  return detectArmorSlotFromName(filename, displayName)
}

export function extractComponentSize(categoryName?: string): string | null {
  if (!categoryName) return null
  const match = categoryName.match(/S(\d+)/i)
  return match ? `S${match[1]}` : null
}
