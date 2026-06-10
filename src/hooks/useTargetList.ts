import { useCallback, useEffect, useState } from 'react'
import { useLatestRef } from './useLatestRef'
import { useAuth } from '../contexts/AuthContext'
import { missionKey } from '../lib/missions'
import { canAddBlueprintToTargetListById } from '../lib/blueprintOrderable'
import {
  addTargetBlueprint,
  fetchMissionPrefs,
  fetchTargetBlueprintIds,
  removeTargetBlueprint,
  removeMissionPrefsByKeys,
  setMissionIncluded,
} from '../lib/targetList'

export type GetMissionKeysForBlueprint = (blueprintId: string) => string[]

export function useTargetList(
  overridesMap: Record<string, boolean> = {},
  getMissionKeysForBlueprint?: GetMissionKeysForBlueprint
) {
  const { user, isApproved, acquiredBlueprints } = useAuth()
  const [targetIds, setTargetIds] = useState<Record<string, boolean>>({})
  const [missionPrefs, setMissionPrefs] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const acquiredRef = useLatestRef(acquiredBlueprints)
  const getMissionKeysRef = useLatestRef(getMissionKeysForBlueprint)

  const refresh = useCallback(async () => {
    if (!user?.id || !isApproved) {
      setTargetIds({})
      setMissionPrefs({})
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const acquired = acquiredRef.current

    try {
      const [ids, prefs] = await Promise.all([
        fetchTargetBlueprintIds(user.id),
        fetchMissionPrefs(user.id),
      ])

      const staleAcquired = ids.filter((id) => acquired[id])
      if (staleAcquired.length > 0) {
        await Promise.all(
          staleAcquired.map((id) => removeTargetBlueprint(user.id, id))
        )
      }

      const map: Record<string, boolean> = {}
      ids
        .filter((id) => !acquired[id])
        .forEach((id) => {
          map[id] = true
        })
      setTargetIds(map)
      setMissionPrefs(prefs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load target list')
    } finally {
      setLoading(false)
    }
    // acquiredRef is intentionally omitted — stable ref to latest map without re-fetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isApproved])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!user?.id || !isApproved) return

    const acquiredOnTarget = Object.keys(targetIds).filter((id) => acquiredBlueprints[id])
    if (acquiredOnTarget.length === 0) return

    void (async () => {
      // Collect all mission keys to remove for acquired blueprints
      const getMissionKeys = getMissionKeysRef.current
      const missionKeysToRemove: string[] = []
      if (getMissionKeys) {
        for (const bpId of acquiredOnTarget) {
          missionKeysToRemove.push(...getMissionKeys(bpId))
        }
      }

      await Promise.all([
        ...acquiredOnTarget.map((id) => removeTargetBlueprint(user.id, id)),
        missionKeysToRemove.length > 0
          ? removeMissionPrefsByKeys(user.id, missionKeysToRemove)
          : Promise.resolve(),
      ])

      setTargetIds((prev) => {
        const next = { ...prev }
        for (const id of acquiredOnTarget) delete next[id]
        return next
      })

      // Also update local mission prefs state
      if (missionKeysToRemove.length > 0) {
        setMissionPrefs((prev) => {
          const next = { ...prev }
          for (const key of missionKeysToRemove) delete next[key]
          return next
        })
      }
    })()
    // getMissionKeysRef is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquiredBlueprints, targetIds, user?.id, isApproved])

  const toggleTarget = useCallback(
    async (blueprintId: string) => {
      if (!user || !isApproved) return false

      if (acquiredBlueprints[blueprintId]) {
        setError('This blueprint is already in your pool and cannot be on the target list.')
        return false
      }

      const isOnList = !!targetIds[blueprintId]

      if (isOnList) {
        // Get mission keys to remove along with the blueprint
        const getMissionKeys = getMissionKeysRef.current
        const missionKeysToRemove = getMissionKeys ? getMissionKeys(blueprintId) : []

        const result = await removeTargetBlueprint(user.id, blueprintId, missionKeysToRemove)
        if (result.error) {
          setError(result.error)
          return false
        }
        setTargetIds((prev) => {
          const next = { ...prev }
          delete next[blueprintId]
          return next
        })

        // Also update local mission prefs state
        if (missionKeysToRemove.length > 0) {
          setMissionPrefs((prev) => {
            const next = { ...prev }
            for (const key of missionKeysToRemove) delete next[key]
            return next
          })
        }
      } else {
        if (!canAddBlueprintToTargetListById(blueprintId, overridesMap)) {
          setError(
            'This blueprint cannot be added to your target list (not orderable and no reward missions).'
          )
          return false
        }

        const result = await addTargetBlueprint(user.id, blueprintId)
        if (result.error) {
          setError(result.error)
          return false
        }
        setTargetIds((prev) => ({ ...prev, [blueprintId]: true }))
      }

      return true
    },
    // getMissionKeysRef is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isApproved, targetIds, acquiredBlueprints, overridesMap]
  )

  const setMissionOnChecklist = useCallback(
    async (missionLabel: string, onChecklist: boolean) => {
      if (!user || !isApproved) return false

      const result = await setMissionIncluded(user.id, missionLabel, onChecklist)
      if (result.error) {
        setError(result.error)
        return false
      }

      setMissionPrefs((prev) => ({
        ...prev,
        [missionKey(missionLabel)]: onChecklist,
      }))

      return true
    },
    [user, isApproved]
  )

  const addMissionToChecklist = useCallback(
    async (missionLabel: string) => setMissionOnChecklist(missionLabel, true),
    [setMissionOnChecklist]
  )

  const removeMissionFromChecklist = useCallback(
    async (missionLabel: string) => setMissionOnChecklist(missionLabel, false),
    [setMissionOnChecklist]
  )

  const addAllMissionsToChecklist = useCallback(
    async (missionLabels: string[]) => {
      if (!user || !isApproved) return false

      const toAdd = missionLabels.filter((label) => missionPrefs[missionKey(label)] !== true)
      if (toAdd.length === 0) return true

      const results = await Promise.all(
        toAdd.map((label) => setMissionIncluded(user.id, label, true))
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) {
        setError(failed.error)
        return false
      }

      setMissionPrefs((prev) => {
        const next = { ...prev }
        for (const label of toAdd) {
          next[missionKey(label)] = true
        }
        return next
      })

      return true
    },
    [user, isApproved, missionPrefs]
  )

  const isMissionOnChecklist = useCallback(
    (key: string) => missionPrefs[key] === true,
    [missionPrefs]
  )

  return {
    targetIds,
    missionPrefs,
    loading,
    error,
    refresh,
    toggleTarget,
    addMissionToChecklist,
    removeMissionFromChecklist,
    addAllMissionsToChecklist,
    isMissionOnChecklist,
    isOnTargetList: (blueprintId: string) => !!targetIds[blueprintId],
    targetCount: Object.keys(targetIds).length,
  }
}
