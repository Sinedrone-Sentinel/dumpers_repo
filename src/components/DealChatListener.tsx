import { useCallback, useEffect, useState } from 'react'
import DealChatModal from './DealChatModal'
import { useAuth } from '../contexts/AuthContext'
import { DEAL_CHAT_OPEN_EVENT, type DealChatOpenDetail } from '../lib/dealChat'
import { fetchCustomOrderById, type CustomOrder } from '../lib/operations'

export default function DealChatListener() {
  const { user, isApproved } = useAuth()
  const [order, setOrder] = useState<CustomOrder | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const open = useCallback(async (orderId: string) => {
    setLoadError(null)
    const { data, error } = await fetchCustomOrderById(orderId)
    if (error || !data) {
      setLoadError(error || 'Deal not found')
      setOrder(null)
      return
    }
    setOrder(data)
  }, [])

  useEffect(() => {
    const onEvent = (event: Event) => {
      const custom = event as CustomEvent<DealChatOpenDetail>
      if (custom.detail?.orderId) void open(custom.detail.orderId)
    }
    window.addEventListener(DEAL_CHAT_OPEN_EVENT, onEvent)
    return () => window.removeEventListener(DEAL_CHAT_OPEN_EVENT, onEvent)
  }, [open])

  if (!user || !isApproved) return null

  if (loadError && !order) {
    return (
      <div className="fixed bottom-4 right-4 z-[80] site-banner-warn max-w-sm text-sm">
        {loadError}
        <button type="button" className="ml-2 underline" onClick={() => setLoadError(null)}>
          Dismiss
        </button>
      </div>
    )
  }

  if (!order) return null
  return <DealChatModal order={order} onClose={() => setOrder(null)} />
}
