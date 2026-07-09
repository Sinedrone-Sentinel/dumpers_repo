import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import {
  canUseMiningLoadouts,
  fetchMiningLoadoutState,
  saveMiningLoadoutState,
} from '../lib/miningLoadoutOps'
import {
  createCustomLoadoutSlot,
  deleteCustomLoadoutSlot,
  emptyMiningLoadoutStore,
  updateLoadoutLasers,
  type MiningLoadoutStore,
} from '../lib/miningLoadoutStorage'
import type { MiningLaserSlotConfig } from '../lib/miningLaserStats'
import type { LoadoutKey, CustomLoadoutSlotIndex } from '../lib/miningLoadoutStorage'
import type { MiningVesselId } from '../lib/miningVessels'

const SAVE_DEBOUNCE_MS = 400

interface MiningLoadoutContextValue {
  canUse: boolean
  store: MiningLoadoutStore
  loading: boolean
  saving: boolean
  saveError: string | null
  setStore: (next: MiningLoadoutStore) => void
  createCustomLoadout: (vesselId: MiningVesselId) => CustomLoadoutSlotIndex | null
  deleteCustomLoadout: (vesselId: MiningVesselId, slot: CustomLoadoutSlotIndex) => void
  updateLasers: (
    vesselId: MiningVesselId,
    loadoutKey: LoadoutKey,
    lasers: MiningLaserSlotConfig[]
  ) => void
}

const MiningLoadoutContext = createContext<MiningLoadoutContextValue | null>(null)

export function MiningLoadoutProvider({ children }: { children: React.ReactNode }) {
  const { user, isGuestPreview } = useAuth()
  const canUse = canUseMiningLoadouts(user?.id, isGuestPreview)

  const [store, setStoreState] = useState<MiningLoadoutStore>(emptyMiningLoadoutStore)
  const [loading, setLoading] = useState(canUse)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const storeRef = useRef(store)
  storeRef.current = store
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSeqRef = useRef(0)

  useEffect(() => {
    if (!canUse) {
      setStoreState(emptyMiningLoadoutStore())
      setLoading(false)
      setSaving(false)
      setSaveError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setSaveError(null)

    fetchMiningLoadoutState()
      .then((data) => {
        if (!cancelled) setStoreState(data)
      })
      .catch((err) => {
        console.error('Failed to load mining loadouts:', err)
        if (!cancelled) setSaveError('Could not load saved loadouts.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canUse, user?.id])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const queueSave = useCallback(
    (next: MiningLoadoutStore) => {
      if (!canUse) return

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      const seq = ++saveSeqRef.current

      saveTimerRef.current = setTimeout(() => {
        setSaving(true)
        saveMiningLoadoutState(next)
          .then(() => {
            if (seq === saveSeqRef.current) {
              setSaveError(null)
            }
          })
          .catch((err) => {
            console.error('Failed to save mining loadouts:', err)
            if (seq === saveSeqRef.current) {
              setSaveError('Could not save loadout changes.')
            }
          })
          .finally(() => {
            if (seq === saveSeqRef.current) {
              setSaving(false)
            }
          })
      }, SAVE_DEBOUNCE_MS)
    },
    [canUse]
  )

  const setStore = useCallback(
    (next: MiningLoadoutStore) => {
      setStoreState(next)
      queueSave(next)
    },
    [queueSave]
  )

  const createCustomLoadout = useCallback(
    (vesselId: MiningVesselId): CustomLoadoutSlotIndex | null => {
      const { store: next, created } = createCustomLoadoutSlot(storeRef.current, vesselId)
      if (!created) return null
      setStore(next)
      return created
    },
    [setStore]
  )

  const deleteCustomLoadout = useCallback(
    (vesselId: MiningVesselId, slot: CustomLoadoutSlotIndex) => {
      const next = deleteCustomLoadoutSlot(storeRef.current, vesselId, slot)
      setStore(next)
    },
    [setStore]
  )

  const updateLasers = useCallback(
    (vesselId: MiningVesselId, loadoutKey: LoadoutKey, lasers: MiningLaserSlotConfig[]) => {
      const next = updateLoadoutLasers(storeRef.current, vesselId, loadoutKey, lasers)
      setStore(next)
    },
    [setStore]
  )

  return (
    <MiningLoadoutContext.Provider
      value={{
        canUse,
        store,
        loading,
        saving,
        saveError,
        setStore,
        createCustomLoadout,
        deleteCustomLoadout,
        updateLasers,
      }}
    >
      {children}
    </MiningLoadoutContext.Provider>
  )
}

export function useMiningLoadouts() {
  const context = useContext(MiningLoadoutContext)
  if (!context) {
    throw new Error('useMiningLoadouts must be used within MiningLoadoutProvider')
  }
  return context
}
