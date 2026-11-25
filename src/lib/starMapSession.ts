import { useSyncExternalStore } from 'react'
import type { StarMapPayload } from './starMapHighlight'

/**
 * Data sent to the Star Map lives here only while the member stays on
 * `/star-map*`. A new send replaces it; leaving the map clears it.
 */
export interface StarMapSession {
  payload: StarMapPayload
  /** After a jump, the next system opens fully zoomed out with nothing selected. */
  wholeSystem?: boolean
  /** The overview still owes the member a which-system choice. */
  choicePending: boolean
}

let session: StarMapSession | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function startStarMapSession(payload: StarMapPayload): void {
  session = { payload, choicePending: true }
  emit()
}

export function updateStarMapSession(patch: Partial<Omit<StarMapSession, 'payload'>>): void {
  if (!session) return
  session = { ...session, ...patch }
  emit()
}

export function clearStarMapSession(): void {
  if (!session) return
  session = null
  emit()
}

export function getStarMapSession(): StarMapSession | null {
  return session
}

export function useStarMapSession(): StarMapSession | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => session,
    () => null,
  )
}

/** Call from each Star Map route's unmount: clears once the member is off the map. */
export function clearStarMapSessionIfLeft(): void {
  setTimeout(() => {
    if (typeof window === 'undefined') return
    if (!window.location.pathname.startsWith('/star-map')) clearStarMapSession()
  }, 0)
}
