/** One-shot Blueprints search focus from notifications (no sticky URL query). */

const STORAGE_KEY = 'dr_blueprint_focus_v1'
export const BLUEPRINT_FOCUS_EVENT = 'dr:blueprint-focus'

export function requestBlueprintFocus(query: string): void {
  const q = query.trim()
  if (!q || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ q, t: Date.now() }))
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new CustomEvent(BLUEPRINT_FOCUS_EVENT, { detail: { q } }))
}

/** Read and clear a pending focus (for Blueprints mount / hard navigation). */
export function consumeBlueprintFocusRequest(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STORAGE_KEY)
    const parsed = JSON.parse(raw) as { q?: unknown }
    return typeof parsed.q === 'string' && parsed.q.trim() ? parsed.q.trim() : null
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    return null
  }
}

export function subscribeBlueprintFocus(handler: (query: string) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onFocus = (event: Event) => {
    const q = (event as CustomEvent<{ q?: unknown }>).detail?.q
    if (typeof q !== 'string' || !q.trim()) return
    // Live listener handled it — do not re-apply on a later Blueprints remount.
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    handler(q.trim())
  }
  window.addEventListener(BLUEPRINT_FOCUS_EVENT, onFocus)
  return () => window.removeEventListener(BLUEPRINT_FOCUS_EVENT, onFocus)
}
