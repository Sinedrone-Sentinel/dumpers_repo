export const GUEST_PREVIEW_STORAGE_KEY = 'dumpers_guest_preview'

function normalizePath(pathname: string): string {
  const bare = (pathname || '/').split('?')[0].split('#')[0] || '/'
  return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare
}

/** Home and crawlable pages stay signed-out. Any other URL is a tool bookmark. */
export function isOfflineToolPath(pathname: string): boolean {
  const normalized = normalizePath(pathname)
  if (
    normalized === '/' ||
    normalized === '/privacy' ||
    normalized === '/auth/callback' ||
    normalized === '/theme-preview'
  ) {
    return false
  }
  if (normalized === '/blueprints' || normalized.startsWith('/blueprints/')) return false
  return true
}

function readLocal(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(GUEST_PREVIEW_STORAGE_KEY)
  } catch {
    return null
  }
}

function readSession(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return sessionStorage.getItem(GUEST_PREVIEW_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Saved choice. A tab that still has the old session flag is copied across once. */
function readStoredChoice(): string | null {
  const saved = readLocal()
  if (saved === '1' || saved === '0') return saved
  if (readSession() === '1') {
    writeGuestPreviewSession(true)
    return '1'
  }
  return null
}

export function readGuestPreviewSession(): boolean {
  return readStoredChoice() === '1'
}

export function writeGuestPreviewSession(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(GUEST_PREVIEW_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* private mode */
  }
}

/**
 * First load. Home with no saved choice stays on the landing page.
 * A tool URL with no saved choice opens Offline Mode and remembers it.
 */
export function resolveInitialGuestPreview(): boolean {
  const saved = readStoredChoice()
  if (saved === '1') return true
  if (saved === '0') return false
  if (typeof window === 'undefined') return false
  if (!isOfflineToolPath(window.location.pathname)) return false
  writeGuestPreviewSession(true)
  return true
}
