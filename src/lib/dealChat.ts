export const DEAL_CHAT_OPEN_EVENT = 'dumpers:open-deal-chat'
export const ORDER_DEAL_MESSAGE_TYPE = 'order_deal_message'

export type DealChatOpenDetail = {
  orderId: string
}

export function requestDealChat(orderId: string): void {
  if (typeof window === 'undefined' || !orderId) return
  window.dispatchEvent(new CustomEvent<DealChatOpenDetail>(DEAL_CHAT_OPEN_EVENT, { detail: { orderId } }))
}

export function orderIdFromDealNotificationPayload(
  payload: Record<string, unknown> | null | undefined
): string | null {
  const raw = payload?.order_id
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}
