import componentMetadata from '../data/component-metadata.json'
import {
  extractComponentSize,
  formatSubtypeLabel,
  getBlueprintSubType,
  type BlueprintTaxonomyInput,
} from './blueprintTaxonomy'

interface ComponentMeta {
  itemClass?: string
  grade?: string
}

export type BlueprintSpecInput = Pick<
  BlueprintTaxonomyInput,
  'file' | 'categoryName' | 'subtype' | 'internalName' | 'blueprintName' | 'subCategoryName' | 'armorWeight' | 'armorSlot'
> & {
  entityClass?: string | null
}

const metadataByFile = componentMetadata.blueprints as Record<string, ComponentMeta>

export const COMPONENT_ITEM_CLASS_OPTIONS = [
  'military',
  'civilian',
  'stealth',
  'industrial',
  'competition',
] as const

export const COMPONENT_GRADE_OPTIONS = ['A', 'B', 'C', 'D'] as const

const ITEM_CLASS_LABELS: Record<string, string> = {
  competition: 'Competition',
  civilian: 'Civilian',
  military: 'Military',
  industrial: 'Industrial',
  stealth: 'Stealth',
}

export function formatComponentItemClass(itemClass: string): string {
  return ITEM_CLASS_LABELS[itemClass] ?? itemClass.charAt(0).toUpperCase() + itemClass.slice(1)
}

function formatItemClass(itemClass: string): string {
  return formatComponentItemClass(itemClass)
}

function isVehicleComponent(categoryName?: string): boolean {
  return categoryName?.startsWith('Veh. Comp.') === true
}

function normalizeMetadataKey(raw: string): string {
  return raw.toLowerCase().replace(/_scitem$/, '')
}

function resolveComponentMeta(bp: BlueprintSpecInput): ComponentMeta | null {
  const candidates = [bp.file, bp.internalName, bp.entityClass].filter(Boolean) as string[]

  for (const raw of candidates) {
    const meta = metadataByFile[normalizeMetadataKey(raw)]
    if (meta?.itemClass || meta?.grade) return meta
  }

  return null
}

function resolveComponentSize(bp: BlueprintSpecInput): string | null {
  const fromCategory = extractComponentSize(bp.categoryName)
  if (fromCategory) return fromCategory

  for (const raw of [bp.file, bp.internalName, bp.entityClass]) {
    if (!raw) continue
    const match = normalizeMetadataKey(raw).match(/_s(\d+)(?:_|$)/)
    if (match) return `S${match[1]}`
  }

  return null
}

export function getComponentItemClass(bp: BlueprintSpecInput): string | null {
  if (!isVehicleComponent(bp.categoryName)) return null
  const itemClass = resolveComponentMeta(bp)?.itemClass
  if (!itemClass) return null
  return itemClass.toLowerCase()
}

export function getComponentGrade(bp: BlueprintSpecInput): string | null {
  if (!isVehicleComponent(bp.categoryName)) return null
  const grade = resolveComponentMeta(bp)?.grade
  if (!grade) return null
  const letter = grade.toUpperCase()
  return (COMPONENT_GRADE_OPTIONS as readonly string[]).includes(letter) ? letter : null
}

/** Size + class + grade + component type subline, e.g. "S2 Military A Cooler". */
export function formatBlueprintSpecLine(bp: BlueprintSpecInput): string | null {
  if ((!bp.file && !bp.internalName) || !isVehicleComponent(bp.categoryName)) return null

  const subTypeLabel = formatSubtypeLabel(getBlueprintSubType(bp))
  const meta = resolveComponentMeta(bp)
  const size = resolveComponentSize(bp)

  const parts: string[] = []
  if (size) parts.push(size)

  if (meta?.itemClass && meta?.grade) {
    parts.push(`${formatItemClass(meta.itemClass)} ${meta.grade}`)
  } else if (meta?.grade) {
    parts.push(meta.grade)
  } else if (meta?.itemClass) {
    parts.push(formatItemClass(meta.itemClass))
  }

  if (subTypeLabel) parts.push(subTypeLabel)

  return parts.length > 0 ? parts.join(' ') : null
}
