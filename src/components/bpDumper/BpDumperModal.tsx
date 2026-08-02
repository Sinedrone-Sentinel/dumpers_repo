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
      subtitle="Windows desktop app — syncs blueprint unlocks and powers Live Mission Tracker."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">What you get</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-400">
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

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">How to set up (Windows)</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-400">
            <li>
              Under <strong className="text-slate-300">Downloads</strong>, get{' '}
              <strong className="text-slate-300">Windows portable exe</strong> and run it. A console
              window opens for blueprint sync.
            </li>
            <li>
              Copy your <strong className="text-slate-300">API key</strong> below, then paste it when the
              black window asks for it on first run. Accept the one-time{' '}
              <strong className="text-slate-300">full history import</strong> if you want to catch up from
              existing logbackups (can take a while if those folders are large).
            </li>
            <li>
              Leave the window open while playing — new unlocks from the live Game.log sync
              automatically after that.
            </li>
          </ol>
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
