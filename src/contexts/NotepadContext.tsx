import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import { fetchMemberNotepad, saveMemberNotepad } from '../lib/notepad'
import { clampNotepad } from '../lib/notepadText'
import { readGuestNotepad, writeGuestNotepad } from '../lib/localGuestCache'

export type NotepadPendingLeave =
  | { kind: 'href'; href: string }
  | { kind: 'action'; run: () => void }

interface NotepadContextValue {
  open: boolean
  toggle: () => void
  draft: string
  setDraft: (text: string) => void
  dirty: boolean
  loading: boolean
  saving: boolean
  error: string | null
  isMember: boolean
  save: () => Promise<boolean>
  clear: () => void
  /** Runs `action` now, or asks first when the pad has unsaved edits. */
  runIfNoUnsavedNotes: (action: () => void) => void
  pendingLeave: NotepadPendingLeave | null
  confirmLeave: () => void
  cancelLeave: () => void
}

const NotepadContext = createContext<NotepadContextValue | null>(null)

function externalHrefFromClick(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const target = event.target
  if (!(target instanceof Element)) return null
  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return null
  if (anchor.hasAttribute('download')) return null
  const linkTarget = anchor.getAttribute('target')
  if (linkTarget && linkTarget !== '_self') return null
  let url: URL
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.origin === window.location.origin) return null
  return url.href
}

export function NotepadProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const isMember = !!userId

  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  const [draft, setDraftState] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingLeave, setPendingLeave] = useState<NotepadPendingLeave | null>(null)

  const dirty = draft !== saved
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const skipUnloadPromptRef = useRef(false)

  useEffect(() => {
    if (authLoading) return
    setError(null)

    if (!userId) {
      const local = clampNotepad(readGuestNotepad())
      setSaved(local)
      setDraftState(local)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        let content = await fetchMemberNotepad(userId)
        if (content === null) {
          const guest = clampNotepad(readGuestNotepad())
          content = ''
          if (guest) {
            await saveMemberNotepad(guest)
            writeGuestNotepad('')
            content = guest
          }
        }
        if (cancelled) return
        setSaved(content)
        setDraftState(content)
      } catch (err) {
        console.error('Failed to load notepad:', err)
        if (!cancelled) {
          setSaved('')
          setDraftState('')
          setError('Could not load your notepad.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, userId])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipUnloadPromptRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!dirty) return
    const onClick = (event: MouseEvent) => {
      const href = externalHrefFromClick(event)
      if (!href) return
      event.preventDefault()
      event.stopPropagation()
      setPendingLeave({ kind: 'href', href })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])

  const toggle = useCallback(() => setOpen((v) => !v), [])

  const setDraft = useCallback((text: string) => {
    setDraftState(clampNotepad(text))
  }, [])

  const clear = useCallback(() => setDraftState(''), [])

  const save = useCallback(async (): Promise<boolean> => {
    const content = clampNotepad(draft)
    if (!isMember) {
      writeGuestNotepad(content)
      setSaved(content)
      setError(null)
      return true
    }
    setSaving(true)
    try {
      await saveMemberNotepad(content)
      setSaved(content)
      setError(null)
      return true
    } catch (err) {
      console.error('Failed to save notepad:', err)
      setError('Could not save your notepad. Try again.')
      return false
    } finally {
      setSaving(false)
    }
  }, [draft, isMember])

  const runIfNoUnsavedNotes = useCallback((action: () => void) => {
    if (dirtyRef.current) setPendingLeave({ kind: 'action', run: action })
    else action()
  }, [])

  const confirmLeave = useCallback(() => {
    const leave = pendingLeave
    setPendingLeave(null)
    if (!leave) return
    setDraftState(saved)
    if (leave.kind === 'href') {
      skipUnloadPromptRef.current = true
      window.location.assign(leave.href)
    } else {
      leave.run()
    }
  }, [pendingLeave, saved])

  const cancelLeave = useCallback(() => setPendingLeave(null), [])

  const value = useMemo<NotepadContextValue>(
    () => ({
      open,
      toggle,
      draft,
      setDraft,
      dirty,
      loading,
      saving,
      error,
      isMember,
      save,
      clear,
      runIfNoUnsavedNotes,
      pendingLeave,
      confirmLeave,
      cancelLeave,
    }),
    [
      open,
      toggle,
      draft,
      setDraft,
      dirty,
      loading,
      saving,
      error,
      isMember,
      save,
      clear,
      runIfNoUnsavedNotes,
      pendingLeave,
      confirmLeave,
      cancelLeave,
    ]
  )

  return <NotepadContext.Provider value={value}>{children}</NotepadContext.Provider>
}

export function useNotepad(): NotepadContextValue {
  const ctx = useContext(NotepadContext)
  if (!ctx) throw new Error('useNotepad must be used within NotepadProvider')
  return ctx
}
