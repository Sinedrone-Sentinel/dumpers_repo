import { useEffect, useState } from 'react'
import AppModal from '../layout/AppModal'
import { supabase } from '../../lib/supabase'

interface OrgRow {
  org_sid: string
  is_primary: boolean
}

export interface CitizenIdStats {
  rsi_handle: string | null
  rsi_display_name: string | null
  rsi_citizen_id: string | null
  rsi_spectrum_id: string | null
  enlisted_at: string | null
  account_type: string | null
  cid_verified: boolean
  primary_org_sid: string | null
  orgs: OrgRow[]
  avatar_url: string | null
  citizenid_sub: string | null
  linked_at: string | null
  last_sync_at: string | null
  extra: Record<string, unknown>
}

function formatWhen(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatClaimValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value.trim() || '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    return parts.filter(Boolean).join(', ') || '—'
  }
  return JSON.stringify(value)
}

function humanizeClaimKey(key: string): string {
  const stripped = key.replace(/^urn:user:rsi:/i, '').replace(/^urn:user:/i, '')
  return stripped
    .replace(/[:._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 py-2 site-divider">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-100 break-words">{value}</span>
    </div>
  )
}

export default function CitizenIdStatsModal({
  userId,
  title,
  onClose,
}: {
  userId: string
  title: string
  onClose: () => void
}) {
  const [stats, setStats] = useState<CitizenIdStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void supabase
      .rpc('admin_get_citizenid_stats', { p_user_id: userId })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (rpcError) {
          setError(rpcError.message.replace(/^.*ERROR:\s*/i, '').trim() || 'Could not load Citizen iD stats')
          setStats(null)
          return
        }
        setStats(data as CitizenIdStats)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const orgLine = (stats?.orgs ?? [])
    .map((org) => (org.is_primary ? `${org.org_sid} (primary)` : org.org_sid))
    .join(', ')

  const extraRows = Object.entries(stats?.extra ?? {}).filter(([, value]) => value != null)

  return (
    <AppModal title="Citizen iD" subtitle={title} onClose={onClose} size="md" zIndex={80}>
      {loading ? (
        <p className="text-sm text-slate-400">Loading Citizen iD stats…</p>
      ) : error ? (
        <p className="site-error-text text-sm">{error}</p>
      ) : stats ? (
        <div>
          {stats.avatar_url && (
            <img
              src={stats.avatar_url}
              alt=""
              className="w-16 h-16 rounded-full mb-3"
            />
          )}
          <StatRow label="RSI handle" value={stats.rsi_handle || '—'} />
          <StatRow label="Display name" value={stats.rsi_display_name || '—'} />
          <StatRow label="Citizen number" value={stats.rsi_citizen_id || '—'} />
          <StatRow label="Spectrum ID" value={stats.rsi_spectrum_id || '—'} />
          <StatRow label="Enlisted" value={formatWhen(stats.enlisted_at)} />
          <StatRow label="Account type" value={stats.account_type || '—'} />
          <StatRow label="Citizen iD verified" value={stats.cid_verified ? 'Yes' : 'No'} />
          <StatRow label="Primary organization" value={stats.primary_org_sid || '—'} />
          <StatRow label="Organizations" value={orgLine || '—'} />
          <StatRow label="Citizen iD account" value={stats.citizenid_sub || '—'} />
          <StatRow label="Linked" value={formatWhen(stats.linked_at)} />
          <StatRow label="Last sync" value={formatWhen(stats.last_sync_at)} />
          {extraRows.map(([key, value]) => (
            <StatRow key={key} label={humanizeClaimKey(key)} value={formatClaimValue(value)} />
          ))}
        </div>
      ) : null}
    </AppModal>
  )
}
