import { useEffect, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useAiChatUsage } from '../../hooks/useAiChatUsage'
import {
  deleteSavedGeminiKey,
  GEMINI_SAVED_KEY_EVENT,
  GEMINI_STUDIO_KEY_URL,
  hasSavedGeminiKey,
  liveSecretValue,
  saveGeminiKey,
  unlockGeminiKey,
} from '../../lib/geminiKeyVault'
import { askSiteHelp, SITE_HELP_THREAD_STORAGE } from '../../lib/siteHelpBot'
import type { AdvisorChatMessage } from '../../lib/miningAdvisor'
import AiChatUsageMeter from '../ai/AiChatUsageMeter'
import LockPhraseHelpMark from '../ai/LockPhraseHelpMark'
import AppModal from '../layout/AppModal'

const SUGGESTIONS = [
  'How do I get my RSI Handle verified?',
  'What is DFP and how is it calculated?',
  'How do I post something for sale?',
  'What can I do without signing in?',
]

function readThread(): AdvisorChatMessage[] {
  try {
    const raw = sessionStorage.getItem(SITE_HELP_THREAD_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AdvisorChatMessage[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row) => row && (row.role === 'user' || row.role === 'advisor') && row.text)
  } catch {
    return []
  }
}

export default function SiteHelpModal({ onClose }: { onClose: () => void }) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const apiKeyRef = useRef<HTMLInputElement | null>(null)
  const lockPhraseRef = useRef<HTMLInputElement | null>(null)
  const savedCheck = useRef(0)
  const currentPath = useRouterState({ select: (state) => state.location.pathname })

  const [apiKey, setApiKey] = useState('')
  const [lockPhrase, setLockPhrase] = useState('')
  const [sessionKey, setSessionKey] = useState('')
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [keyBusy, setKeyBusy] = useState(false)
  const [messages, setMessages] = useState<AdvisorChatMessage[]>(readThread)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { usage, pushUsage } = useAiChatUsage('site_help', true)

  useEffect(() => {
    try {
      sessionStorage.setItem(SITE_HELP_THREAD_STORAGE, JSON.stringify(messages))
    } catch {
      /* private mode */
    }
  }, [messages])

  // The saved key is shared with the Smart Cracker Advisor, so react to changes
  // made there or in Settings while this is open.
  useEffect(() => {
    const sync = () => {
      const ticket = ++savedCheck.current
      void hasSavedGeminiKey().then((saved) => {
        if (ticket !== savedCheck.current) return
        setHasSavedKey(saved)
        if (!saved) setSessionKey('')
      })
    }
    sync()
    window.addEventListener(GEMINI_SAVED_KEY_EVENT, sync)
    return () => window.removeEventListener(GEMINI_SAVED_KEY_EVENT, sync)
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const hasPastedKey = apiKey.trim().length >= 20
  const unlocked = sessionKey.length >= 20
  const canAsk = unlocked || hasPastedKey

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy || !canAsk) return
    setDraft('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', text }])
    setBusy(true)
    const history = messages.slice(-8)
    const result = await askSiteHelp({
      apiKey: (apiKey.trim() || sessionKey).trim(),
      question: text,
      messages: history,
      currentPath,
    })
    setBusy(false)
    pushUsage(result.usage)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessages((prev) => [...prev, { role: 'advisor', text: result.answer }])
  }

  const removeSavedKey = () => {
    setKeyBusy(true)
    setError(null)
    savedCheck.current += 1
    void deleteSavedGeminiKey().then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setHasSavedKey(false)
      setSessionKey('')
      setApiKey('')
      setLockPhrase('')
      if (apiKeyRef.current) apiKeyRef.current.value = ''
      if (lockPhraseRef.current) lockPhraseRef.current.value = ''
    }).finally(() => setKeyBusy(false))
  }

  const savePastedKey = () => {
    const pasted = liveSecretValue(apiKeyRef.current, apiKey)
    const phrase = liveSecretValue(lockPhraseRef.current, lockPhrase)
    if (pasted.length < 20) {
      setError('Paste your Gemini API key in the first box.')
      return
    }
    if (phrase.length < 10) {
      setError('Choose a lock phrase of at least 10 characters.')
      return
    }
    setApiKey(pasted)
    setLockPhrase(phrase)
    setKeyBusy(true)
    setError(null)
    void saveGeminiKey(pasted, phrase).then((result) => {
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSessionKey(pasted)
      setApiKey('')
      setLockPhrase('')
      if (apiKeyRef.current) apiKeyRef.current.value = ''
      if (lockPhraseRef.current) lockPhraseRef.current.value = ''
      setHasSavedKey(true)
    }).finally(() => setKeyBusy(false))
  }

  return (
    <AppModal
      title="Help"
      subtitle="Ask how anything on this site works"
      onClose={onClose}
      size="lg"
      zIndex={70}
      headerExtra={
        <div className="px-3 sm:px-4 pb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Answers come from the site guide and the lists for what you ask about.</p>
          <AiChatUsageMeter usage={usage} />
        </div>
      }
      footer={
        <div className="space-y-2">
          {error ? <p className="site-error-text">{error}</p> : null}
          <textarea
            className="site-textarea w-full min-h-[3.5rem] text-xs"
            value={draft}
            disabled={!canAsk || busy}
            placeholder={canAsk ? 'Ask how something on this site works.' : 'Add your Gemini key to use Help.'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void ask(draft)
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="site-btn-primary !px-2.5 !py-1 text-xs disabled:opacity-40"
              disabled={!canAsk || busy || !draft.trim()}
              onClick={() => void ask(draft)}
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
            Help explains the site — it cannot change anything for you. For account problems, open a
            Support ticket from your avatar menu.
          </p>
        </div>
      }
    >
      <div className="space-y-3">
        {hasSavedKey && unlocked ? (
          <div className="site-section p-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-300">Saved key unlocked for this visit.</p>
            <button
              type="button"
              className="site-btn-ghost !px-2 !py-1 text-[11px]"
              disabled={keyBusy}
              onClick={removeSavedKey}
            >
              Remove saved key
            </button>
          </div>
        ) : hasSavedKey ? (
          <div className="site-section p-2.5 space-y-2">
            <div className="space-y-1">
              <span className="site-label inline-flex items-center gap-1">
                Lock phrase
                <LockPhraseHelpMark />
              </span>
              <input
                ref={lockPhraseRef}
                type="password"
                name="gemini-lock-phrase"
                autoComplete="new-password"
                onChange={(event) => setLockPhrase(event.target.value)}
                onInput={(event) => setLockPhrase(event.currentTarget.value)}
                className="site-input w-full px-2 py-1.5 text-xs"
                placeholder="Phrase you chose when you saved"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="site-btn-secondary !px-2 !py-1 text-[11px] disabled:opacity-40"
                disabled={keyBusy}
                onClick={() => {
                  const phrase = liveSecretValue(lockPhraseRef.current, lockPhrase)
                  if (phrase.length < 10) {
                    setError('Enter the lock phrase you chose when you saved.')
                    return
                  }
                  setKeyBusy(true)
                  setError(null)
                  void unlockGeminiKey(phrase).then((result) => {
                    if (!result.ok) {
                      setError(result.error)
                      return
                    }
                    setSessionKey(result.advice)
                    setLockPhrase('')
                    if (lockPhraseRef.current) lockPhraseRef.current.value = ''
                  }).finally(() => setKeyBusy(false))
                }}
              >
                Unlock
              </button>
              <button
                type="button"
                className="site-btn-ghost !px-2 !py-1 text-[11px]"
                disabled={keyBusy}
                onClick={removeSavedKey}
              >
                Remove saved key
              </button>
            </div>
            <p className="site-hint">
              Same saved key as the Smart Cracker Advisor. Unlock decrypts on this device.
            </p>
          </div>
        ) : (
          <div className="site-section p-2.5 space-y-2">
            <label className="block space-y-1">
              <span className="site-label">Gemini API key</span>
              <input
                ref={apiKeyRef}
                type="password"
                name="gemini-api-key"
                autoComplete="new-password"
                onChange={(event) => setApiKey(event.target.value)}
                onInput={(event) => setApiKey(event.currentTarget.value)}
                className="site-input w-full px-2 py-1.5 text-xs"
                placeholder="Paste your AI Studio key"
              />
            </label>
            <div className="space-y-1">
              <span className="site-label inline-flex items-center gap-1">
                Lock phrase (optional save)
                <LockPhraseHelpMark />
              </span>
              <input
                ref={lockPhraseRef}
                type="password"
                name="gemini-lock-phrase"
                autoComplete="new-password"
                onChange={(event) => setLockPhrase(event.target.value)}
                onInput={(event) => setLockPhrase(event.currentTarget.value)}
                className="site-input w-full px-2 py-1.5 text-xs"
                placeholder="At least 10 characters — not your Gemini key"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="site-btn-secondary !px-2 !py-1 text-[11px] disabled:opacity-40"
                disabled={keyBusy}
                onClick={savePastedKey}
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
              Help runs on your own Gemini key, the same one the Smart Cracker Advisor uses. Paste it
              each visit, or save a copy encrypted with your lock phrase — only you can unlock it.
            </p>
          </div>
        )}

        <div ref={listRef} className="space-y-2 max-h-[40vh] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 leading-snug">
                Ask about any page, requirement, or workflow on this site.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="site-filter-idle !px-2 !py-1 text-[11px] disabled:opacity-40"
                    disabled={!canAsk || busy}
                    onClick={() => void ask(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
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
      </div>
    </AppModal>
  )
}
