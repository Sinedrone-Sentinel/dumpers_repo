import React, { useEffect, useRef } from 'react'
import { useNotepad } from '../../contexts/NotepadContext'
import { NOTEPAD_MAX_CHARS } from '../../lib/notepadText'

export default function NotepadPanel() {
  const { open, draft, setDraft, dirty, loading, saving, error, isMember, save, clear } =
    useNotepad()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 300)
    return () => window.clearTimeout(id)
  }, [open])

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (dirty && !saving) void save()
    }
  }

  const status = loading
    ? 'Loading…'
    : saving
      ? 'Saving…'
      : dirty
        ? 'Unsaved changes'
        : isMember
          ? 'Saved to your account'
          : 'Saved on this device'

  return (
    <aside
      id="site-notepad-panel"
      aria-label="Notepad"
      aria-hidden={!open}
      inert={!open}
      className={`fixed right-0 z-30 flex flex-col w-[min(28rem,100vw)] border-l border-amber-500/30 bg-slate-950/30 backdrop-blur-[2px] shadow-[-12px_0_32px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
      style={{
        top: 'var(--site-header-height)',
        bottom: 'var(--site-ticker-height, 0px)',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20 bg-black/30">
        <h2 className="text-sm font-semibold tracking-wide text-amber-100">Notepad</h2>
        <span
          className={`text-xs truncate ${dirty ? 'text-amber-300' : 'text-slate-400'}`}
          aria-live="polite"
        >
          {status}
        </span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="site-btn-secondary px-3 py-1 text-xs"
            onClick={clear}
            disabled={loading || saving || draft.length === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className="site-btn-primary px-3 py-1 text-xs"
            onClick={() => void save()}
            disabled={loading || saving || !dirty}
          >
            Save
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={NOTEPAD_MAX_CHARS}
        disabled={loading}
        spellCheck
        placeholder="Jot down anything — coordinates, shopping lists, contract notes…"
        aria-label="Notepad text"
        className="site-textarea flex-1 min-h-0 m-3 mb-1 px-3 py-2 resize-none whitespace-pre-wrap text-sm leading-relaxed bg-black/20"
      />

      <div className="flex items-center justify-between gap-2 px-3 pb-2 text-xs">
        <span className="site-error-text truncate">{error ?? ''}</span>
        <span
          className={`tabular-nums shrink-0 ${draft.length >= NOTEPAD_MAX_CHARS ? 'text-amber-300' : 'text-slate-400'}`}
        >
          {draft.length.toLocaleString()} / {NOTEPAD_MAX_CHARS.toLocaleString()}
        </span>
      </div>
    </aside>
  )
}
