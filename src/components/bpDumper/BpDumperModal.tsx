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
      subtitle="Desktop tools: blueprint log sync, live missions, and rock-scan OCR on this PC."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-white">What it does</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            <strong className="text-slate-300">BP Dumper</strong> watches your game log while you play
            and sends newly acquired blueprints to your account. The{' '}
            <strong className="text-slate-300">Rock Scan</strong> tray (Windows) runs a localhost bridge
            so signed-in members can click <strong className="text-slate-300">OCR</strong> on the Rock
            Calculator. Download the desktop build or Python kit and connect with your personal API key.
          </p>
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
          <h3 className="text-sm font-semibold text-white">Setup</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-400">
            <li>Download the build for your platform (or the Python zip).</li>
            <li>Copy your API key below and paste it when the dumper asks on first run.</li>
            <li>Run BP Dumper in watch mode — it imports old logs once, then watches for new unlocks.</li>
            <li>On Windows, the DR tray icon also serves Rock Calculator OCR (calibrate RESULTS panel once).</li>
          </ol>
        </section>

        <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Your API key</h3>
            <p className="text-xs text-slate-500 mt-1">
              Works with Dumper desktop tools. Paste this into BP Dumper on first run.
            </p>
          </div>

          {canManageApiKey ? (
            <>
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5 font-mono text-sm text-slate-200 break-all">
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
                    className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
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
