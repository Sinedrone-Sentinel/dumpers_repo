import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import SupportTicketThread from '../components/SupportTicketThread'

type TicketCategory =
  | 'bug_report'
  | 'member_report'
  | 'rsi_verification'
  | 'partnership_application'
  | 'add_new_service_request'
  | 'other'
type TicketStatus = 'open' | 'assigned' | 'pending_user' | 'resolved'

interface OfficerTicket {
  id: string
  category: TicketCategory
  subject: string
  status: TicketStatus
  requester_name: string
  requester_id: string
  assignee_id: string | null
  assignee_name: string
  reported_user_name: string | null
  message_count: number
  created_at: string
  updated_at: string
}

interface EscalatedTicket {
  id: string
  category: TicketCategory
  subject: string
  status: TicketStatus
  requester_name: string
  requester_id: string
  original_assignee_id: string | null
  original_assignee_name: string
  escalation_reason: string | null
  escalated_at: string
  rating_stars: number | null
  rating_comment: string | null
  message_count: number
  created_at: string
}

interface OfficerPerformance {
  officer_id: string
  officer_name: string
  total_ratings: number
  avg_rating: number | null
  stars_1: number
  stars_2: number
  stars_3: number
  stars_4: number
  stars_5: number
  escalation_count: number
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug_report: 'Bug Report',
  member_report: 'Member Report',
  rsi_verification: 'RSI Verification',
  partnership_application: 'Partnership Application',
  add_new_service_request: 'Add New Service Request',
  other: 'Other',
}

const CATEGORY_STYLES: Record<TicketCategory, string> = {
  bug_report: 'bg-purple-950/50 text-purple-300 border-purple-500/30',
  member_report: 'bg-amber-950/50 text-amber-300 border-amber-500/30',
  rsi_verification: 'bg-cyan-950/50 text-cyan-300 border-cyan-500/30',
  partnership_application: 'bg-orange-950/50 text-orange-300 border-orange-500/30',
  add_new_service_request: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30',
  other: 'site-badge-slate',
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: 'bg-green-950/50 text-green-300 border-green-500/30',
  assigned: 'bg-blue-950/50 text-blue-300 border-blue-500/30',
  pending_user: 'bg-amber-950/50 text-amber-300 border-amber-500/30',
  resolved: 'site-badge-slate text-slate-400',
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  pending_user: 'Awaiting User',
  resolved: 'Resolved',
}

export default function SupportDashboardRoute() {
  const { user, isOfficerOrAbove, isSuperAdmin } = useAuth()
  const [tickets, setTickets] = useState<OfficerTicket[]>([])
  const [escalatedTickets, setEscalatedTickets] = useState<EscalatedTicket[]>([])
  const [officerPerformance, setOfficerPerformance] = useState<OfficerPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | ''>('')
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('')
  const [showPerformance, setShowPerformance] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase.rpc('get_officer_tickets')
      if (fetchError) throw fetchError
      setTickets(data || [])
    } catch (err) {
      setError((err as Error).message)
    }

    setLoading(false)
  }, [])

  const loadEscalatedTickets = useCallback(async () => {
    if (!isSuperAdmin) return
    try {
      const { data, error: fetchError } = await supabase.rpc('get_escalated_tickets')
      if (fetchError) throw fetchError
      setEscalatedTickets(data || [])
    } catch (err) {
      console.error('Failed to load escalated tickets:', err)
    }
  }, [isSuperAdmin])

  const loadOfficerPerformance = useCallback(async () => {
    if (!isSuperAdmin) return
    try {
      const { data, error: fetchError } = await supabase.rpc('get_officer_performance')
      if (fetchError) throw fetchError
      setOfficerPerformance(data || [])
    } catch (err) {
      console.error('Failed to load officer performance:', err)
    }
  }, [isSuperAdmin])

  useEffect(() => {
    if (isOfficerOrAbove) {
      loadTickets()
    }
    if (isSuperAdmin) {
      loadEscalatedTickets()
      loadOfficerPerformance()
    }
  }, [isOfficerOrAbove, isSuperAdmin, loadTickets, loadEscalatedTickets, loadOfficerPerformance])

  const unassignedTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (t.assignee_id) return false
      if (categoryFilter && t.category !== categoryFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      return true
    })
  }, [tickets, categoryFilter, statusFilter])

  const myAssignedTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (t.assignee_id !== user?.id) return false
      if (categoryFilter && t.category !== categoryFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      return true
    })
  }, [tickets, user?.id, categoryFilter, statusFilter])

  const allAssignedTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (!t.assignee_id || t.assignee_id === user?.id) return false
      if (categoryFilter && t.category !== categoryFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      return true
    })
  }, [tickets, user?.id, categoryFilter, statusFilter])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffHours < 48) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const handleAssign = async (ticketId: string) => {
    try {
      const { error: assignError } = await supabase.rpc('assign_ticket_to_self', {
        p_ticket_id: ticketId,
      })
      if (assignError) throw assignError
      loadTickets()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const reloadAll = () => {
    loadTickets()
    if (isSuperAdmin) {
      loadEscalatedTickets()
      loadOfficerPerformance()
    }
  }

  const renderStars = (count: number, filled: boolean) => (
    <span className={filled ? 'text-amber-400' : 'text-slate-600'}>
      {'★'.repeat(count)}
    </span>
  )

  if (!isOfficerOrAbove) {
    return (
      <FeaturePageLayout title="Support Dashboard" subtitle="Access Denied">
        <div className="text-center py-16 text-slate-400">
          <p>You do not have permission to view this page.</p>
        </div>
      </FeaturePageLayout>
    )
  }

  if (selectedTicketId) {
    return (
      <SupportTicketThread
        ticketId={selectedTicketId}
        onBack={() => {
          setSelectedTicketId(null)
          reloadAll()
        }}
        onClose={() => {
          setSelectedTicketId(null)
          reloadAll()
        }}
        isOfficer={true}
        onDeleted={() => reloadAll()}
      />
    )
  }

  return (
    <FeaturePageLayout
      title="Support Dashboard"
      subtitle="Manage member support tickets"
    >
      {error && (
        <div className="mb-4 site-banner-error">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as TicketCategory | '')}
            className="site-input px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
            className="site-input px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).filter(([key]) => key !== 'resolved').map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowPerformance(!showPerformance)}
            className={`px-3 py-1.5 border rounded-lg text-sm transition-colors ${
              showPerformance
                ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                : 'site-filter-idle'
            }`}
          >
            Officer Stats
          </button>
        )}
        <button
          onClick={() => reloadAll()}
          disabled={loading}
          className="ml-auto site-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Escalated Tickets Section - Super Admin Only */}
      {isSuperAdmin && escalatedTickets.length > 0 && (
        <section className="mb-6 p-4 bg-red-900/20 border border-red-500/40 rounded-xl">
          <h2 className="text-red-300 font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Escalated Tickets
            <span className="px-2 py-0.5 bg-red-600/30 text-red-300 text-xs font-medium rounded-full">
              {escalatedTickets.length}
            </span>
          </h2>

          <div className="space-y-3">
            {escalatedTickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                className="w-full text-left p-4 site-surface border-red-500/30 hover:border-red-500/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded border ${CATEGORY_STYLES[ticket.category]}`}>
                        {CATEGORY_LABELS[ticket.category]}
                      </span>
                      {ticket.rating_stars && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded border bg-amber-950/50 text-amber-300 border-amber-500/30">
                          {ticket.rating_stars} star{ticket.rating_stars !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        Escalated {formatDate(ticket.escalated_at)}
                      </span>
                    </div>
                    <p className="text-white font-medium truncate">{ticket.subject}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      From: <span className="text-slate-300">{ticket.requester_name}</span>
                      {' · '}Originally handled by: <span className="text-amber-400">{ticket.original_assignee_name}</span>
                    </p>
                    {ticket.escalation_reason && (
                      <p className="mt-2 text-sm text-red-300/80 bg-red-900/20 p-2 rounded">
                        {ticket.escalation_reason}
                      </p>
                    )}
                    {ticket.rating_comment && (
                      <p className="mt-2 text-sm text-slate-400 italic">
                        &quot;{ticket.rating_comment}&quot;
                      </p>
                    )}
                  </div>
                  <svg
                    className="w-5 h-5 text-red-400 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Officer Performance Section - Super Admin Only */}
      {isSuperAdmin && showPerformance && (
        <section className="mb-6 p-4 site-surface border-amber-500/30">
          <h2 className="text-amber-300 font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Officer Performance
          </h2>

          {officerPerformance.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">
              No ratings recorded yet.
            </p>
          ) : (
            <div className="site-table-wrap">
              <table className="site-table">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Officer</th>
                    <th className="text-center py-2 px-3 text-slate-400 font-medium">Avg Rating</th>
                    <th className="text-center py-2 px-3 text-slate-400 font-medium">Total</th>
                    <th className="text-center py-2 px-3 text-slate-400 font-medium">Distribution</th>
                    <th className="text-center py-2 px-3 text-slate-400 font-medium">Escalations</th>
                  </tr>
                </thead>
                <tbody>
                  {officerPerformance.map((officer) => (
                    <tr key={officer.officer_id}>
                      <td className="py-3 px-3 text-white font-medium">{officer.officer_name}</td>
                      <td className="py-3 px-3 text-center">
                        {officer.avg_rating ? (
                          <span className={`font-semibold ${
                            officer.avg_rating >= 4 ? 'text-green-400' :
                            officer.avg_rating >= 3 ? 'text-amber-400' :
                            'text-red-400'
                          }`}>
                            {officer.avg_rating.toFixed(1)} {renderStars(Math.round(officer.avg_rating), true)}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-300">{officer.total_ratings}</td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex justify-center gap-1 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300" title="1 star">{officer.stars_1}</span>
                          <span className="px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-300" title="2 stars">{officer.stars_2}</span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300" title="3 stars">{officer.stars_3}</span>
                          <span className="px-1.5 py-0.5 rounded bg-lime-900/40 text-lime-300" title="4 stars">{officer.stars_4}</span>
                          <span className="px-1.5 py-0.5 rounded bg-green-900/40 text-green-300" title="5 stars">{officer.stars_5}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {officer.escalation_count > 0 ? (
                          <span className="text-red-400 font-medium">{officer.escalation_count}</span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Unassigned Queue */}
          <div className="space-y-6">
            <section>
              <h2 className="text-white font-medium mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Unassigned Queue
                {unassignedTickets.length > 0 && (
                  <span className="px-2 py-0.5 bg-green-950/50 text-green-400 text-xs font-medium rounded-full">
                    {unassignedTickets.length}
                  </span>
                )}
              </h2>

              {unassignedTickets.length === 0 ? (
                <div className="site-empty p-6 text-sm">
                  No unassigned tickets
                </div>
              ) : (
                <div className="space-y-3">
                  {unassignedTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="p-4 site-surface transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${CATEGORY_STYLES[ticket.category]}`}>
                              {CATEGORY_LABELS[ticket.category]}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${STATUS_STYLES[ticket.status]}`}>
                              {STATUS_LABELS[ticket.status]}
                            </span>
                            <span className="text-xs text-slate-500">{formatDate(ticket.created_at)}</span>
                          </div>
                          <p className="text-white font-medium truncate flex items-center gap-2">
                            {ticket.subject}
                            {ticket.subject.startsWith('[System]') && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-950 text-red-400 border border-red-500/40 rounded uppercase">
                                Auto
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-slate-500 mt-1">
                            {ticket.subject.startsWith('[System]') ? (
                              <>Reported user: <span className="text-amber-400">{ticket.requester_name}</span></>
                            ) : (
                              <>
                                From: <span className="text-slate-300">{ticket.requester_name}</span>
                                {ticket.reported_user_name && (
                                  <> · Reporting: <span className="text-amber-400">{ticket.reported_user_name}</span></>
                                )}
                              </>
                            )}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {ticket.message_count} message{ticket.message_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => handleAssign(ticket.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            Take This
                          </button>
                          <button
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className="site-btn-secondary px-3 py-1.5 text-xs font-medium"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Assigned Tickets */}
          <div className="space-y-6">
            <section>
              <h2 className="text-white font-medium mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                My Assigned
                {myAssignedTickets.length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-950/50 text-blue-400 text-xs font-medium rounded-full">
                    {myAssignedTickets.length}
                  </span>
                )}
              </h2>

              {myAssignedTickets.length === 0 ? (
                <div className="site-empty p-6 text-sm">
                  No tickets assigned to you
                </div>
              ) : (
                <div className="space-y-3">
                  {myAssignedTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className="w-full text-left p-4 site-surface hover:border-blue-500/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${CATEGORY_STYLES[ticket.category]}`}>
                          {CATEGORY_LABELS[ticket.category]}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${STATUS_STYLES[ticket.status]}`}>
                          {STATUS_LABELS[ticket.status]}
                        </span>
                        <span className="text-xs text-slate-500">{formatDate(ticket.updated_at)}</span>
                      </div>
                      <p className="text-white font-medium truncate">{ticket.subject}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        From: <span className="text-slate-300">{ticket.requester_name}</span>
                        {ticket.reported_user_name && (
                          <> · Reporting: <span className="text-amber-400">{ticket.reported_user_name}</span></>
                        )}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        {ticket.message_count} message{ticket.message_count !== 1 ? 's' : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* All Assigned (for super-admins or broader visibility) */}
            {isSuperAdmin && allAssignedTickets.length > 0 && (
              <section>
                <h2 className="text-white font-medium mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Other Assigned Tickets
                  <span className="site-badge-slate px-2 py-0.5 text-xs font-medium rounded-full">
                    {allAssignedTickets.length}
                  </span>
                </h2>

                <div className="space-y-3">
                  {allAssignedTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className="w-full text-left p-4 site-surface transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${CATEGORY_STYLES[ticket.category]}`}>
                          {CATEGORY_LABELS[ticket.category]}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${STATUS_STYLES[ticket.status]}`}>
                          {STATUS_LABELS[ticket.status]}
                        </span>
                        <span className="text-xs text-slate-500">Assigned to {ticket.assignee_name}</span>
                      </div>
                      <p className="text-white font-medium truncate">{ticket.subject}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        From: <span className="text-slate-300">{ticket.requester_name}</span>
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </FeaturePageLayout>
  )
}
