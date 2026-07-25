export const GUEST_PREVIEW_STORAGE_KEY = 'dumpers_guest_preview'

export function readGuestPreviewSession(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  const value = sessionStorage.getItem(GUEST_PREVIEW_STORAGE_KEY)
  // Default off so first visits see the public SEO landing; '1' = offline tools.
  if (value === null) return false
  return value === '1'
}

export function writeGuestPreviewSession(enabled: boolean): void {
  if (typeof sessionStorage === 'undefined') return
  if (enabled) {
    sessionStorage.setItem(GUEST_PREVIEW_STORAGE_KEY, '1')
  } else {
    sessionStorage.setItem(GUEST_PREVIEW_STORAGE_KEY, '0')
  }
}
