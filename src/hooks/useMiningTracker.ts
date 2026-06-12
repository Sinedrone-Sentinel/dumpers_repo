import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  type MiningTrackerEntry,
  miningTrackerEntryId,
  readMiningTrackerEntries,
  writeMiningTrackerEntries,
} from '../lib/localGuestCache'

interface DbEntry {
  id: string
  ore_name: string
  rarity: string
  added_at: string
}

function dbToLocal(db: DbEntry): MiningTrackerEntry {
  return {
    id: db.ore_name,
    oreName: db.ore_name,
    rarity: db.rarity,
    addedAt: new Date(db.added_at).getTime(),
  }
}

export function useMiningTracker() {
  const { user, isGuestPreview } = useAuth()
  const isGuest = !user || isGuestPreview

  const [entries, setEntries] = useState<MiningTrackerEntry[]>(() =>
    isGuest ? readMiningTrackerEntries() : []
  )
  const [loading, setLoading] = useState(!isGuest)

  // Load from DB for logged-in users
  useEffect(() => {
    if (isGuest) {
      setEntries(readMiningTrackerEntries())
      setLoading(false)
      return
    }

    const loadFromDb = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_mining_tracker_entries')
        if (error) throw error
        setEntries((data || []).map(dbToLocal))
      } catch (err) {
        console.error('Failed to load mining tracker:', err)
      }
      setLoading(false)
    }

    loadFromDb()
  }, [isGuest, user?.id])

  // Listen for localStorage changes (guests only)
  useEffect(() => {
    if (!isGuest) return

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dumpers_mining_tracker') {
        setEntries(readMiningTrackerEntries())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [isGuest])

  const addEntry = useCallback(
    async (oreName: string, rarity: string) => {
      const id = miningTrackerEntryId(oreName)
      if (entries.some((e) => e.id === id)) return false

      if (isGuest) {
        const next: MiningTrackerEntry[] = [
          { id, oreName, rarity, addedAt: Date.now() },
          ...entries,
        ]
        writeMiningTrackerEntries(next)
        setEntries(next)
        return true
      }

      // Logged-in user: save to DB
      try {
        const { data, error } = await supabase.rpc('add_mining_tracker_entry', {
          p_ore_name: oreName,
          p_rarity: rarity,
        })
        if (error) throw error
        if (data?.success && !data?.already_existed) {
          setEntries((prev) => [
            { id, oreName, rarity, addedAt: Date.now() },
            ...prev,
          ])
        }
        return true
      } catch (err) {
        console.error('Failed to add mining tracker entry:', err)
        return false
      }
    },
    [entries, isGuest]
  )

  const removeEntry = useCallback(
    async (id: string) => {
      if (isGuest) {
        const next = entries.filter((e) => e.id !== id)
        writeMiningTrackerEntries(next)
        setEntries(next)
        return
      }

      // Logged-in user: remove from DB (id is the ore name)
      try {
        const { error } = await supabase.rpc('remove_mining_tracker_entry', {
          p_ore_name: id,
        })
        if (error) throw error
        setEntries((prev) => prev.filter((e) => e.id !== id))
      } catch (err) {
        console.error('Failed to remove mining tracker entry:', err)
      }
    },
    [entries, isGuest]
  )

  const clearAll = useCallback(async () => {
    if (isGuest) {
      writeMiningTrackerEntries([])
      setEntries([])
      return
    }

    // Logged-in user: clear from DB
    try {
      const { error } = await supabase.rpc('clear_mining_tracker')
      if (error) throw error
      setEntries([])
    } catch (err) {
      console.error('Failed to clear mining tracker:', err)
    }
  }, [isGuest])

  const isTracked = useCallback(
    (oreName: string) => {
      return entries.some((e) => e.id === miningTrackerEntryId(oreName))
    },
    [entries]
  )

  return { entries, addEntry, removeEntry, clearAll, isTracked, loading }
}
