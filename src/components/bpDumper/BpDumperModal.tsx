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
      subtitle="Classic Windows exe (auto-detect) — finds your Star Citizen install, syncs unlocks, powers Live Mission Tracker."
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
              what is still in your pool while watch mode runs.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Downloads</h3>
          <BpDumperDownloadLinks />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Live Mission Tracker</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            While BP Dumper watches your game log, open the{' '}
            <Link to="/targets/live" className="text-orange-300 hover:text-orange-200 underline">
              Live Mission Tracker
            </Link>{' '}
            page to see active in-game missions and pool blueprints you still need to acquire.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white">How to set up</h3>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Path A — Windows exe (no Python)
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-400">
              <li>
                Under <strong className="text-slate-300">Downloads</strong>, download{' '}
                <strong className="text-slate-300">DumperApps.exe</strong>.
              </li>
              <li>Run the exe. Let it auto-detect Star Citizen (LIVE), or paste your LIVE folder path.</li>
              <li>
                Copy your <strong className="text-slate-300">API key</strong> from below and paste it when
                asked.
              </li>
              <li>
                On first run, answer <strong className="text-slate-300">Y</strong> to full history import
                so old log files are scanned.
              </li>
              <li>Leave the window running while you play.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Path B — Python scripts (macOS / Linux / Windows scripts)
            </h4>
            <p className="text-sm text-slate-400">
              You <strong className="text-slate-300">must install Python</strong> before these scripts will
              run.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-400">
              <li>
                Install <strong className="text-slate-300">Python 3.8 or newer</strong> from{' '}
                <a
                  href="https://www.python.org/downloads/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-300 hover:text-orange-200 underline"
                >
                  https://www.python.org/downloads/
                </a>
                . On Windows: check{' '}
                <strong className="text-slate-300">Add python.exe to PATH</strong>, finish install, then{' '}
                <strong className="text-slate-300">close and reopen</strong> Command Prompt.
              </li>
              <li>
                Confirm Python works. In a new terminal run{' '}
                <span className="font-mono text-slate-300">python --version</span> then{' '}
                <span className="font-mono text-slate-300">python -m pip --version</span>. Both must print a
                version. Always use <span className="font-mono text-slate-300">python -m pip</span> (do not
                rely on bare <span className="font-mono text-slate-300">pip</span>).
              </li>
              <li>
                Under <strong className="text-slate-300">Downloads</strong>, download{' '}
                <strong className="text-slate-300">Python scripts zip</strong> (
                <span className="font-mono text-slate-300">BPDumper-python-scripts.zip</span>). Extract the
                zip to a folder on your PC. That folder must contain{' '}
                <span className="font-mono text-slate-300">dumper.py</span>,{' '}
                <span className="font-mono text-slate-300">lookup.json</span> (or{' '}
                <span className="font-mono text-slate-300">blueprint-name-lookup.json</span>), and{' '}
                <span className="font-mono text-slate-300">requirements.txt</span>.
              </li>
              <li>
                Open a terminal in that extracted folder. Create a virtual environment:{' '}
                <span className="font-mono text-slate-300">python -m venv .venv</span>
              </li>
              <li>
                Activate it — Windows:{' '}
                <span className="font-mono text-slate-300">.venv\Scripts\activate</span> — macOS / Linux:{' '}
                <span className="font-mono text-slate-300">source .venv/bin/activate</span>
              </li>
              <li>
                Install dependencies:{' '}
                <span className="font-mono text-slate-300">python -m pip install -r requirements.txt</span>
              </li>
              <li>
                Copy your <strong className="text-slate-300">API key</strong> from below, then run{' '}
                <span className="font-mono text-slate-300">python dumper.py --watch</span>. Paste the key
                when asked. On first run answer <strong className="text-slate-300">Y</strong> to full
                history import.
              </li>
              <li>
                On Windows you can instead double-click{' '}
                <span className="font-mono text-slate-300">dumper.bat</span> in the extracted folder (it
                runs the venv + install + start steps for you). Still paste your API key when asked.
              </li>
              <li>Leave the watcher running while you play.</li>
            </ol>
          </div>
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
