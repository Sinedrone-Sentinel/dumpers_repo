import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { setAnalyticsSubTool } from '../../lib/analytics'
import {
  askMiningAdvisor,
  deleteMiningAdvisorSavedKey,
  GEMINI_STUDIO_KEY_URL,
  MINING_ADVISOR_KEY_STORAGE,
  MINING_ADVISOR_SAVED_KEY_EVENT,
  MINING_ADVISOR_THREAD_STORAGE,
  MINING_ADVISOR_UI_STORAGE,
  miningAdvisorHasSavedKey,
  saveMiningAdvisorKey,
  unlockMiningAdvisorKey,
  type AdvisorChatMessage,
  type AdvisorHeadSession,
  type AdvisorScanPayload,
} from '../../lib/miningAdvisor'
import { useMiningAdvisorChrome } from './MiningAdvisorChrome'

type DockSide = 'bottom-right' | 'right'

interface AdvisorUiState {
  minimized: boolean
  dock: DockSide
  offsetX: number
  offsetY: number
}

interface MiningAdvisorChatProps {
  rockReady: boolean
  oreName: string | null
  vesselDisplayName: string
  loadout: AdvisorHeadSession[]
  gadgetsInUse: string[]
  scan: AdvisorScanPayload | null
}

const DEFAULT_UI: AdvisorUiState = {
  minimized: true,
  dock: 'bottom-right',
  offsetX: 0,
  offsetY: 0,
}

function forgetStoredKey(): void {
  try {
    localStorage.removeItem(MINING_ADVISOR_KEY_STORAGE)
  } catch {
    /* private mode */
  }
}

function readThread(): AdvisorChatMessage[] {
  try {
    const raw = sessionStorage.getItem(MINING_ADVISOR_THREAD_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AdvisorChatMessage[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row) => row && (row.role === 'user' || row.role === 'advisor') && row.text)
  } catch {
    return []
  }
}

function readUi(): AdvisorUiState {
  try {
    const raw = sessionStorage.getItem(MINING_ADVISOR_UI_STORAGE)
    if (!raw) return DEFAULT_UI
    const parsed = JSON.parse(raw) as Partial<AdvisorUiState>
    return {
      minimized: parsed.minimized !== false,
      dock: parsed.dock === 'right' ? 'right' : 'bottom-right',
      offsetX: Number.isFinite(parsed.offsetX) ? Number(parsed.offsetX) : 0,
      offsetY: Number.isFinite(parsed.offsetY) ? Number(parsed.offsetY) : 0,
    }
  } catch {
    return DEFAULT_UI
  }
}

export default function MiningAdvisorChat({
  rockReady,
  oreName,
  vesselDisplayName,
  loadout,
  gadgetsInUse,
  scan,
}: MiningAdvisorChatProps) {
  const chrome = useMiningAdvisorChrome()
  const titleId = useId()
  const listRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const [apiKey, setApiKey] = useState('')
  const [lockPhrase, setLockPhrase] = useState('')
  const [sessionKey, setSessionKey] = useState('')
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [keyBusy, setKeyBusy] = useState(false)
  const [messages, setMessages] = useState<AdvisorChatMessage[]>(readThread)
  const [ui, setUi] = useState<AdvisorUiState>(readUi)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useScannedInfo, setUseScannedInfo] = useState(rockReady)

  useEffect(() => {
    if (!rockReady) {
      setUseScannedInfo(false)
      return
    }
    setUseScannedInfo(true)
  }, [rockReady])

  useEffect(() => {
    try {
      sessionStorage.setItem(MINING_ADVISOR_THREAD_STORAGE, JSON.stringify(messages))
    } catch {
      /* private mode */
    }
  }, [messages])

  useEffect(() => {
    try {
      sessionStorage.setItem(MINING_ADVISOR_UI_STORAGE, JSON.stringify(ui))
    } catch {
      /* private mode */
    }
  }, [ui])

  useEffect(() => {
    forgetStoredKey()
    const sync = () => {
      void miningAdvisorHasSavedKey().then((saved) => {
        setHasSavedKey(saved)
        if (!saved) setSessionKey('')
      })
    }
    sync()
    window.addEventListener(MINING_ADVISOR_SAVED_KEY_EVENT, sync)
    return () => window.removeEventListener(MINING_ADVISOR_SAVED_KEY_EVENT, sync)
  }, [])

  useEffect(() => {
    if (ui.minimized) return
    setAnalyticsSubTool('smart_cracker_advisor')
    return () => setAnalyticsSubTool('smart_cracker')
  }, [ui.minimized])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, busy, ui.minimized])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setUi((prev) => ({
        ...prev,
        offsetX: drag.ox + (event.clientX - drag.x),
        offsetY: drag.oy + (event.clientY - drag.y),
      }))
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const hasPastedKey = apiKey.trim().length >= 20
  const unlocked = sessionKey.length >= 20
  const canAsk = unlocked || hasPastedKey
  const placeholder = oreName
    ? `Ask for a ${oreName} loadout, or turn on Use scanned info for this rock.`
    : 'Ask for a Quantainium loadout, or turn on Use scanned info for this rock.'

  const panelStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      pointerEvents: 'auto',
      transform: `translate(${ui.offsetX}px, ${ui.offsetY}px)`,
    }
    if (ui.dock === 'right') {
      return { ...base, top: 72, right: 12, bottom: 12, width: 'min(22rem, 46%)' }
    }
    return { ...base, right: 12, bottom: 12, width: 'min(22rem, 92%)', height: 'min(26rem, 70%)' }
  }, [ui.dock, ui.offsetX, ui.offsetY])

  const sendQuestion = async () => {
    const question = draft.trim()
    if (!question || busy || !canAsk) return
    setDraft('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setBusy(true)
    const history = messages.slice(-8)
    const result = await askMiningAdvisor({
      apiKey: (apiKey.trim() || sessionKey).trim(),
      question,
      messages: history,
      useScannedInfo: useScannedInfo && rockReady,
      vesselDisplayName,
      loadout,
      gadgetsInUse,
      oreName,
      scan: useScannedInfo && rockReady ? scan : null,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessages((prev) => [...prev, { role: 'advisor', text: result.advice }])
  }

  const headerChip = (
    <button
      type="button"
      onClick={() => setUi((prev) => ({ ...prev, minimized: false }))}
      className="site-btn-secondary !px-2.5 !py-1 text-[11px]"
    >
      Advisor
    </button>
  )

  const overlay = ui.minimized || !chrome?.overlaySlot ? null : (
    <section
        className="site-surface-solid absolute flex flex-col"
        style={panelStyle}
        aria-labelledby={titleId}
      >
        <header
          className="flex items-center gap-2 px-2.5 py-2 border-b border-orange-500/15 cursor-grab active:cursor-grabbing"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button, input, label, a')) return
            dragRef.current = {
              x: event.clientX,
              y: event.clientY,
              ox: ui.offsetX,
              oy: ui.offsetY,
            }
          }}
        >
          <h3 id={titleId} className="text-xs font-semibold text-amber-50 min-w-0 flex-1">
            Advisor
          </h3>
          <button
            type="button"
            className="site-btn-ghost !px-1.5 !py-0.5 text-[10px]"
            onClick={() =>
              setUi((prev) => ({
                ...prev,
                dock: prev.dock === 'right' ? 'bottom-right' : 'right',
                offsetX: 0,
                offsetY: 0,
              }))
            }
          >
            {ui.dock === 'right' ? 'Dock low' : 'Dock right'}
          </button>
          <button
            type="button"
            className="site-btn-icon w-7 h-7 text-sm"
            aria-label="Minimize Advisor"
            onClick={() => setUi((prev) => ({ ...prev, minimized: true }))}
          >
            –
          </button>
        </header>

        <div className="px-2.5 py-2 space-y-2 border-b border-orange-500/10">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 site-checkbox"
              checked={useScannedInfo && rockReady}
              disabled={!rockReady}
              onChange={(event) => setUseScannedInfo(event.target.checked)}
            />
            <span className="text-[11px] text-slate-400 leading-snug">
              <span className="text-slate-200">Use scanned info</span>
              {rockReady
                ? ' — advise for this rock’s mass, resistance, and instability. Off: ideas for this resource without using that scan.'
                : ' — enter mass and resistance in the Rock Calculator to enable.'}
            </span>
          </label>

          {hasSavedKey && unlocked ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-300">Saved key unlocked for this visit.</p>
              <button
                type="button"
                className="site-btn-ghost !px-2 !py-1 text-[11px]"
                disabled={keyBusy}
                onClick={() => {
                  setKeyBusy(true)
                  setError(null)
                  void deleteMiningAdvisorSavedKey().then((result) => {
                    setKeyBusy(false)
                    if (!result.ok) {
                      setError(result.error)
                      return
                    }
                    setHasSavedKey(false)
                    setSessionKey('')
                  })
                }}
              >
                Remove saved key
              </button>
            </div>
          ) : hasSavedKey ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="site-label">Lock phrase</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={lockPhrase}
                  onChange={(event) => setLockPhrase(event.target.value)}
                  className="site-input w-full px-2 py-1.5 text-xs"
                  placeholder="Phrase you chose when you saved"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="site-btn-secondary !px-2 !py-1 text-[11px] disabled:opacity-40"
                  disabled={lockPhrase.trim().length < 10 || keyBusy}
                  onClick={() => {
                    setKeyBusy(true)
                    setError(null)
                    void unlockMiningAdvisorKey(lockPhrase).then((result) => {
                      setKeyBusy(false)
                      if (!result.ok) {
                        setError(result.error)
                        return
                      }
                      setSessionKey(result.advice)
                      setLockPhrase('')
                    })
                  }}
                >
                  Unlock
                </button>
                <button
                  type="button"
                  className="site-btn-ghost !px-2 !py-1 text-[11px]"
                  disabled={keyBusy}
                  onClick={() => {
                    setKeyBusy(true)
                    setError(null)
                    void deleteMiningAdvisorSavedKey().then((result) => {
                      setKeyBusy(false)
                      if (!result.ok) {
                        setError(result.error)
                        return
                      }
                      setHasSavedKey(false)
                      setSessionKey('')
                    })
                  }}
                >
                  Remove saved key
                </button>
              </div>
              <p className="site-hint">
                Unlock decrypts on this device. We never store the Gemini key in cleartext.
              </p>
            </div>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="site-label">Gemini API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="site-input w-full px-2 py-1.5 text-xs"
                  placeholder="Paste your AI Studio key"
                />
              </label>
              <label className="block space-y-1">
                <span className="site-label">Lock phrase (optional save)</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={lockPhrase}
                  onChange={(event) => setLockPhrase(event.target.value)}
                  className="site-input w-full px-2 py-1.5 text-xs"
                  placeholder="At least 10 characters — not your Gemini key"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="site-btn-secondary !px-2 !py-1 text-[11px] disabled:opacity-40"
                  disabled={!hasPastedKey || lockPhrase.trim().length < 10 || keyBusy}
                  onClick={() => {
                    const pasted = apiKey.trim()
                    setKeyBusy(true)
                    setError(null)
                    void saveMiningAdvisorKey(pasted, lockPhrase).then((result) => {
                      setKeyBusy(false)
                      if (!result.ok) {
                        setError(result.error)
                        return
                      }
                      setSessionKey(pasted)
                      setApiKey('')
                      setLockPhrase('')
                      setHasSavedKey(true)
                    })
                  }}
                >
                  Save to my profile
                </button>
                <a
                  href={GEMINI_STUDIO_KEY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-400 hover:text-sky-300"
                >
                  Get a free key
                </a>
              </div>
              <p className="site-hint">
                Paste each visit, or save a copy encrypted with your lock phrase. Only you can unlock
                it. Free-tier chats may be used by Google to improve their products. Limited to 20
                questions per hour on this site.
              </p>
            </>
          )}
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-2">
          {messages.length === 0 ? (
            <p className="text-[11px] text-slate-500 leading-snug">
              Ask how to kit this ship for the resource in the calculator. Advice only — it does not
              change your loadout.
            </p>
          ) : null}
          {messages.map((msg, index) => (
            <div
              key={index}
              className={
                msg.role === 'user'
                  ? 'ml-6 rounded-md bg-orange-950/40 px-2 py-1.5 text-xs text-amber-50 whitespace-pre-wrap'
                  : 'mr-6 rounded-md bg-slate-900/70 px-2 py-1.5 text-xs text-slate-200 whitespace-pre-wrap'
              }
            >
              {msg.text}
            </div>
          ))}
          {busy ? <p className="text-[11px] text-slate-500">Thinking…</p> : null}
        </div>

        <div className="px-2.5 py-2 space-y-2 border-t border-orange-500/10">
          {error ? <p className="site-error-text">{error}</p> : null}
          <textarea
            className="site-textarea w-full min-h-[4.5rem] text-xs"
            value={draft}
            disabled={!canAsk || busy}
            placeholder={canAsk ? placeholder : 'Add your Gemini key to use Advisor.'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendQuestion()
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="site-btn-primary !px-2.5 !py-1 text-xs disabled:opacity-40"
              disabled={!canAsk || busy || !draft.trim()}
              onClick={() => void sendQuestion()}
            >
              Send
            </button>
            <button
              type="button"
              className="site-btn-ghost !px-2 !py-1 text-[11px]"
              onClick={() => {
                setMessages([])
                setError(null)
              }}
            >
              Clear chat
            </button>
          </div>
          <p className="site-hint">
            Advice only — it does not change your loadout. Check the cards before you Save.
          </p>
        </div>
      </section>
  )

  if (!chrome) return null

  return (
    <>
      {ui.minimized && chrome.headerSlot ? createPortal(headerChip, chrome.headerSlot) : null}
      {overlay && chrome.overlaySlot ? createPortal(overlay, chrome.overlaySlot) : null}
    </>
  )
}
