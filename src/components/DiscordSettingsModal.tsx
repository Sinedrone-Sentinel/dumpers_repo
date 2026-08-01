import React, { useState, useEffect } from 'react'
import {
  getDiscordSettings,
  updateDiscordSettings,
  getDiscordQueueStatus,
  clearDiscordQueue,
  getDiscordWebhooks,
  toggleDiscordWebhook,
  deleteDiscordWebhook,
  processDiscordQueue,
  DiscordSettings,
  DiscordWebhook,
  QueueStatus,
} from '../lib/discord'
import { postDumperServicesBotTest } from '../lib/dumperServicesBot'
import AppModal from './layout/AppModal'

export default function DiscordSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<DiscordSettings | null>(null)
  const [webhooks, setWebhooks] = useState<DiscordWebhook[]>([])
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state for official webhook
  const [officialUrl, setOfficialUrl] = useState('')
  const [officialName, setOfficialName] = useState('')
  const [coalesceMinutes, setCoalesceMinutes] = useState('15')
  const [botTestChannelId, setBotTestChannelId] = useState('')
  const [botTestCopyCount, setBotTestCopyCount] = useState('2')
  const [postingBotTest, setPostingBotTest] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    
    const [settingsRes, webhooksRes, statusRes] = await Promise.all([
      getDiscordSettings(),
      getDiscordWebhooks(),
      getDiscordQueueStatus(),
    ])

    if (settingsRes.success && settingsRes.settings) {
      setSettings(settingsRes.settings)
      setOfficialUrl(settingsRes.settings.official_webhook_url || '')
      setOfficialName(settingsRes.settings.official_webhook_name || '')
      setCoalesceMinutes(String(settingsRes.settings.market_coalesce_minutes ?? 15))
    }

    if (webhooksRes.success && webhooksRes.webhooks) {
      setWebhooks(webhooksRes.webhooks)
    }

    if (statusRes.success && statusRes.status) {
      setQueueStatus(statusRes.status)
    }

    setLoading(false)
  }

  const handleToggleSetting = async (key: keyof DiscordSettings) => {
    if (!settings) return
    const current = settings[key]
    if (typeof current !== 'boolean') return

    setSaving(true)
    const newValue = !current
    const result = await updateDiscordSettings({ [key]: newValue })

    if (result.success) {
      setSettings({ ...settings, [key]: newValue })
      setMessage({ type: 'success', text: `${key.replace(/_/g, ' ')} updated` })
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update setting' })
    }
    setSaving(false)
  }

  const handleSaveCoalesceMinutes = async () => {
    if (!settings) return

    const parsed = parseInt(coalesceMinutes, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      setMessage({ type: 'error', text: 'Enter at least 1 minute' })
      return
    }

    setSaving(true)
    const result = await updateDiscordSettings({ market_coalesce_minutes: parsed })

    if (result.success) {
      setSettings({ ...settings, market_coalesce_minutes: parsed })
      setCoalesceMinutes(String(parsed))
      setMessage({ type: 'success', text: 'Coalesce quiet period updated' })
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update setting' })
    }
    setSaving(false)
  }

  const handleSaveOfficialWebhook = async () => {
    setSaving(true)
    const result = await updateDiscordSettings({
      official_webhook_url: officialUrl || undefined,
      official_webhook_name: officialName || undefined,
    })

    if (result.success) {
      setSettings(prev => prev ? {
        ...prev,
        official_webhook_url: officialUrl,
        official_webhook_name: officialName,
      } : null)
      setMessage({ type: 'success', text: 'Official webhook saved' })
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save webhook' })
    }
    setSaving(false)
  }

  const handleProcessQueue = async () => {
    setProcessing(true)
    setMessage(null)

    const result = await processDiscordQueue()

    if (result.success) {
      const deliveryErrors = result.errors?.length
        ? ` Delivery issues: ${result.errors.join('; ')}`
        : ''
      const deliveryNotices = result.notices?.length
        ? ` ${result.notices.join(' ')}`
        : ''
      const noneProcessed =
        (result.processed ?? 0) === 0 && (queueStatus?.pending_count ?? 0) + (queueStatus?.held_count ?? 0) > 0
      const processedButNotSent =
        (result.processed ?? 0) > 0 && (result.sent ?? 0) === 0

      setMessage({
        type: noneProcessed || result.errors?.length || processedButNotSent ? 'error' : 'success',
        text: noneProcessed
          ? `No messages were processed.${deliveryErrors || ' The message may be waiting on coalesce or webhook delivery failed — redeploy send-discord and apply migration 093.'}`
          : processedButNotSent
            ? `Processed ${result.processed} message(s) but sent 0 Discord notifications.${deliveryNotices || deliveryErrors || ' No webhooks matched this event type.'}`
            : `Processed ${result.processed} messages, sent ${result.sent} notifications.${deliveryErrors}${deliveryNotices}`,
      })
      const statusRes = await getDiscordQueueStatus()
      if (statusRes.success && statusRes.status) {
        setQueueStatus(statusRes.status)
      }
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to process queue' })
    }
    setProcessing(false)
  }

  const handleClearQueue = async (onlyProcessed: boolean) => {
    setProcessing(true)
    const result = await clearDiscordQueue(onlyProcessed)

    if (result.success) {
      setMessage({
        type: 'success',
        text: `Cleared ${result.deleted} messages from queue`,
      })
      const statusRes = await getDiscordQueueStatus()
      if (statusRes.success && statusRes.status) {
        setQueueStatus(statusRes.status)
      }
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to clear queue' })
    }
    setProcessing(false)
  }

  const handleToggleWebhook = async (webhook: DiscordWebhook) => {
    const result = await toggleDiscordWebhook(webhook.id, !webhook.active)
    if (result.success) {
      setWebhooks(prev =>
        prev.map(w => (w.id === webhook.id ? { ...w, active: !w.active } : w))
      )
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to toggle webhook' })
    }
  }

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Delete this webhook subscription?')) return

    const result = await deleteDiscordWebhook(webhookId)
    if (result.success) {
      setWebhooks(prev => prev.filter(w => w.id !== webhookId))
      setMessage({ type: 'success', text: 'Webhook deleted' })
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to delete webhook' })
    }
  }

  return (
    <AppModal
      title="Discord Integration"
      subtitle="Manage Discord webhook notifications"
      onClose={onClose}
      size="lg"
      zIndex={70}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Close
        </button>
      }
    >
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-500/50 text-green-400'
              : 'bg-red-900/50 border border-red-500/50 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-t-2 border-indigo-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 mt-2">Loading...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Master Enable Toggle */}
          <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-medium">Discord Integration</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Master switch for all Discord notifications
                </p>
              </div>
              <button
                onClick={() => handleToggleSetting('enabled')}
                disabled={saving}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  settings?.enabled ? 'bg-indigo-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                    settings?.enabled ? 'left-8' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Event Type Toggles */}
          <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/30 space-y-3">
            <h3 className="text-white font-medium text-sm mb-3">Marketplace Feed (global)</h3>

            <div className="pl-2 border-l-2 border-green-500/50 space-y-2">
              <ToggleRow
                label="New WTB / WTS listings"
                description="When anyone posts a new marketplace listing"
                enabled={settings?.order_new_enabled ?? false}
                onToggle={() => handleToggleSetting('order_new_enabled')}
                disabled={saving}
                color="green"
              />
              <ToggleRow
                label="Listing accepted"
                description="When any marketplace listing is accepted"
                enabled={settings?.order_fulfilled_enabled ?? false}
                onToggle={() => handleToggleSetting('order_fulfilled_enabled')}
                disabled={saving}
                color="blue"
              />
              <ToggleRow
                label="Listing cancelled"
                description="When any pending listing is cancelled"
                enabled={settings?.order_cancelled_enabled ?? false}
                onToggle={() => handleToggleSetting('order_cancelled_enabled')}
                disabled={saving}
                color="red"
              />
            </div>

            <div className="pt-3 border-t border-slate-700/50 space-y-2">
              <ToggleRow
                label="Coalesce listing churn"
                description="Group rapid post/cancel bursts from the same member into one ping"
                enabled={settings?.market_coalesce_enabled ?? true}
                onToggle={() => handleToggleSetting('market_coalesce_enabled')}
                disabled={saving}
                color="orange"
              />
              <div className="flex items-center justify-between gap-3 py-1">
                <div>
                  <span className="text-white text-sm">Quiet period (minutes)</span>
                  <p className="text-xs text-slate-500">
                    Wait this long after the last change before sending a grouped ping
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={coalesceMinutes}
                    onChange={(e) => setCoalesceMinutes(e.target.value)}
                    onBlur={() => void handleSaveCoalesceMinutes()}
                    disabled={saving || !(settings?.market_coalesce_enabled ?? true)}
                    className="w-16 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-white text-center disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <ToggleRow
              label="Personal notifications"
              description="Member deal alerts (my_order_* and support replies)"
              enabled={settings?.personal_discord_enabled ?? true}
              onToggle={() => handleToggleSetting('personal_discord_enabled')}
              disabled={saving}
              color="blue"
            />
          </div>

          {/* Org-Only Event Types */}
          <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/10 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-white font-medium text-sm">Org-Only Event Types</h3>
              <span className="px-1.5 py-0.5 bg-purple-900/50 text-purple-400 rounded text-xs">
                Official Webhook Only
              </span>
            </div>
            
            <ToggleRow
              label="Support"
              description="New support tickets"
              enabled={settings?.support_enabled ?? false}
              onToggle={() => handleToggleSetting('support_enabled')}
              disabled={saving}
              color="purple"
            />
            
            <ToggleRow
              label="Admin"
              description="Sync errors, system alerts"
              enabled={settings?.admin_enabled ?? false}
              onToggle={() => handleToggleSetting('admin_enabled')}
              disabled={saving}
              color="red"
            />
          </div>

          {/* Official Org Webhook */}
          <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-3">
            <div>
              <h3 className="text-white font-medium text-sm">Official Org Webhook</h3>
              <p className="text-xs text-slate-400 mt-1">
                This channel receives org-only events (support tickets, admin alerts)
              </p>
            </div>
            <input
              type="text"
              value={officialName}
              onChange={(e) => setOfficialName(e.target.value)}
              placeholder="Channel name (e.g., #bot-alerts)"
              className="w-full px-3 py-2 bg-slate-800 border border-purple-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 text-sm"
            />
            <input
              type="text"
              value={officialUrl}
              onChange={(e) => setOfficialUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full px-3 py-2 bg-slate-800 border border-purple-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 text-sm font-mono text-xs"
            />
            <button
              onClick={handleSaveOfficialWebhook}
              disabled={saving}
              className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Official Webhook'}
            </button>
          </div>

          {/* Queue Status & Actions */}
          <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/20 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-medium text-sm">Message Queue</h3>
                {queueStatus && (
                  <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                    <p>Ready to send: {queueStatus.pending_count}</p>
                    {(queueStatus.held_count ?? 0) > 0 && (
                      <p className="text-amber-300/80">
                        Coalescing: {queueStatus.held_count}
                        {queueStatus.next_held_until && (
                          <> · sends after {new Date(queueStatus.next_held_until).toLocaleString()}</>
                        )}
                      </p>
                    )}
                    <p>Processed today: {queueStatus.processed_today}</p>
                    {queueStatus.oldest_pending && (
                      <p>Oldest ready: {new Date(queueStatus.oldest_pending).toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleProcessQueue}
                  disabled={
                    processing ||
                    ((queueStatus?.pending_count ?? 0) === 0 && (queueStatus?.held_count ?? 0) === 0)
                  }
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {processing ? '...' : 'Process Now'}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleClearQueue(true)}
                disabled={processing}
                className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Clear Processed
              </button>
              <button
                onClick={() => handleClearQueue(false)}
                disabled={processing}
                className="flex-1 px-3 py-1.5 bg-red-600/50 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Clear All
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Marketplace alerts require matching subscriptions on{' '}
              <span className="text-slate-400">/discord-subscribe</span>. Coalesced digests need{' '}
              <span className="text-slate-400">market_wtb_new</span>,{' '}
              <span className="text-slate-400">market_wts_new</span>, or{' '}
              <span className="text-slate-400">market_cancelled</span> — not just{' '}
              <span className="text-slate-400">market_accepted</span>. You never receive Discord for
              your own marketplace posts.
            </p>
          </div>

          {/* Registered Webhooks */}
          <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/30 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium text-sm">Registered Webhooks</h3>
              <span className="text-xs text-slate-500">{webhooks.length} total</span>
            </div>
            
            {webhooks.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No webhooks registered yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className={`p-2 rounded-lg border ${
                      webhook.active
                        ? 'border-slate-600 bg-slate-800/50'
                        : 'border-red-500/30 bg-red-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">
                          {webhook.webhook_name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {webhook.subscribed_events.join(', ')}
                        </p>
                        <p className="text-xs text-slate-600">
                          {webhook.registered_by || 'Anonymous'} •{' '}
                          {new Date(webhook.created_at).toLocaleDateString()}
                          {webhook.failure_count > 0 && (
                            <span className="text-red-400 ml-2">
                              {webhook.failure_count} failures
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleWebhook(webhook)}
                          className={`px-2 py-1 text-xs rounded ${
                            webhook.active
                              ? 'bg-amber-600/50 hover:bg-amber-600 text-amber-200'
                              : 'bg-green-600/50 hover:bg-green-600 text-green-200'
                          }`}
                        >
                          {webhook.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          className="px-2 py-1 text-xs bg-red-600/50 hover:bg-red-600 text-red-200 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Partnership bot smoke test — does not touch personal/market webhooks */}
          <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-orange-200">Dumper Services bot (test)</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Posts Accept-button messages for one harness request. Click Accept on one copy — others
                should flip to Taken. See docs/DUMPER_SERVICES_BOT.md.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={botTestChannelId}
                onChange={(e) => setBotTestChannelId(e.target.value)}
                placeholder="Discord channel ID"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500/50"
              />
              <input
                type="number"
                min={1}
                max={5}
                value={botTestCopyCount}
                onChange={(e) => setBotTestCopyCount(e.target.value)}
                title="Message copies (simulated orgs)"
                className="w-20 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500/50"
              />
              <button
                type="button"
                disabled={postingBotTest || !botTestChannelId.trim()}
                onClick={async () => {
                  setPostingBotTest(true)
                  setMessage(null)
                  const result = await postDumperServicesBotTest({
                    channelId: botTestChannelId,
                    copyCount: Number(botTestCopyCount) || 2,
                    requesterLabel: 'sinedrone_sentinel',
                  })
                  if (result.success) {
                    setMessage({
                      type: 'success',
                      text: `Posted ${result.posted_count} Accept message(s). request ${result.request_id}`,
                    })
                  } else {
                    setMessage({ type: 'error', text: result.error || 'Bot test post failed' })
                  }
                  setPostingBotTest(false)
                }}
                className="shrink-0 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {postingBotTest ? 'Posting…' : 'Post test Accept'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppModal>
  )
}

interface ToggleRowProps {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
  color: 'green' | 'orange' | 'blue' | 'red' | 'purple'
}

function ToggleRow({ label, description, enabled, onToggle, disabled, color }: ToggleRowProps) {
  const colorClasses = {
    green: 'bg-green-600',
    orange: 'bg-orange-600',
    blue: 'bg-blue-600',
    red: 'bg-red-600',
    purple: 'bg-purple-600',
  }

  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <span className="text-white text-sm">{label}</span>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          enabled ? colorClasses[color] : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
            enabled ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}
