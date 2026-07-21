import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  computeLiveTrackerView,
  getLiveTrackerStatusBar,
  isDumperWatchConnected,
  shouldHideLiveMissionLists,
  type DumperActiveMission,
} from '../lib/liveMissionTracker'

export function useLiveMissionTracker() {
  const { user, acquiredBlueprints, refreshAcquiredBlueprints } = useAuth()
  const [activeMissions, setActiveMissions] = useState<DumperActiveMission[]>([])
  const [watchActive, setWatchActive] = useState(false)
  const [lastPingAt, setLastPingAt] = useState<string | null>(null)
  const [gameStatus, setGameStatus] = useState<string | null>(null)
  const [gameStatusAt, setGameStatusAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionTick, setConnectionTick] = useState(0)
  const [displayConnected, setDisplayConnected] = useState(false)
  const wasConnectedRef = useRef(false)
  const initialLoadedRef = useRef(false)

  useEffect(() => {
    if (!watchActive) return
    const id = window.setInterval(() => setConnectionTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [watchActive])

  const rawConnected = useMemo(
    () => isDumperWatchConnected(watchActive, lastPingAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connectionTick forces re-check on interval
    [watchActive, lastPingAt, connectionTick]
  )

  /** Debounce brief disconnect flicker when pings race the stale-session cleanup. */
  useEffect(() => {
    if (rawConnected) {
      wasConnectedRef.current = true
      setDisplayConnected(true)
      return
    }
    if (!wasConnectedRef.current) {
      setDisplayConnected(false)
      return
    }
    const timer = window.setTimeout(() => setDisplayConnected(false), 8_000)
    return () => window.clearTimeout(timer)
  }, [rawConnected])

  const isConnected = displayConnected

  const statusBar = useMemo(
    () => getLiveTrackerStatusBar(gameStatus, gameStatusAt, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connectionTick forces re-check on interval
    [gameStatus, gameStatusAt, connectionTick]
  )

  const loadInitial = useCallback(async () => {
    if (!user?.id) {
      setActiveMissions([])
      setWatchActive(false)
      setLastPingAt(null)
      setGameStatus(null)
      setGameStatusAt(null)
      setLoading(false)
      initialLoadedRef.current = true
      return
    }

    // Only the first load blanks the page; later re-syncs are non-disruptive.
    if (initialLoadedRef.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const [profileRes, missionsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('dumper_watch_active, dumper_last_ping_at, dumper_game_status, dumper_game_status_at')
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
      setGameStatus(profileRes.data?.dumper_game_status ?? null)
      setGameStatusAt(profileRes.data?.dumper_game_status_at ?? null)
      setActiveMissions((missionsRes.data ?? []) as DumperActiveMission[])
    } catch (err) {
      console.error('Live tracker load failed:', err)
      setError('Failed to load live tracker data.')
      setActiveMissions([])
      setWatchActive(false)
      setLastPingAt(null)
      setGameStatus(null)
      setGameStatusAt(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
      initialLoadedRef.current = true
    }
  }, [user?.id])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  /** Catch profile updates that land before realtime SUBSCRIBED or if postgres_changes is missed. */
  useEffect(() => {
    if (!user?.id || isConnected) return
    const id = window.setInterval(() => {
      void loadInitial()
    }, 10_000)
    return () => window.clearInterval(id)
  }, [user?.id, isConnected, loadInitial])

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
            dumper_game_status?: string | null
            dumper_game_status_at?: string | null
          }
          if (typeof row.dumper_watch_active === 'boolean') {
            setWatchActive(row.dumper_watch_active)
            if (!row.dumper_watch_active) {
              setActiveMissions([])
              setGameStatus(null)
              setGameStatusAt(null)
            }
          }
          if (row.dumper_last_ping_at !== undefined) {
            setLastPingAt(row.dumper_last_ping_at ?? null)
          }
          if (row.dumper_game_status !== undefined) {
            setGameStatus(row.dumper_game_status ?? null)
          }
          if (row.dumper_game_status_at !== undefined) {
            setGameStatusAt(row.dumper_game_status_at ?? null)
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void loadInitial()
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, refreshAcquiredBlueprints, loadInitial])

  const hideMissionLists = shouldHideLiveMissionLists(statusBar.status)

  const view = useMemo(() => {
    if (!isConnected || hideMissionLists) {
      return { missions: [], remaining: [] }
    }
    return computeLiveTrackerView(activeMissions, acquiredBlueprints)
  }, [activeMissions, acquiredBlueprints, isConnected, hideMissionLists])

  return {
    loading,
    refreshing,
    error,
    isConnected,
    statusBar,
    hideMissionLists,
    missions: view.missions,
    remaining: view.remaining,
    refresh: loadInitial,
  }
}
