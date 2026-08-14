import React, { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import AppModal from '../layout/AppModal'
import CopyFeedbackButton from '../CopyFeedbackButton'
import BpDumperDownloadLinks from './BpDumperDownloadLinks'
import { DUMPER_APPS_DISPLAY_NAME } from '../../config/bpDumper'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

interface BpDumperModalProps {
  onClose: () => void
}

function SetupStepList({ children }: { children: React.ReactNode }) {
  return <ol className="mt-2 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-slate-400">{children}</ol>
}

function SetupHowTo() {
  const [open, setOpen] = useState(false)

  return (
    <div className="site-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-900/50"
        aria-expanded={open}
      >
        <span>
          <span className="text-sm font-semibold text-white">How to set up</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Pick one path — Windows exe or Python scripts (not both)
          </span>
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-slate-700/60 px-4 py-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-amber-300">Option A — Windows exe</h4>
            <p className="text-xs text-slate-500">
              Recommended on Windows. Unsigned — Defender / SmartScreen often block this file (false
              positive).
            </p>
            <SetupStepList>
              <li>
                Under Downloads, get <strong className="text-slate-300">DumperApps.exe</strong>.
              </li>
              <li>
                If Defender or SmartScreen blocks it, that is common for this{' '}
                <strong className="text-slate-300">unsigned</strong> exe. Allow / unblock and run it.
              </li>
              <li>
                Let it <strong className="text-slate-300">auto-detect</strong> Star Citizen (LIVE), or
                paste your LIVE folder path.
              </li>
              <li>
                Copy your <strong className="text-slate-300">API key</strong> from this page and paste
                it when asked.
              </li>
              <li>
                On first run, answer <strong className="text-slate-300">Y</strong> to full history
                import so old log files are scanned.
              </li>
              <li>Leave the window running while you play.</li>
            </SetupStepList>
          </div>

          <div className="space-y-2 border-t border-slate-700/50 pt-5">
            <h4 className="text-sm font-semibold text-sky-300">Option B — Python scripts</h4>
            <p className="text-xs text-slate-500">
              macOS / Linux / advanced Windows. You must install Python first.
            </p>
            <SetupStepList>
              <li>
                Install <strong className="text-slate-300">Python 3.8+</strong> from{' '}
                <a
                  href="https://www.python.org/downloads/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-300 underline hover:text-orange-200"
                >
                  python.org/downloads
                </a>
                . On Windows: check <strong className="text-slate-300">Add python.exe to PATH</strong>,
                then close and reopen the terminal.
              </li>
              <li>
                Confirm it works:{' '}
                <span className="font-mono text-slate-300">python --version</span> and{' '}
                <span className="font-mono text-slate-300">python -m pip --version</span>. Always use{' '}
                <span className="font-mono text-slate-300">python -m pip</span> (not bare{' '}
                <span className="font-mono text-slate-300">pip</span>).
              </li>
              <li>
                Download <strong className="text-slate-300">Python scripts zip</strong> (
                <span className="font-mono text-slate-300">BPDumper-python-scripts.zip</span>) from
                Downloads. Extract it. Confirm the folder has{' '}
                <span className="font-mono text-slate-300">dumper.py</span>,{' '}
                <span className="font-mono text-slate-300">lookup.json</span> (or{' '}
                <span className="font-mono text-slate-300">blueprint-name-lookup.json</span>), and{' '}
                <span className="font-mono text-slate-300">requirements.txt</span>.
              </li>
              <li>
                In that folder:{' '}
                <span className="font-mono text-slate-300">python -m venv .venv</span>
              </li>
              <li>
                Activate — Windows:{' '}
                <span className="font-mono text-slate-300">.venv\Scripts\activate</span> — macOS /
                Linux: <span className="font-mono text-slate-300">source .venv/bin/activate</span>
              </li>
              <li>
                Install deps:{' '}
                <span className="font-mono text-slate-300">python -m pip install -r requirements.txt</span>
              </li>
              <li>
                Copy your <strong className="text-slate-300">API key</strong>, then run{' '}
                <span className="font-mono text-slate-300">python dumper.py --watch</span>. Paste the
                key when asked. Answer <strong className="text-slate-300">Y</strong> to full history
                import on first run.
              </li>
              <li>
                Windows shortcut after steps 1–3: double-click{' '}
                <span className="font-mono text-slate-300">dumper.bat</span> (handles venv + install +
                start). Still paste your API key when asked.
              </li>
              <li>Leave the watcher running while you play.</li>
            </SetupStepList>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BpDumperModal({ onClose }: BpDumperModalProps) {
  const { user, isApproved, isPending } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const canManageApiKey = !!user && isApproved && !isPending

  const loadApiKey = useCallback(async () => {
    setError(null)
    setLoadingKey(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_or_create_api_key')
      if (rpcError) throw rpcError
      if (!data) throw new Error('No API key returned')
      setApiKey(data)
      return data as string
    } catch {
      setError('Failed to load API Key')
      throw new Error('Failed to load API Key')
    } finally {
      setLoadingKey(false)
    }
  }, [])

  useEffect(() => {
    if (!canManageApiKey) return
    void loadApiKey().catch(() => {
      // error state handled in loadApiKey
    })
  }, [canManageApiKey, loadApiKey])

  const copyApiKey = useCallback(async () => {
    const key = apiKey ?? (await loadApiKey())
    await navigator.clipboard.writeText(key)
  }, [apiKey, loadApiKey])

  const regenerateApiKey = useCallback(async () => {
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('regenerate_api_key')
      if (rpcError) throw rpcError
      if (!data) throw new Error('No API key returned')
      setApiKey(data)
      setShowKey(true)
      await navigator.clipboard.writeText(data)
    } catch {
      setError('Failed to regenerate API Key')
      throw new Error('Failed to regenerate API Key')
    }
  }, [])

  return (
    <AppModal
      title={DUMPER_APPS_DISPLAY_NAME}
      subtitle="Windows exe (auto-detect) — finds your Star Citizen install, syncs unlocks, powers Live Mission Tracker."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">What you get</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-400">
            <li>
              <strong className="text-slate-300">Auto-find install</strong> — searches your drives for
              Star Citizen and picks <strong className="text-slate-300">LIVE</strong> (or you can paste a
              path). No manual folder hunt required.
            </li>
            <li>
              <strong className="text-slate-300">Blueprint sync</strong> — reads unlock lines from your
              local <strong className="text-slate-300">Game.log</strong> / logbackups. It does{' '}
              <strong className="text-slate-300">not</strong> pull your craft bench or inventory from CIG
              servers.
            </li>
            <li>
              <strong className="text-slate-300">Full history import</strong> — on first run (default Yes),
              scans all local <code className="text-slate-300">.log</code> files once (including older
              patches) to catch up awards still in those logs. Anything never written to a log you still
              have must be marked manually.
            </li>
            <li>
              <strong className="text-slate-300">Live Mission Tracker</strong> — see active missions and
              what is still in your pool while watch mode runs. Open{' '}
              <Link to="/targets/live" className="text-orange-300 underline hover:text-orange-200">
                Live Mission Tracker
              </Link>{' '}
              while the watcher is running.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Downloads</h3>
          <BpDumperDownloadLinks afterDownloads={<SetupHowTo />} />
        </section>

        <section className="site-surface space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Your API key</h3>
            <p className="text-xs text-slate-500 mt-1">
              Paste this into Dumper Apps when the desktop window asks on first run. One key per account.
            </p>
          </div>

          {canManageApiKey ? (
            <>
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 min-w-0 site-surface px-3 py-2.5 font-mono text-sm text-slate-200 break-all">
                  {loadingKey && !apiKey
                    ? 'Loading…'
                    : showKey && apiKey
                      ? apiKey
                      : apiKey
                        ? '••••••••••••••••••••••••••••••••'
                        : '—'}
                </div>
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="site-btn-secondary shrink-0 px-3 py-2 text-xs font-medium"
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <CopyFeedbackButton label="Copy API Key" onCopy={copyApiKey} disabled={loadingKey} />
                <CopyFeedbackButton
                  label="Regenerate"
                  copiedLabel="Copied!"
                  onCopy={regenerateApiKey}
                  variant="danger"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-200/90">
              {!user
                ? 'Sign in to generate your personal API key.'
                : isPending
                  ? 'Available after your account is approved.'
                  : 'Sign in with a member account to manage your API key.'}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </AppModal>
  )
}
