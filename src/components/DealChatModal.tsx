import React, { useEffect, useRef, useState } from 'react'
import AppModal from './layout/AppModal'
import TradeContactChip from './TradeContactChip'
import { useAuth } from '../contexts/AuthContext'
import { useAsyncEffect } from '../hooks/useAsyncEffect'
import { supabase } from '../lib/supabase'
import {
  listDealMessages,
  sendDealMessage,
  type CustomOrder,
  type DealChatMessage,
} from '../lib/operations'
import { canOpenDealChat, isSemanticBuyer } from '../lib/listingType'

interface DealChatModalProps {
  order: CustomOrder
  onClose: () => void
}

export default function DealChatModal({ order, onClose }: DealChatModalProps) {
  const { user, profile } = useAuth()
  const userId = user?.id
  const isRsiVerified = profile?.rsi_handle_verified ?? false
  const isParty = !!userId && (userId === order.requester_id || userId === order.assignee_id)
  const chatOpen = canOpenDealChat(order) && isParty
  const counterpart = userId === order.requester_id ? order.assignee : order.requester
  const counterpartRole = userId && isSemanticBuyer(order, userId)
    ? order.listing_type === 'wts'
      ? 'seller'
      : 'fulfiller'
    : order.listing_type === 'wts'
      ? 'buyer'
      : 'customer'

  const [messages, setMessages] = useState<DealChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = React.useCallback(async () => {
    const { data, error: loadError } = await listDealMessages(order.id)
    if (loadError) {
      setError(loadError)
      return
    }
    setError(null)
    setMessages(data)
  }, [order.id])

  useAsyncEffect(
    async ({ cancelled }) => {
      const { data, error: loadError } = await listDealMessages(order.id)
      if (cancelled) return
      if (loadError) {
        setError(loadError)
        return
      }
      setMessages(data)
    },
    [order.id]
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  useEffect(() => {
    const channel = supabase
      .channel(`deal-chat-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deal_messages', filter: `order_id=eq.${order.id}` },
        () => {
          void loadMessages()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [order.id, loadMessages])

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    const { data, error: sendError } = await sendDealMessage(order.id, body)
    setSending(false)
    if (sendError) {
      setError(sendError)
      return
    }
    setDraft('')
    if (data) {
      setMessages((current) => (current.some((row) => row.id === data.id) ? current : [...current, data]))
    }
  }

  return (
    <AppModal
      title="Deal chat"
      subtitle={order.title}
      onClose={onClose}
      size="md"
      footer={
        chatOpen && isRsiVerified ? (
          <form onSubmit={(e) => void handleSend(e)} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={800}
              placeholder="Message the other party"
              className="site-input flex-1 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="site-btn-primary px-3 py-2 text-sm shrink-0"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-400">
            {!isRsiVerified
              ? 'A verified RSI Handle is required to send messages.'
              : 'This deal is no longer open for chat.'}
          </p>
        )
      }
    >
      <div className="space-y-3">
        {counterpart && (
          <TradeContactChip role={counterpartRole} profile={counterpart} compact />
        )}
        <div className="max-h-[min(50vh,24rem)] overflow-y-auto space-y-2 pr-1">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet.</p>
          ) : (
            messages.map((message) => {
              const mine = message.senderId === userId
              return (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    mine
                      ? 'ml-auto bg-sky-950/60 text-sky-100 border border-sky-500/25'
                      : 'bg-slate-900/70 text-slate-200 border border-slate-600/40'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {new Date(message.createdAt).toLocaleString()}
                  </p>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </div>
    </AppModal>
  )
}
