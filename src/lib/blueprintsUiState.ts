const STORAGE_KEY_PREFIX = 'dumpers_repo_blueprints_ui_v1'

export type BlueprintsAcquisitionFilter = 'all' | 'acquired' | 'not_acquired'

export interface BlueprintsUiState {
  searchTerm: string
  selectedMaterial: string | null
  selectedMainCategory: string | null
  selectedSubCategory: string | null
  selectedSize: string | null
  selectedComponentClass: string | null
  selectedComponentGrade: string | null
  selectedArmorWeight: string | null
  selectedArmorSlot: string | null
  showOnlyRewards: boolean
  acquisitionFilter: BlueprintsAcquisitionFilter
}

const DEFAULT_STATE: BlueprintsUiState = {
  searchTerm: '',
  selectedMaterial: null,
  selectedMainCategory: null,
  selectedSubCategory: null,
  selectedSize: null,
  selectedComponentClass: null,
  selectedComponentGrade: null,
  selectedArmorWeight: null,
  selectedArmorSlot: null,
  showOnlyRewards: true,
  acquisitionFilter: 'all',
}

function storageKey(scope: string): string {
  return `${STORAGE_KEY_PREFIX}:${scope}`
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function parseAcquisitionFilter(value: unknown): BlueprintsAcquisitionFilter {
  if (value === 'acquired' || value === 'not_acquired') return value
  return 'all'
}

/** Scope: authenticated user id, or `guest` for offline preview. Null = do not persist. */
export function getBlueprintsUiScope(
  userId: string | undefined | null,
  isGuestPreview: boolean
): string | null {
  if (userId) return userId
  if (isGuestPreview) return 'guest'
  return null
}

export function readBlueprintsUiState(scope: string | null): BlueprintsUiState {
  if (!scope || typeof localStorage === 'undefined') return DEFAULT_STATE

  const parsed = safeParse<Partial<BlueprintsUiState>>(
    localStorage.getItem(storageKey(scope)),
    DEFAULT_STATE
  )

  return {
    searchTerm: typeof parsed.searchTerm === 'string' ? parsed.searchTerm : '',
    selectedMaterial: nullableString(parsed.selectedMaterial),
    selectedMainCategory: nullableString(parsed.selectedMainCategory),
    selectedSubCategory: nullableString(parsed.selectedSubCategory),
    selectedSize: nullableString(parsed.selectedSize),
    selectedComponentClass: nullableString(parsed.selectedComponentClass),
    selectedComponentGrade: nullableString(parsed.selectedComponentGrade),
    selectedArmorWeight: nullableString(parsed.selectedArmorWeight),
    selectedArmorSlot: nullableString(parsed.selectedArmorSlot),
    showOnlyRewards: typeof parsed.showOnlyRewards === 'boolean' ? parsed.showOnlyRewards : true,
    acquisitionFilter: parseAcquisitionFilter(parsed.acquisitionFilter),
  }
}

export function writeBlueprintsUiState(scope: string | null, update: Partial<BlueprintsUiState>): void {
  if (!scope || typeof localStorage === 'undefined') return

  const current = readBlueprintsUiState(scope)
  const next: BlueprintsUiState = {
    searchTerm: update.searchTerm ?? current.searchTerm,
    selectedMaterial:
      update.selectedMaterial !== undefined ? update.selectedMaterial : current.selectedMaterial,
    selectedMainCategory:
      update.selectedMainCategory !== undefined
        ? update.selectedMainCategory
        : current.selectedMainCategory,
    selectedSubCategory:
      update.selectedSubCategory !== undefined ? update.selectedSubCategory : current.selectedSubCategory,
    selectedSize: update.selectedSize !== undefined ? update.selectedSize : current.selectedSize,
    selectedComponentClass:
      update.selectedComponentClass !== undefined
        ? update.selectedComponentClass
        : current.selectedComponentClass,
    selectedComponentGrade:
      update.selectedComponentGrade !== undefined
        ? update.selectedComponentGrade
        : current.selectedComponentGrade,
    selectedArmorWeight:
      update.selectedArmorWeight !== undefined ? update.selectedArmorWeight : current.selectedArmorWeight,
    selectedArmorSlot:
      update.selectedArmorSlot !== undefined ? update.selectedArmorSlot : current.selectedArmorSlot,
    showOnlyRewards: update.showOnlyRewards ?? current.showOnlyRewards,
    acquisitionFilter: update.acquisitionFilter ?? current.acquisitionFilter,
  }

  localStorage.setItem(storageKey(scope), JSON.stringify(next))
}
