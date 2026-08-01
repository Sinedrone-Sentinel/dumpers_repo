import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AppModal from './layout/AppModal'
import OfficerRatingModal from './OfficerRatingModal'
import SupportTicketThread from './SupportTicketThread'

type TicketCategory = 'bug_report' | 'member_report' | 'rsi_verification'
type TicketStatus = 'open' | 'assigned' | 'pending_user' | 'resolved'
type ResolvedBy = 'officer' | 'member' | null

interface Ticket {
  id: string
  category: TicketCategory
  subject: string
  status: TicketStatus
  assignee_name: string | null
  message_count: number
  last_message_at: string | null
  created_at: string
  pending_rating: boolean
  resolved_by: ResolvedBy
  resolution_message: string | null
}

interface MemberOption {
  id: string
  name: string
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug_report: 'Bug Report',
  member_report: 'Report Member',
  rsi_verification: 'RSI Verification Issue',
}

const CATEGORY_DESCRIPTIONS: Record<TicketCategory, string> = {
  bug_report: 'Report a bug or technical issue with the site.',
  member_report: 'Report inappropriate behavior from another member.',
  rsi_verification: 'Issues with RSI Handle verification (e.g., handle shows as already in use).',
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: 'bg-amber-950/50 text-amber-300 border-amber-500/30',
  assigned: 'bg-blue-950/50 text-blue-300 border-blue-500/30',
  pending_user: 'bg-purple-950/50 text-purple-300 border-purple-500/30',
  resolved: 'bg-green-950/50 text-green-300 border-green-500/30',
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  pending_user: 'Awaiting Your Response',
  resolved: 'Resolved',
}

export default function SupportTicketsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [ratingTicket, setRatingTicket] = useState<Ticket | null>(null)
  
  // New ticket form
  const [category, setCategory] = useState<TicketCategory>('bug_report')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [reportedUserId, setReportedUserId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadTickets = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_my_tickets')
      if (error) throw error
      setTickets(data || [])
    } catch (err) {
      console.error('Failed to load tickets:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTickets()
  }, [])

  // Search members for report
  useEffect(() => {
    if (category !== 'member_report' || memberSearch.length < 2) {
      setMemberOptions([])
      return
    }

    const searchMembers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, rsi_handle, display_name, email')
        .neq('id', user?.id)
        .or(`rsi_handle.ilike.%${memberSearch}%,display_name.ilike.%${memberSearch}%`)
        .limit(10)

      if (data) {
        setMemberOptions(
          data.map((p) => ({
            id: p.id,
            name: p.rsi_handle || p.display_name || p.email || 'Unknown',
          }))
        )
      }
    }

    const timeout = setTimeout(searchMembers, 300)
    return () => clearTimeout(timeout)
  }, [memberSearch, category, user?.id])

  const handleSubmit = async () => {
    if (!subject.trim() || !content.trim()) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' })
      return
    }

    if (category === 'member_report' && !reportedUserId) {
      setMessage({ type: 'error', text: 'Please select a member to report.' })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc('create_support_ticket', {
        p_category: category,
        p_subject: subject.trim(),
        p_content: content.trim(),
        p_reported_user_id: reportedUserId,
      })

      if (error) throw error

      if (data?.success) {
        setMessage({ type: 'success', text: 'Ticket submitted successfully.' })
        setSubject('')
        setContent('')
        setReportedUserId(null)
        setMemberSearch('')
        setActiveTab('list')
        loadTickets()
        // Discord staff alert is queued inside create_support_ticket (server-side).
      } else {
        throw new Error(data?.error || 'Failed to create ticket')
      }
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message })
    }

    setSubmitting(false)
  }

  const handleTicketClick = (ticket: Ticket) => {
    if (ticket.pending_rating) {
      setRatingTicket(ticket)
    } else {
      setSelectedTicketId(ticket.id)
    }
  }

  // Show rating modal for pending rating tickets
  if (ratingTicket) {
    return (
      <OfficerRatingModal
        ticketId={ratingTicket.id}
        ticketSubject={ratingTicket.subject}
        resolvedBy={ratingTicket.resolved_by ?? 'officer'}
        resolutionMessage={ratingTicket.resolution_message}
        onClose={() => {
          setRatingTicket(null)
          loadTickets()
        }}
        onComplete={() => {
          setRatingTicket(null)
          loadTickets()
        }}
      />
    )
  }

  if (selectedTicketId) {
    return (
      <SupportTicketThread
        ticketId={selectedTicketId}
        onBack={() => {
          setSelectedTicketId(null)
          loadTickets()
        }}
        onClose={onClose}
        isOfficer={false}
      />
    )
  }

  return (
    <AppModal
      title="Support"
      subtitle="Report issues or check ticket status"
      onClose={onClose}
      size="lg"
      zIndex={70}
      headerExtra={
        <div className="flex border-b border-slate-700 shrink-0">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'list'
                ? 'bg-slate-800 text-white border-b-2 border-red-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            My Tickets
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'new'
                ? 'bg-slate-800 text-white border-b-2 border-red-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            New Ticket
          </button>
        </div>
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

      {activeTab === 'list' && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-t-2 border-red-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p>No open tickets</p>
              <p className="text-xs text-slate-500 mt-1">Create a new ticket to report an issue</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => handleTicketClick(ticket)}
                className={`w-full text-left p-4 border rounded-xl transition-colors ${
                  ticket.pending_rating
                    ? 'bg-amber-900/20 hover:bg-amber-900/30 border-amber-500/40 hover:border-amber-500/60'
                    : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {ticket.pending_rating ? (
                        <span className="px-2 py-0.5 text-xs font-medium rounded border bg-amber-600/30 text-amber-300 border-amber-500/50">
                          Pending Your Rating
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded border ${STATUS_STYLES[ticket.status]}`}
                        >
                          {STATUS_LABELS[ticket.status]}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {CATEGORY_LABELS[ticket.category]}
                      </span>
                    </div>
                    <p className="text-white font-medium truncate">{ticket.subject}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>{ticket.message_count} messages</span>
                      {ticket.assignee_name && <span>Handled by {ticket.assignee_name}</span>}
                    </div>
                    {ticket.pending_rating && (
                      <p className="mt-2 text-xs text-amber-300/80">
                        Click to rate your support experience
                      </p>
                    )}
                  </div>
                  <svg
                    className={`w-5 h-5 shrink-0 ${ticket.pending_rating ? 'text-amber-400' : 'text-slate-500'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {activeTab === 'new' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as TicketCategory)
                setReportedUserId(null)
                setMemberSearch('')
              }}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-red-500/50"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{CATEGORY_DESCRIPTIONS[category]}</p>
          </div>

          {category === 'member_report' && (
            <div>
              <label className="block text-sm text-slate-300 mb-2">Member to Report</label>
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search by RSI Handle or name..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50"
              />
              {memberOptions.length > 0 && (
                <div className="mt-2 border border-slate-700 rounded-lg overflow-hidden">
                  {memberOptions.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => {
                        setReportedUserId(member.id)
                        setMemberSearch(member.name)
                        setMemberOptions([])
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
              )}
              {reportedUserId && (
                <p className="mt-2 text-xs text-green-400">
                  Selected: {memberSearch}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-300 mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of the issue..."
              maxLength={100}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Description</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Provide details about the issue..."
              rows={5}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !subject.trim() || !content.trim()}
            className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Ticket'}
          </button>
        </div>
      )}
    </AppModal>
  )
}
