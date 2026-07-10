import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

interface UiOverlayContextValue {
  registerOverlay: (id: string) => void
  unregisterOverlay: (id: string) => void
}

const UiOverlayContext = createContext<UiOverlayContextValue | undefined>(undefined)

function createOverlayStore() {
  const ids = new Set<string>()
  const listeners = new Set<() => void>()

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return ids.size
    },
    register(id: string) {
      if (!ids.has(id)) {
        ids.add(id)
        listeners.forEach((l) => l())
      }
    },
    unregister(id: string) {
      if (ids.delete(id)) {
        listeners.forEach((l) => l())
      }
    },
  }
}

const overlayStore = createOverlayStore()

export function UiOverlayProvider({ children }: { children: React.ReactNode }) {
  const registerOverlay = useCallback((id: string) => {
    overlayStore.register(id)
  }, [])

  const unregisterOverlay = useCallback((id: string) => {
    overlayStore.unregister(id)
  }, [])

  const value = useMemo(
    () => ({ registerOverlay, unregisterOverlay }),
    [registerOverlay, unregisterOverlay]
  )

  return <UiOverlayContext.Provider value={value}>{children}</UiOverlayContext.Provider>
}

export function useUiOverlayRegistration(id: string, active: boolean) {
  const ctx = useContext(UiOverlayContext)
  const idRef = useRef(id)
  idRef.current = id

  React.useEffect(() => {
    if (!ctx || !active) return
    const overlayId = idRef.current
    ctx.registerOverlay(overlayId)
    return () => ctx.unregisterOverlay(overlayId)
  }, [ctx, active])
}

export function useUiOverlayPaused(): boolean {
  const count = useSyncExternalStore(
    overlayStore.subscribe,
    overlayStore.getSnapshot,
    () => 0
  )
  return count > 0
}

export function useUiOverlay() {
  const ctx = useContext(UiOverlayContext)
  if (!ctx) {
    throw new Error('useUiOverlay must be used within UiOverlayProvider')
  }
  return ctx
}
