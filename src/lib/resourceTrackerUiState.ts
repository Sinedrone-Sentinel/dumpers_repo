const STORAGE_KEY_PREFIX = 'dumpers_repo_resource_tracker_ui_v1'

export interface ResourceTrackerUiState {
  closeNoCigar: boolean
}

const DEFAULT_STATE: ResourceTrackerUiState = {
  closeNoCigar: false,
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

/** Scope: authenticated user id, or `guest` for offline preview. Null = do not persist. */
export function getResourceTrackerUiScope(
  userId: string | undefined | null,
  isGuestPreview: boolean
): string | null {
  if (userId) return userId
  if (isGuestPreview) return 'guest'
  return null
}

export function readResourceTrackerUiState(scope: string | null): ResourceTrackerUiState {
  if (!scope || typeof localStorage === 'undefined') return DEFAULT_STATE

  const parsed = safeParse<Partial<ResourceTrackerUiState>>(
    localStorage.getItem(storageKey(scope)),
    DEFAULT_STATE
  )

  return {
    closeNoCigar: parsed.closeNoCigar === true,
  }
}

export function writeResourceTrackerUiState(
  scope: string | null,
  update: Partial<ResourceTrackerUiState>
): void {
  if (!scope || typeof localStorage === 'undefined') return

  const current = readResourceTrackerUiState(scope)
  const next: ResourceTrackerUiState = {
    closeNoCigar: update.closeNoCigar ?? current.closeNoCigar,
  }

  localStorage.setItem(storageKey(scope), JSON.stringify(next))
}
