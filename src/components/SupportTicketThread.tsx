import React, { useEffect, useRef, useState } from 'react'
import { fetchDisputeOrderId, resolveOrderDispute } from '../lib/operations'
import { getDisplayName, supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  useLocalTypingFlag,
  useSupportThreadRealtime,
} from '../hooks/useSupportRealtime'
import AppModal from './layout/AppModal'

type TicketCategory =
  | 'bug_report'
  | 'member_report'
  | 'rsi_verification'
  | 'partnership_application'
  | 'add_new_service_request'
  | 'other'
type TicketStatus = 'open' | 'assigned' | 'pending_user' | 'resolved'
type ResolvedBy = 'officer' | 'member' | null

interface TicketDetail {
  id: string
  category: TicketCategory
  subject: string
  status: TicketStatus
  requester_id: string
  requester_name: string
  assignee_id: string | null
  assignee_name: string
  reported_user_id: string | null
  reported_user_name: string | null
  created_at: string
  updated_at: string
  pending_rating: boolean
  resolved_by: ResolvedBy
  resolution_message: string | null
  is_escalated: boolean
  escalated_at: string | null
  escalation_reason: string | null
}

interface TicketRating {
  stars: number
  comment: string | null
  created_at: string
}

interface TicketMessage {
  id: string
  content: string
  is_staff: boolean
  author_name: string
  created_at: string
}

interface Props {
  ticketId: string
  onBack: () => void
  onClose: () => void
  isOfficer: boolean
  onDeleted?: () => void
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug_report: 'Bug Report',
  member_report: 'Report Member',
  rsi_verification: 'RSI Verification Issue',
  partnership_application: 'Partnership Application',
  add_new_service_request: 'Add New Service Request',
  other: 'Other',
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
  pending_user: 'Awaiting Response',
  resolved: 'Resolved',
}

export default function SupportTicketThread({
  ticketId,
  onBack,
  onClose,
  isOfficer,
  onDeleted,
}: Props) {
  const { user, profile, isSuperAdmin } = useAuth()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [rating, setRating] = useState<TicketRating | null>(null)
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [showResolveConfirm, setShowResolveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [resolutionMessage, setResolutionMessage] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [memberResolving, setMemberResolving] = useState(false)
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [disputeOrderId, setDisputeOrderId] = useState<string | null>(null)
  const [resolvingDispute, setResolvingDispute] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadTicket = async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_ticket_detail', {
        p_ticket_id: ticketId,
      })
      if (error) throw error
      if (data?.success) {
        setTicket(data.ticket)
        setMessages(data.messages || [])
        setStatus(data.ticket.status)
        setRating(data.rating || null)
      }
    } catch (err) {
      console.error('Failed to load ticket:', err)
    }
    if (!opts?.quiet) setLoading(false)
  }

  useEffect(() => {
    void loadTicket()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  const displayName = getDisplayName(profile)
  const localTyping = useLocalTypingFlag(
    newMessage,
    Boolean(ticket && ticket.status !== 'resolved'),
  )
  const { typingLabel } = useSupportThreadRealtime({
    ticketId,
    enabled: Boolean(ticket && ticket.status !== 'resolved'),
    userId: user?.id,
    isStaff: isOfficer,
    displayName,
    localTyping,
    onRemoteChange: () => {
      void loadTicket({ quiet: true })
    },
  })

  useEffect(() => {
    if (!isOfficer || !ticket?.subject.startsWith('Order dispute:')) {
      setDisputeOrderId(null)
      return
    }
    void fetchDisputeOrderId(ticketId).then((result) => {
      setDisputeOrderId(result.orderId ?? null)
    })
  }, [isOfficer, ticketId, ticket?.subject])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingLabel])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return

    setSending(true)
    try {
      const { data, error } = await supabase.rpc('add_ticket_message', {
        p_ticket_id: ticketId,
        p_content: newMessage.trim(),
      })
      if (error) throw error
      if (data?.success) {
        setNewMessage('')
        void loadTicket({ quiet: true })
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    }
    setSending(false)
  }

  const handleAssignToSelf = async () => {
    try {
      const { error } = await supabase.rpc('assign_ticket_to_self', {
        p_ticket_id: ticketId,
      })
      if (error) throw error
      loadTicket()
    } catch (err) {
      console.error('Failed to assign ticket:', err)
    }
  }

  const handleStatusChange = async (newStatus: TicketStatus) => {
    setUpdatingStatus(true)
    try {
      const { error } = await supabase.rpc('update_ticket_status', {
        p_ticket_id: ticketId,
        p_status: newStatus,
      })
      if (error) throw error
      setStatus(newStatus)
      loadTicket()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
    setUpdatingStatus(false)
  }

  const isSystemGenerated = ticket?.subject.startsWith('[System]') ?? false

  // Officer resolves ticket (member will need to rate)
  const handleOfficerResolve = async () => {
    if (!resolutionMessage.trim()) return

    setResolving(true)
    try {
      const { data, error } = await supabase.rpc('officer_resolve_ticket', {
        p_ticket_id: ticketId,
        p_resolution_message: resolutionMessage.trim(),
      })
      if (error) throw error
      if (data?.success) {
        onDeleted?.()
        onBack()
      }
    } catch (err) {
      console.error('Failed to resolve ticket:', err)
    }
    setResolving(false)
    setShowResolveConfirm(false)
    setResolutionMessage('')
  }

  // Member marks their own ticket as resolved
  const handleMemberResolve = async () => {
    setMemberResolving(true)
    try {
      const { data, error } = await supabase.rpc('member_resolve_ticket', {
        p_ticket_id: ticketId,
      })
      if (error) throw error
      if (data?.success) {
        onBack()
      }
    } catch (err) {
      console.error('Failed to mark as resolved:', err)
    }
    setMemberResolving(false)
  }

  // Super-admin resolves escalated ticket
  const handleSuperAdminResolve = async () => {
    if (!resolutionMessage.trim()) return

    setResolving(true)
    try {
      const { data, error } = await supabase.rpc('super_admin_resolve_escalation', {
        p_ticket_id: ticketId,
        p_resolution_message: resolutionMessage.trim(),
      })
      if (error) throw error
      if (data?.success) {
        onDeleted?.()
        onBack()
      }
    } catch (err) {
      console.error('Failed to resolve escalation:', err)
    }
    setResolving(false)
    setShowResolveConfirm(false)
    setResolutionMessage('')
  }

  const _handleDelete = async () => {
    if (!resolutionMessage.trim()) return
    
    setDeleting(true)
    try {
      const { data, error } = await supabase.rpc('resolve_and_delete_ticket', {
        p_ticket_id: ticketId,
        p_resolution_message: resolutionMessage.trim(),
      })
      if (error) throw error
      if (data?.success) {
        onDeleted?.()
        onBack()
      }
    } catch (err) {
      console.error('Failed to delete ticket:', err)
    }
    setDeleting(false)
    setShowDeleteConfirm(false)
    setResolutionMessage('')
  }

  const handleResolveDispute = async (outcome: 'cancel' | 'release') => {
    if (!disputeOrderId) return
    setResolvingDispute(true)
    try {
      const result = await resolveOrderDispute(disputeOrderId, outcome)
      if (result.error) {
        console.error(result.error)
      } else {
        setDisputeOrderId(null)
        loadTicket()
      }
    } catch (err) {
      console.error('Failed to resolve dispute:', err)
    }
    setResolvingDispute(false)
  }

  const handleDismiss = async () => {
    setDeleting(true)
    try {
      const { data, error } = await supabase.rpc('resolve_and_delete_ticket', {
        p_ticket_id: ticketId,
        p_resolution_message: 'System-generated report reviewed and dismissed by staff.',
      })
      if (error) throw error
      if (data?.success) {
        onDeleted?.()
        onBack()
      }
    } catch (err) {
      console.error('Failed to dismiss ticket:', err)
    }
    setDeleting(false)
    setShowDeleteConfirm(false)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <AppModal
        title="Loading..."
        onClose={onClose}
        size="lg"
        zIndex={70}
      >
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-red-500 rounded-full animate-spin" />
        </div>
      </AppModal>
    )
  }

  if (!ticket) {
    return (
      <AppModal
        title="Ticket Not Found"
        onClose={onClose}
        size="lg"
        zIndex={70}
      >
        <div className="site-empty !py-8 rounded-xl">
          <p>This ticket could not be found or you don't have access.</p>
          <button
            onClick={onBack}
            className="mt-4 site-btn-secondary"
          >
            Go Back
          </button>
        </div>
      </AppModal>
    )
  }

  return (
    <AppModal
      title={ticket.subject}
      subtitle={CATEGORY_LABELS[ticket.category]}
      onClose={onClose}
      size="lg"
      zIndex={70}
      headerExtra={
        <div className="flex items-center gap-3 px-4 py-2 border-b border-orange-500/15 text-sm">
          <button
            onClick={onBack}
            className="site-btn-ghost p-1"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className={`px-2 py-0.5 text-xs font-medium rounded border ${STATUS_STYLES[ticket.status]}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
          <span className="text-slate-500">
            From <span className="text-slate-300">{ticket.requester_name}</span>
          </span>
          {ticket.reported_user_name && (
            <span className="text-slate-500">
              Reporting <span className="text-amber-400">{ticket.reported_user_name}</span>
            </span>
          )}
        </div>
      }
    >
      {/* Escalation Info Banner (for super-admins viewing escalated tickets) */}
      {ticket.is_escalated && isSuperAdmin && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-500/40 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-red-300 font-medium">Escalated Ticket</h4>
              <p className="text-sm text-red-200/70 mt-1">
                Originally handled by <span className="text-red-300">{ticket.assignee_name}</span>
              </p>
              {rating && (
                <p className="text-sm text-red-200/70 mt-1">
                  Member rated: <span className="text-amber-400">{rating.stars} star{rating.stars !== 1 ? 's' : ''}</span>
                  {rating.comment && <span className="text-slate-400"> &mdash; &quot;{rating.comment}&quot;</span>}
                </p>
              )}
              {ticket.escalation_reason && (
                <div className="mt-2 p-2 site-surface rounded text-sm text-slate-300">
                  <span className="text-slate-500">Escalation reason:</span> {ticket.escalation_reason}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Officer Actions */}
      {isOfficer && !ticket.is_escalated && (
        <div className="flex items-center gap-3 mb-4 p-3 site-surface">
          {!ticket.assignee_id && (
            <button
              onClick={handleAssignToSelf}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Assign to Me
            </button>
          )}
          {ticket.assignee_id && (
            <span className="text-sm text-slate-400">
              Assigned to <span className="text-slate-300">{ticket.assignee_name}</span>
            </span>
          )}
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
            disabled={updatingStatus || ticket.pending_rating}
            className="site-input ml-auto px-2 py-1.5 text-sm"
          >
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="pending_user">Awaiting Response</option>
          </select>
          {disputeOrderId && (
            <>
              <button
                onClick={() => void handleResolveDispute('release')}
                disabled={resolvingDispute}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Release to fulfiller
              </button>
              <button
                onClick={() => void handleResolveDispute('cancel')}
                disabled={resolvingDispute}
                className="site-btn-secondary !px-3 !py-1.5 text-sm"
              >
                Cancel order
              </button>
            </>
          )}
          {ticket.pending_rating ? (
            <span className="px-3 py-1.5 bg-amber-600/20 border border-amber-500/30 text-amber-300 text-sm font-medium rounded-lg">
              Awaiting member rating
            </span>
          ) : (
            <button
              onClick={() => setShowResolveConfirm(true)}
              className="site-btn-success !px-3 !py-1.5 text-sm"
            >
              Resolve Ticket
            </button>
          )}
          {isSystemGenerated && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="site-btn-danger !px-3 !py-1.5 text-sm"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Super-Admin Actions for Escalated Tickets */}
      {ticket.is_escalated && isSuperAdmin && (
        <div className="flex items-center gap-3 mb-4 site-banner-error">
          <span className="text-sm text-red-300">
            Final resolution required
          </span>
          <button
            onClick={() => setShowResolveConfirm(true)}
            className="site-btn-danger ml-auto !px-3 !py-1.5 text-sm"
          >
            Resolve Escalation
          </button>
        </div>
      )}

      {/* Member Actions */}
      {!isOfficer && ticket.assignee_id && !ticket.pending_rating && !ticket.is_escalated && (
        <div className="flex items-center gap-3 mb-4 p-3 site-surface">
          <span className="text-sm text-slate-400">
            Issue resolved? You can mark this ticket as resolved.
          </span>
          <button
            onClick={handleMemberResolve}
            disabled={memberResolving}
            className="site-btn-success ml-auto !px-3 !py-1.5 text-sm"
          >
            {memberResolving ? 'Marking...' : 'Mark as Resolved'}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-4 max-h-[400px] overflow-y-auto pr-2 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.is_staff ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-xl ${
                msg.is_staff
                  ? 'bg-blue-600/20 border border-blue-500/30'
                  : 'site-surface'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium ${msg.is_staff ? 'text-blue-300' : 'text-slate-400'}`}>
                  {msg.author_name}
                  {msg.is_staff && (
                    <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded">
                      Staff
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-500">{formatDate(msg.created_at)}</span>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {typingLabel && (
          <p className="text-xs text-slate-400 italic px-1">{typingLabel}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input */}
      <div className="flex gap-2">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your response..."
          rows={2}
          className="site-textarea flex-1 px-3 py-2 min-h-0 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSendMessage()
            }
          }}
        />
        <button
          onClick={() => void handleSendMessage()}
          disabled={sending || !newMessage.trim()}
          className="site-btn-danger self-end"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>

      {/* Resolve Confirmation Modal (Officer or Super-Admin) */}
      {showResolveConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80]">
          <div className="site-menu-panel p-6 max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              {ticket.is_escalated ? 'Resolve Escalated Ticket' : 'Resolve Ticket'}
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              {ticket.is_escalated
                ? 'Enter a final resolution message for the member. This escalation will be closed permanently.'
                : 'Enter a resolution message for the member. They will be asked to rate their support experience before the ticket is closed.'}
            </p>
            <textarea
              value={resolutionMessage}
              onChange={(e) => setResolutionMessage(e.target.value)}
              placeholder="e.g., Your issue has been resolved. The RSI Handle was cleared and is now available for re-verification."
              rows={3}
              className="site-textarea w-full px-3 py-2 mb-4 min-h-0 resize-none text-sm"
            />
            {!ticket.is_escalated && (
              <p className="text-xs text-blue-400 mb-4">
                The member will rate this interaction. If they rate below 3 stars, they may escalate to a super-admin.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowResolveConfirm(false)
                  setResolutionMessage('')
                }}
                className="site-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={ticket.is_escalated ? handleSuperAdminResolve : handleOfficerResolve}
                disabled={resolving || !resolutionMessage.trim()}
                className={ticket.is_escalated ? 'site-btn-danger' : 'site-btn-success'}
              >
                {resolving ? 'Resolving...' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (System-generated tickets only) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80]">
          <div className="site-menu-panel p-6 max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              Dismiss System Report
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              This is an automated system-generated report. You can dismiss it if no action
              is required.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              This will <strong className="text-red-400">permanently delete</strong> the ticket
              and all messages. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setResolutionMessage('')
                }}
                className="site-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDismiss}
                disabled={deleting}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {deleting ? 'Dismissing...' : 'Dismiss Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppModal>
  )
}
