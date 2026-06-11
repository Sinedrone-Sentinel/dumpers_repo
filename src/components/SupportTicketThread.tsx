import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import AppModal from './layout/AppModal'

type TicketCategory = 'bug_report' | 'member_report' | 'rsi_verification'
type TicketStatus = 'open' | 'assigned' | 'pending_user' | 'resolved'

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
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [resolutionMessage, setResolutionMessage] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadTicket = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_ticket_detail', {
        p_ticket_id: ticketId,
      })
      if (error) throw error
      if (data?.success) {
        setTicket(data.ticket)
        setMessages(data.messages || [])
        setStatus(data.ticket.status)
      }
    } catch (err) {
      console.error('Failed to load ticket:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTicket()
  }, [ticketId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        loadTicket()
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

  const handleDelete = async () => {
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
        <div className="text-center py-8 text-slate-400">
          <p>This ticket could not be found or you don't have access.</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
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
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 text-sm">
          <button
            onClick={onBack}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
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
      {/* Officer Actions */}
      {isOfficer && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
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
            disabled={updatingStatus}
            className="ml-auto px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-red-500/50"
          >
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="pending_user">Awaiting Response</option>
          </select>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Resolve & Delete
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
                  : 'bg-slate-800 border border-slate-700'
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
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input */}
      <div className="flex gap-2">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your response..."
          rows={2}
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
        />
        <button
          onClick={handleSendMessage}
          disabled={sending || !newMessage.trim()}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors self-end"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80]">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              Resolve & Delete Ticket
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Enter a resolution message for the member. This will be sent as a notification
              so they can see the outcome even after the ticket is deleted.
            </p>
            <textarea
              value={resolutionMessage}
              onChange={(e) => setResolutionMessage(e.target.value)}
              placeholder="e.g., Your issue has been resolved. The RSI Handle was cleared and is now available for re-verification."
              rows={3}
              className="w-full px-3 py-2 mb-4 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 resize-none text-sm"
            />
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
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !resolutionMessage.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {deleting ? 'Resolving...' : 'Resolve & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppModal>
  )
}
