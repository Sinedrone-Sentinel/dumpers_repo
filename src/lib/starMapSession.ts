import { useSyncExternalStore } from 'react'
import type { StarMapPayload } from './starMapHighlight'

/**
 * What the open map is drawing. Leaving the map clears this copy.
 * A Smart Hauler run is also stored apart from this, so closing the map
 * does not forget the stops or which leg is current.
 */
export interface StarMapSession {
  payload: StarMapPayload
  /** After a jump, the next system opens fully zoomed out with nothing selected. */
  wholeSystem?: boolean
  /** The overview still owes the member a which-system choice. */
  choicePending: boolean
  /** Changes when a new run is sent, so an open map refits. */
  focusId: number
}

let session: StarMapSession | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function startStarMapSession(payload: StarMapPayload): void {
  session = { payload, choicePending: true, focusId: Date.now() }
  emit()
}

/** Replace the drawn run without asking the member to pick a system again. */
export function showStarMapPayload(payload: StarMapPayload): void {
  if (!session) {
    session = { payload, choicePending: false, focusId: Date.now() }
  } else {
    session = { ...session, payload, choicePending: false }
  }
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
