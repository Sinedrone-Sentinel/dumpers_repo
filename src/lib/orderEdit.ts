import type { CustomOrder } from './operations'

/** Requester may edit or delete before anyone accepts. */
export function canRequesterModifyOrder(order: CustomOrder): boolean {
  return order.status === 'pending' && order.assignee_id == null
}
