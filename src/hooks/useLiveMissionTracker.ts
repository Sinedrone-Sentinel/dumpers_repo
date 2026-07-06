import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  computeLiveTrackerView,
  isDumperWatchConnected,
  type DumperActiveMission,
} from '../lib/liveMissionTracker'

export function useLiveMissionTracker() {
  const { user, acquiredBlueprints, refreshAcquiredBlueprints } = useAuth()
  const [activeMissions, setActiveMissions] = useState<DumperActiveMission[]>([])
  const [watchActive, setWatchActive] = useState(false)
  const [lastPingAt, setLastPingAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionTick, setConnectionTick] = useState(0)

  useEffect(() => {
    if (!watchActive) return
    const id = window.setInterval(() => setConnectionTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [watchActive])

  const isConnected = useMemo(
    () => isDumperWatchConnected(watchActive, lastPingAt),
    [watchActive, lastPingAt, connectionTick]
  )

  const loadInitial = useCallback(async () => {
    if (!user?.id) {
      setActiveMissions([])
      setWatchActive(false)
      setLastPingAt(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [profileRes, missionsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('dumper_watch_active, dumper_last_ping_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('dumper_active_missions')
          .select('user_id, mission_guid, contract_definition_id, debug_name, started_at')
          .eq('user_id', user.id)
          .order('started_at', { ascending: true }),
      ])

      if (profileRes.error) throw profileRes.error
      if (missionsRes.error) throw missionsRes.error

      setWatchActive(profileRes.data?.dumper_watch_active ?? false)
      setLastPingAt(profileRes.data?.dumper_last_ping_at ?? null)
      setActiveMissions((missionsRes.data ?? []) as DumperActiveMission[])
    } catch (err) {
      console.error('Live tracker load failed:', err)
      setError('Failed to load live tracker data.')
      setActiveMissions([])
      setWatchActive(false)
      setLastPingAt(null)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`live-mission-tracker-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dumper_active_missions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { mission_guid?: string }
            if (oldRow.mission_guid) {
              setActiveMissions((prev) =>
                prev.filter((m) => m.mission_guid !== oldRow.mission_guid)
              )
            } else {
              setActiveMissions([])
            }
            return
          }

          const row = payload.new as DumperActiveMission
          if (!row?.mission_guid) return

          setActiveMissions((prev) => {
            const without = prev.filter((m) => m.mission_guid !== row.mission_guid)
            return [...without, row].sort(
              (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)
            )
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            dumper_watch_active?: boolean
            dumper_last_ping_at?: string | null
          }
          if (typeof row.dumper_watch_active === 'boolean') {
            setWatchActive(row.dumper_watch_active)
            if (!row.dumper_watch_active) {
              setActiveMissions([])
            }
          }
          if (row.dumper_last_ping_at !== undefined) {
            setLastPingAt(row.dumper_last_ping_at ?? null)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acquired_blueprints',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshAcquiredBlueprints()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, refreshAcquiredBlueprints])

  const view = useMemo(() => {
    if (!isConnected) {
      return { missions: [], remaining: [] }
    }
    return computeLiveTrackerView(activeMissions, acquiredBlueprints)
  }, [activeMissions, acquiredBlueprints, isConnected])

  return {
    loading,
    error,
    isConnected,
    missions: view.missions,
    remaining: view.remaining,
    refresh: loadInitial,
  }
}
