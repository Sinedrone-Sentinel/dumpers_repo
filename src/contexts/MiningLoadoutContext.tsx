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
  createCustomLoadoutFromLasers,
  deleteCustomLoadoutSlot,
  emptyMiningLoadoutStore,
  isCustomLoadoutKey,
  updateLoadoutLasers,
  type MiningLoadoutStore,
} from '../lib/miningLoadoutStorage'
import type { MiningLaserSlotConfig } from '../lib/miningLaserStats'
import type { LoadoutKey, CustomLoadoutSlotIndex } from '../lib/miningLoadoutStorage'
import type { MiningVesselId } from '../lib/miningVessels'

interface MiningLoadoutContextValue {
  canUse: boolean
  store: MiningLoadoutStore
  loading: boolean
  saving: boolean
  saveError: string | null
  /** Persist the current custom slot (overwrites saved data). */
  saveLoadout: (
    vesselId: MiningVesselId,
    loadoutKey: LoadoutKey,
    lasers: MiningLaserSlotConfig[]
  ) => Promise<boolean>
  /** Save draft lasers into the next available custom slot. */
  saveLoadoutAsNew: (
    vesselId: MiningVesselId,
    lasers: MiningLaserSlotConfig[]
  ) => Promise<CustomLoadoutSlotIndex | null>
  deleteCustomLoadout: (vesselId: MiningVesselId, slot: CustomLoadoutSlotIndex) => Promise<void>
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

  const persistStore = useCallback(
    async (next: MiningLoadoutStore): Promise<boolean> => {
      if (!canUse) return false

      setStoreState(next)
      setSaving(true)

      try {
        await saveMiningLoadoutState(next)
        setSaveError(null)
        return true
      } catch (err) {
        console.error('Failed to save mining loadouts:', err)
        setSaveError('Could not save loadout changes.')
        return false
      } finally {
        setSaving(false)
      }
    },
    [canUse]
  )

  const saveLoadout = useCallback(
    async (
      vesselId: MiningVesselId,
      loadoutKey: LoadoutKey,
      lasers: MiningLaserSlotConfig[]
    ): Promise<boolean> => {
      if (!isCustomLoadoutKey(loadoutKey)) return false
      const next = updateLoadoutLasers(storeRef.current, vesselId, loadoutKey, lasers)
      return persistStore(next)
    },
    [persistStore]
  )

  const saveLoadoutAsNew = useCallback(
    async (
      vesselId: MiningVesselId,
      lasers: MiningLaserSlotConfig[]
    ): Promise<CustomLoadoutSlotIndex | null> => {
      const { store: next, created } = createCustomLoadoutFromLasers(
        storeRef.current,
        vesselId,
        lasers
      )
      if (!created) return null
      const ok = await persistStore(next)
      return ok ? created : null
    },
    [persistStore]
  )

  const deleteCustomLoadout = useCallback(
    async (vesselId: MiningVesselId, slot: CustomLoadoutSlotIndex) => {
      const next = deleteCustomLoadoutSlot(storeRef.current, vesselId, slot)
      await persistStore(next)
    },
    [persistStore]
  )

  return (
    <MiningLoadoutContext.Provider
      value={{
        canUse,
        store,
        loading,
        saving,
        saveError,
        saveLoadout,
        saveLoadoutAsNew,
        deleteCustomLoadout,
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
