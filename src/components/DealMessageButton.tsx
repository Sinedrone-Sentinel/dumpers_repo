import { canOpenDealChat } from '../lib/listingType'
import { requestDealChat } from '../lib/dealChat'
import type { CustomOrder } from '../lib/operations'

interface DealMessageButtonProps {
  order: CustomOrder
  variant?: 'chip' | 'stack'
}

export default function DealMessageButton({ order, variant = 'chip' }: DealMessageButtonProps) {
  if (!canOpenDealChat(order)) return null

  const className =
    variant === 'stack'
      ? 'w-full py-2 site-btn-secondary text-sm'
      : 'px-2 py-1 text-xs bg-sky-950/50 text-sky-300 border border-sky-500/30 rounded'

  return (
    <button
      type="button"
      onClick={() => requestDealChat(order.id)}
      className={className}
    >
      Message
    </button>
  )
}
