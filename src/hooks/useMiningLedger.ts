import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createEmptyMiningLedgerData,
  seedCrewMemberOnce,
  type MiningLedgerData,
  type MiningLedgerDetail,
  type MiningLedgerListItem,
} from '../lib/miningLedger'
import {
  addMiningLedgerCollaborator,
  closeMiningLedger,
  createMiningLedger,
  fetchMiningLedger,
  fetchMiningLedgers,
  removeMiningLedgerCollaborator,
  updateMiningLedger,
} from '../lib/miningLedgerOps'

const SAVE_DEBOUNCE_MS = 900

export function useMiningLedger() {
  const [ledgers, setLedgers] = useState<MiningLedgerListItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MiningLedgerDetail | null>(null)
  const [data, setData] = useState<MiningLedgerData>(createEmptyMiningLedgerData())
  const [ledgerName, setLedgerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ id: string; name: string; data: MiningLedgerData } | null>(null)

  const refreshList = useCallback(async () => {
    const { data: list, error: listError } = await fetchMiningLedgers()
    if (listError) {
      setError(listError)
      return []
    }
    setLedgers(list)
    return list
  }, [])

  const loadLedger = useCallback(async (ledgerId: string) => {
    setLoading(true)
    setError(null)
    const { data: loaded, error: loadError } = await fetchMiningLedger(ledgerId)
    if (loadError || !loaded) {
      setError(loadError ?? 'Ledger not found')
      setDetail(null)
      setLoading(false)
      return
    }
    setActiveId(loaded.id)
    setDetail(loaded)
    setLedgerName(loaded.name)
    setData(loaded.data)
    setLoading(false)
  }, [])

  const flushSave = useCallback(async () => {
    const pending = pendingSaveRef.current
    if (!pending) return
    pendingSaveRef.current = null
    setSaving(true)
    const { error: saveError } = await updateMiningLedger(pending.id, {
      name: pending.name,
      data: pending.data,
    })
    setSaving(false)
    if (saveError) setError(saveError)
    else void refreshList()
  }, [refreshList])

  const scheduleSave = useCallback(
    (ledgerId: string, name: string, nextData: MiningLedgerData) => {
      pendingSaveRef.current = { id: ledgerId, name, data: nextData }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        void flushSave()
      }, SAVE_DEBOUNCE_MS)
    },
    [flushSave]
  )

  const updateData = useCallback(
    (updater: (prev: MiningLedgerData) => MiningLedgerData) => {
      setData((prev) => {
        const next = updater(prev)
        if (activeId) scheduleSave(activeId, ledgerName, next)
        return next
      })
    },
    [activeId, ledgerName, scheduleSave]
  )

  const updateName = useCallback(
    (name: string) => {
      setLedgerName(name)
      if (activeId) scheduleSave(activeId, name, data)
    },
    [activeId, data, scheduleSave]
  )

  const init = useCallback(async () => {
    setLoading(true)
    setError(null)
    const list = await refreshList()
    if (list.length > 0) {
      await loadLedger(list[0].id)
    } else {
      setActiveId(null)
      setDetail(null)
      setData(createEmptyMiningLedgerData())
      setLedgerName('')
      setLoading(false)
    }
  }, [loadLedger, refreshList])

  useEffect(() => {
    void init()
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      void flushSave()
    }
  }, [init, flushSave])

  const createLedger = useCallback(
    async (name: string, seed?: { userId: string; playerName: string }) => {
      setError(null)
      let initialData = createEmptyMiningLedgerData()
      if (seed) {
        initialData = seedCrewMemberOnce(initialData, seed.userId, seed.playerName)
      }
      const { id, error: createError } = await createMiningLedger(name, initialData)
      if (createError || !id) {
        setError(createError ?? 'Failed to create ledger')
        return null
      }
      await refreshList()
      await loadLedger(id)
      return id
    },
    [loadLedger, refreshList]
  )

  const selectLedger = useCallback(
    async (ledgerId: string) => {
      if (ledgerId === activeId) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      await flushSave()
      await loadLedger(ledgerId)
    },
    [activeId, flushSave, loadLedger]
  )

  const closeLedger = useCallback(async (options?: { recordArchiveStats?: boolean; totalPayoutAuec?: number }) => {
    if (!activeId) return { error: 'No active ledger' }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await flushSave()
    const { error: closeError } = await closeMiningLedger(activeId, options)
    if (closeError) return { error: closeError }

    const list = await refreshList()
    if (list.length > 0) {
      await loadLedger(list[0].id)
    } else {
      setActiveId(null)
      setDetail(null)
      setData(createEmptyMiningLedgerData())
      setLedgerName('')
    }
    return { error: null }
  }, [activeId, flushSave, loadLedger, refreshList])

  const reloadCollaborators = useCallback(async () => {
    if (!activeId) return
    const { data: loaded } = await fetchMiningLedger(activeId)
    if (loaded) setDetail(loaded)
  }, [activeId])

  const addCollaborator = useCallback(
    async (userId: string) => {
      if (!activeId) return { error: 'No active ledger' }
      const { error: addError } = await addMiningLedgerCollaborator(activeId, userId)
      if (!addError) await reloadCollaborators()
      return { error: addError }
    },
    [activeId, reloadCollaborators]
  )

  const removeCollaborator = useCallback(
    async (userId: string) => {
      if (!activeId) return { error: 'No active ledger' }
      const { error: removeError } = await removeMiningLedgerCollaborator(activeId, userId)
      if (!removeError) await reloadCollaborators()
      return { error: removeError }
    },
    [activeId, reloadCollaborators]
  )

  return {
    ledgers,
    activeId,
    detail,
    data,
    ledgerName,
    loading,
    saving,
    error,
    setError,
    updateData,
    updateName,
    createLedger,
    selectLedger,
    closeLedger,
    addCollaborator,
    removeCollaborator,
    refreshList,
  }
}
