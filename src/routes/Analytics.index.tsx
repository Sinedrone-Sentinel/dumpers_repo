import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import {
  ANALYTICS_SUB_TOOL_LABELS,
  ANALYTICS_TOOL_LABELS,
  formatAnalyticsDuration,
} from '../lib/analytics'

type DailyVisitorRow = {
  date: string
  count: number
  guest_count: number
  signed_in_count: number
}

type ToolUsageRow = {
  tool_id: string
  sub_tool_id: string
  is_guest: boolean
  unique_visitors: number
  total_seconds: number
  avg_seconds: number
}

type GeoCountryRow = {
  country_code: string
  country_name: string
  unique_visitors: number
  guest_visitors: number
  signed_in_visitors: number
}

type GeoRegionRow = GeoCountryRow & {
  region: string
}

type GeoCityRow = GeoRegionRow & {
  city: string
}

type AnalyticsSummary = {
  period_days: number
  dau_today: number
  dau_guest_today: number
  dau_signed_in_today: number
  wau: number
  wau_guest: number
  wau_signed_in: number
  mau: number
  guest_mau: number
  signed_in_mau: number
  geo_known_visitors?: number
  geo_known_guest_visitors?: number
  geo_known_signed_in_visitors?: number
  geo_unknown_visitors?: number
  geo_unknown_guest_visitors?: number
  geo_unknown_signed_in_visitors?: number
  daily_visitors: DailyVisitorRow[]
  geo_countries?: GeoCountryRow[]
  geo_regions?: GeoRegionRow[]
  geo_cities?: GeoCityRow[]
  tool_usage: ToolUsageRow[]
}

type AudienceFilter = 'all' | 'guest' | 'signed_in'

type DumperTopUser = {
  user_id: string
  label: string
  invokes: number
}

type DumperUsageSummary = {
  period_days: number
  keys_issued: number
  keys_ever_used: number
  active_users: number
  watch_active_now: number
  total_invokes: number
  avg_invokes_per_active_user: number
  avg_invokes_per_day: number
  projected_monthly_invokes: number
  est_watch_hours: number
  top_users: DumperTopUser[]
}

const PERIOD_OPTIONS = [7, 30, 90] as const

const AUDIENCE_OPTIONS: { id: AudienceFilter; label: string; hint: string }[] = [
  { id: 'all', label: 'Combined', hint: 'Unique visitors across both audiences (may overlap same browser)' },
  { id: 'guest', label: 'Offline / Guest', hint: 'Offline Mode and other anonymous browser sessions' },
  { id: 'signed_in', label: 'Signed in', hint: 'Authenticated member sessions only' },
]

function formatToolLabel(toolId: string, subToolId: string): string {
  const tool = ANALYTICS_TOOL_LABELS[toolId] ?? toolId
  if (!subToolId) return tool
  const sub = ANALYTICS_SUB_TOOL_LABELS[subToolId] ?? subToolId
  return `${tool} · ${sub}`
}

function audienceMatches(rowIsGuest: boolean, audience: AudienceFilter): boolean {
  if (audience === 'all') return true
  if (audience === 'guest') return rowIsGuest
  return !rowIsGuest
}

function geoVisitorCount(
  row: Pick<GeoCountryRow, 'unique_visitors' | 'guest_visitors' | 'signed_in_visitors'>,
  audience: AudienceFilter
): number {
  if (audience === 'guest') return row.guest_visitors ?? 0
  if (audience === 'signed_in') return row.signed_in_visitors ?? 0
  return row.unique_visitors ?? 0
}

function formatGeoLocation(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' · ')
}

function aggregateToolUsage(rows: ToolUsageRow[], audience: AudienceFilter): ToolUsageRow[] {
  const map = new Map<string, ToolUsageRow>()

  for (const row of rows) {
    if (!audienceMatches(row.is_guest, audience)) continue

    const key = `${row.tool_id}:${row.sub_tool_id}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        tool_id: row.tool_id,
        sub_tool_id: row.sub_tool_id,
        is_guest: audience === 'guest',
        unique_visitors: row.unique_visitors,
        total_seconds: row.total_seconds,
        avg_seconds: row.avg_seconds,
      })
      continue
    }

    existing.unique_visitors += row.unique_visitors
    existing.total_seconds += row.total_seconds
    existing.avg_seconds =
      existing.unique_visitors > 0
        ? Math.round(existing.total_seconds / existing.unique_visitors)
        : 0
  }

  return [...map.values()].sort(
    (a, b) => b.total_seconds - a.total_seconds || a.tool_id.localeCompare(b.tool_id)
  )
}

export default function AnalyticsRoute() {
  const { isSuperAdmin } = useAuth()
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [audience, setAudience] = useState<AudienceFilter>('all')
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [dumperUsage, setDumperUsage] = useState<DumperUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [siteRes, dumperRes] = await Promise.all([
        supabase.rpc('get_site_analytics_summary', { p_days: periodDays }),
        supabase.rpc('get_dumper_usage_summary', { p_days: periodDays }),
      ])
      if (siteRes.error) throw siteRes.error
      const raw = siteRes.data as AnalyticsSummary
      setSummary({
        ...raw,
        daily_visitors: (raw.daily_visitors ?? []).map((row) => ({
          ...row,
          guest_count: row.guest_count ?? 0,
          signed_in_count: row.signed_in_count ?? 0,
        })),
        tool_usage: (raw.tool_usage ?? []).map((row) => ({
          ...row,
          is_guest: row.is_guest ?? true,
        })),
        geo_countries: raw.geo_countries ?? [],
        geo_regions: raw.geo_regions ?? [],
        geo_cities: raw.geo_cities ?? [],
      })

      if (dumperRes.error) {
        // Site analytics can still render if migration 145 is not applied yet.
        setDumperUsage(null)
        if (!dumperRes.error.message.includes('get_dumper_usage_summary')) {
          console.warn('get_dumper_usage_summary:', dumperRes.error.message)
        }
      } else {
        const dumper = dumperRes.data as DumperUsageSummary
        setDumperUsage({
          ...dumper,
          top_users: dumper.top_users ?? [],
        })
      }
    } catch (err) {
      setSummary(null)
      setDumperUsage(null)
      setError((err as Error).message)
    }

    setLoading(false)
  }, [periodDays])

  useEffect(() => {
    if (isSuperAdmin) void loadSummary()
  }, [isSuperAdmin, loadSummary])

  const filteredDailyVisitors = useMemo(() => {
    if (!summary?.daily_visitors?.length) return []

    return summary.daily_visitors.map((row) => {
      if (audience === 'guest') {
        return { ...row, count: row.guest_count ?? 0 }
      }
      if (audience === 'signed_in') {
        return { ...row, count: row.signed_in_count ?? 0 }
      }
      return row
    })
  }, [summary, audience])

  const filteredToolUsage = useMemo(() => {
    if (!summary?.tool_usage?.length) return []
    return aggregateToolUsage(summary.tool_usage, audience)
  }, [summary, audience])

  const filteredGeoCountries = useMemo(() => {
    if (!summary?.geo_countries?.length) return []
    return [...summary.geo_countries]
      .map((row) => ({ ...row, count: geoVisitorCount(row, audience) }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [summary, audience])

  const filteredGeoRegions = useMemo(() => {
    if (!summary?.geo_regions?.length) return []
    return [...summary.geo_regions]
      .map((row) => ({ ...row, count: geoVisitorCount(row, audience) }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
  }, [summary, audience])

  const filteredGeoCities = useMemo(() => {
    if (!summary?.geo_cities?.length) return []
    return [...summary.geo_cities]
      .map((row) => ({ ...row, count: geoVisitorCount(row, audience) }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
  }, [summary, audience])

  const maxGeoCountryCount = useMemo(() => {
    if (!filteredGeoCountries.length) return 1
    return Math.max(...filteredGeoCountries.map((row) => row.count), 1)
  }, [filteredGeoCountries])

  const geoStatCards = useMemo(() => {
    if (!summary) return { known: 0, unknown: 0 }

    if (audience === 'guest') {
      return {
        known: summary.geo_known_guest_visitors ?? 0,
        unknown: summary.geo_unknown_guest_visitors ?? 0,
      }
    }

    if (audience === 'signed_in') {
      return {
        known: summary.geo_known_signed_in_visitors ?? 0,
        unknown: summary.geo_unknown_signed_in_visitors ?? 0,
      }
    }

    return {
      known: summary.geo_known_visitors ?? 0,
      unknown: summary.geo_unknown_visitors ?? 0,
    }
  }, [summary, audience])

  const maxDailyCount = useMemo(() => {
    if (!filteredDailyVisitors.length) return 1
    return Math.max(...filteredDailyVisitors.map((row) => row.count), 1)
  }, [filteredDailyVisitors])

  const maxDailySplitCount = useMemo(() => {
    if (!summary?.daily_visitors?.length) return 1
    return Math.max(
      ...summary.daily_visitors.flatMap((row) => [
        row.guest_count ?? 0,
        row.signed_in_count ?? 0,
      ]),
      1
    )
  }, [summary])

  const statCards = useMemo(() => {
    if (!summary) return []

    if (audience === 'guest') {
      return [
        { label: 'Today (guest DAU)', value: summary.dau_guest_today ?? 0 },
        { label: 'Last 7 days (guest WAU)', value: summary.wau_guest ?? 0 },
        { label: 'Last 30 days (guest MAU)', value: summary.guest_mau ?? 0 },
      ]
    }

    if (audience === 'signed_in') {
      return [
        { label: 'Today (signed-in DAU)', value: summary.dau_signed_in_today ?? 0 },
        { label: 'Last 7 days (signed-in WAU)', value: summary.wau_signed_in ?? 0 },
        { label: 'Last 30 days (signed-in MAU)', value: summary.signed_in_mau ?? 0 },
      ]
    }

    return [
      { label: 'Today (combined DAU)', value: summary.dau_today },
      { label: 'Last 7 days (combined WAU)', value: summary.wau },
      { label: 'Last 30 days (combined MAU)', value: summary.mau },
      { label: 'Guest MAU', value: summary.guest_mau ?? 0 },
      { label: 'Signed-in MAU', value: summary.signed_in_mau ?? 0 },
    ]
  }, [summary, audience])

  const audienceHint = AUDIENCE_OPTIONS.find((option) => option.id === audience)?.hint ?? ''

  if (!isSuperAdmin) {
    return (
      <FeaturePageLayout title="Site Analytics" subtitle="Super-admin access required">
        <p className="text-slate-400">You do not have permission to view site analytics.</p>
      </FeaturePageLayout>
    )
  }

  return (
    <FeaturePageLayout
      title="Site Analytics"
      subtitle="Unique visitors and active time per tool, split by Offline / Guest vs signed-in"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setPeriodDays(days)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                periodDays === days
                  ? 'site-filter-selected-orange border-orange-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-white'
              }`}
            >
              {days}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg"
          >
            Refresh
          </button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {AUDIENCE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setAudience(option.id)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              audience === option.id
                ? option.id === 'guest'
                  ? 'site-filter-selected-amber border-amber-500/40'
                  : option.id === 'signed_in'
                    ? 'site-filter-selected-green border-green-500/40'
                    : 'site-filter-selected-orange border-orange-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {audienceHint && (
        <p className="mb-4 text-xs text-slate-500">{audienceHint}</p>
      )}

      {loading && (
        <p className="text-slate-400 py-8 text-center">Loading analytics…</p>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {error}
          {error.includes('get_site_analytics_summary') && (
            <p className="mt-2 text-red-200/80">
              Run migrations{' '}
              <code className="text-red-100">102_site_analytics.sql</code>,{' '}
              <code className="text-red-100">105_analytics_audience_split.sql</code>, and{' '}
              <code className="text-red-100">106_analytics_geo.sql</code> in Supabase, then deploy the{' '}
              <code className="text-red-100">record-analytics-ping</code> edge function.
            </p>
          )}
        </div>
      )}

      {!loading && summary && (
        <div className="space-y-6">
          <div
            className={`grid gap-3 ${
              statCards.length >= 5
                ? 'grid-cols-2 lg:grid-cols-5'
                : 'grid-cols-1 sm:grid-cols-3'
            }`}
          >
            {statCards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} />
            ))}
          </div>

          <section className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              BP Dumper Edge usage ({periodDays} days)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Counts accepted <code className="text-slate-400">log-watcher-webhook</code> calls
              (watch pings, blueprint events, etc.). Rolling 30-day window — older daily rows are
              purged once per day by cron. Useful for Free-tier Edge planning (~500k Edge invocations /
              month). This section never looks back more than 30 days.
            </p>
            {!dumperUsage ? (
              <p className="text-sm text-slate-500">
                No Dumper usage data yet. Apply migration{' '}
                <code className="text-slate-400">145_dumper_invoke_analytics.sql</code> and redeploy{' '}
                <code className="text-slate-400">log-watcher-webhook</code>.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="API keys issued" value={dumperUsage.keys_issued} />
                  <StatCard label="Active Dumpers (period)" value={dumperUsage.active_users} />
                  <StatCard label="Watching now" value={dumperUsage.watch_active_now} />
                  <StatCard label="Keys ever used" value={dumperUsage.keys_ever_used} />
                  <StatCard label="Edge invokes (period)" value={dumperUsage.total_invokes} />
                  <StatCard
                    label="Avg invokes / active Dumper"
                    value={Number(dumperUsage.avg_invokes_per_active_user ?? 0)}
                  />
                  <StatCard
                    label="Avg invokes / day"
                    value={Number(dumperUsage.avg_invokes_per_day ?? 0)}
                  />
                  <StatCard
                    label="Projected monthly Edge"
                    value={Number(dumperUsage.projected_monthly_invokes ?? 0)}
                  />
                  <StatCard
                    label="Est. watch-hours (period)"
                    value={Number(dumperUsage.est_watch_hours ?? 0)}
                  />
                </div>
                {dumperUsage.top_users.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Top Dumpers by Edge invokes
                    </h3>
                    <div className="space-y-2">
                      {dumperUsage.top_users.map((row) => (
                        <GeoBarRow
                          key={row.user_id}
                          label={row.label}
                          count={Number(row.invokes)}
                          maxCount={Number(dumperUsage.top_users[0]?.invokes ?? 1)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              Daily unique visitors ({summary.period_days} days)
            </h2>
            {audience === 'all' && (
              <p className="text-xs text-slate-500 mb-4">
                Stacked bars: amber = Offline / Guest, green = signed in. Totals may overlap when
                the same browser used both modes on one day.
              </p>
            )}
            {filteredDailyVisitors.length === 0 ? (
              <p className="text-sm text-slate-500">No visitor data yet.</p>
            ) : audience === 'all' ? (
              <div className="space-y-2">
                {summary.daily_visitors.map((row) => (
                  <DailyVisitorStackedBar
                    key={row.date}
                    row={row}
                    maxCount={maxDailySplitCount}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDailyVisitors.map((row) => (
                  <div key={row.date} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-slate-500 tabular-nums">{row.date}</span>
                    <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
                      <div
                        className={`h-full rounded ${
                          audience === 'guest' ? 'bg-amber-500/70' : 'bg-green-500/70'
                        }`}
                        style={{ width: `${Math.max(4, (row.count / maxDailyCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-slate-300 tabular-nums">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              Geography ({summary.period_days} days)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Approximate location from IP via server-side lookup (country / region / city). VPNs,
              mobile networks, and corporate proxies can skew results. Raw IP addresses are not stored.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <StatCard label="Visitors with location" value={geoStatCards.known} />
              <StatCard label="Visitors without location" value={geoStatCards.unknown} />
            </div>

            {filteredGeoCountries.length === 0 ? (
              <p className="text-sm text-slate-500">
                No geography data yet. Deploy migration 106 and the record-analytics-ping edge function,
                then wait for new sessions.
              </p>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Countries
                  </h3>
                  <div className="space-y-2">
                    {filteredGeoCountries.map((row) => (
                      <GeoBarRow
                        key={row.country_code}
                        label={`${row.country_name} (${row.country_code})`}
                        count={row.count}
                        maxCount={maxGeoCountryCount}
                      />
                    ))}
                  </div>
                </div>

                {filteredGeoRegions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Top regions
                    </h3>
                    <div className="space-y-2">
                      {filteredGeoRegions.map((row) => (
                        <GeoBarRow
                          key={`${row.country_code}:${row.region}`}
                          label={formatGeoLocation([row.country_name, row.region])}
                          count={row.count}
                          maxCount={filteredGeoRegions[0]?.count ?? 1}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filteredGeoCities.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Top cities
                    </h3>
                    <div className="space-y-2">
                      {filteredGeoCities.map((row) => (
                        <GeoBarRow
                          key={`${row.country_code}:${row.region}:${row.city}`}
                          label={formatGeoLocation([row.city, row.region, row.country_code])}
                          count={row.count}
                          maxCount={filteredGeoCities[0]?.count ?? 1}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="text-sm font-semibold text-slate-200">Tool usage & active time</h2>
              <p className="text-xs text-slate-500 mt-1">
                Active time counts only while the tab is visible.
                {audience === 'all'
                  ? ' Combined view: one row per tool (guest + signed-in totals). Unique visitors may overlap if the same browser used both modes.'
                  : ' Showing the selected audience only.'}
              </p>
            </div>
            {filteredToolUsage.length === 0 ? (
              <p className="text-sm text-slate-500 p-4">No tool usage recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-700">
                      <th className="px-4 py-2 font-medium">Tool</th>
                      <th className="px-4 py-2 font-medium text-right">Unique visitors</th>
                      <th className="px-4 py-2 font-medium text-right">Total active time</th>
                      <th className="px-4 py-2 font-medium text-right">Avg per visitor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredToolUsage.map((row) => (
                      <tr
                        key={`${row.tool_id}:${row.sub_tool_id}`}
                        className="border-b border-slate-800/80"
                      >
                        <td className="px-4 py-2.5 text-slate-200">
                          {formatToolLabel(row.tool_id, row.sub_tool_id)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">
                          {row.unique_visitors}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">
                          {formatAnalyticsDuration(row.total_seconds)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">
                          {formatAnalyticsDuration(Number(row.avg_seconds))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-slate-500">
            Visitors are identified by an anonymous browser ID. Offline / Guest sessions are tracked
            separately from signed-in activity. Geography is resolved once per browser from the IP
            seen by Supabase edge functions (typically accurate to country/region/city, not street level).
            Data before migration 105/106 may appear in one audience bucket or without location.
          </p>
        </div>
      )}
    </FeaturePageLayout>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  const display =
    Number.isFinite(value) && !Number.isInteger(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : value.toLocaleString()
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
      <p className="text-slate-500 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white mt-1 tabular-nums">{display}</p>
    </div>
  )
}

function DailyVisitorStackedBar({
  row,
  maxCount,
}: {
  row: DailyVisitorRow
  maxCount: number
}) {
  const guestCount = row.guest_count ?? 0
  const signedInCount = row.signed_in_count ?? 0
  const guestWidth =
    maxCount > 0 ? Math.max(guestCount > 0 ? 4 : 0, (guestCount / maxCount) * 100) : 0
  const signedInWidth =
    maxCount > 0 ? Math.max(signedInCount > 0 ? 4 : 0, (signedInCount / maxCount) * 100) : 0

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-slate-500 tabular-nums">{row.date}</span>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2.5 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-amber-500/70 rounded" style={{ width: `${guestWidth}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-amber-300/90 tabular-nums text-xs">
            {guestCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2.5 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-green-500/70 rounded" style={{ width: `${signedInWidth}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-green-300/90 tabular-nums text-xs">
            {signedInCount}
          </span>
        </div>
      </div>
      <span className="w-10 shrink-0 text-right text-slate-400 tabular-nums text-xs" title="Combined unique visitors">
        {row.count}
      </span>
    </div>
  )
}

function GeoBarRow({
  label,
  count,
  maxCount,
}: {
  label: string
  count: number
  maxCount: number
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 sm:w-56 shrink-0 text-slate-300 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-4 bg-slate-800 rounded overflow-hidden">
        <div
          className="h-full bg-sky-500/70 rounded"
          style={{ width: `${Math.max(count > 0 ? 4 : 0, (count / maxCount) * 100)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-slate-300 tabular-nums">{count}</span>
    </div>
  )
}
