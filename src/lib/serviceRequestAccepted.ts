/**
 * Payload contract for service_request_accepted notifications (Phase 3 Accept).
 * accept_service_request must include org + pricing so the requester modal can show them.
 */
export const SERVICE_REQUEST_ACCEPTED_TYPE = 'service_request_accepted'

export const SERVICE_REQUEST_ACCEPTED_EVENT = 'dumpers:service-request-accepted'

export interface ServiceRequestAcceptedDetail {
  notificationId?: string
  serviceRequestId?: string
  serviceLabel: string
  orgName: string
  orgSid?: string
  pricingLabel: string
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function parseServiceRequestAcceptedPayload(
  payload: Record<string, unknown> | null | undefined
): ServiceRequestAcceptedDetail | null {
  if (!payload) return null
  const orgName = asTrimmedString(payload.org_name) ?? asTrimmedString(payload.orgName)
  const pricingLabel =
    asTrimmedString(payload.pricing_label) ??
    asTrimmedString(payload.pricingLabel) ??
    asTrimmedString(payload.price)
  const serviceLabel =
    asTrimmedString(payload.service_label) ??
    asTrimmedString(payload.serviceLabel) ??
    asTrimmedString(payload.service_type_label) ??
    'Service'
  if (!orgName || !pricingLabel) return null
  return {
    serviceRequestId:
      asTrimmedString(payload.service_request_id) ??
      asTrimmedString(payload.serviceRequestId) ??
      undefined,
    serviceLabel,
    orgName,
    orgSid: asTrimmedString(payload.org_sid) ?? asTrimmedString(payload.orgSid) ?? undefined,
    pricingLabel,
  }
}

export function dispatchServiceRequestAccepted(detail: ServiceRequestAcceptedDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SERVICE_REQUEST_ACCEPTED_EVENT, { detail }))
}

const SEEN_KEY = 'dumpers.serviceRequestAcceptedSeen'

export function hasSeenServiceRequestAccepted(notificationId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    if (!raw) return false
    const ids = JSON.parse(raw) as string[]
    return Array.isArray(ids) && ids.includes(notificationId)
  } catch {
    return false
  }
}

export function markSeenServiceRequestAccepted(notificationId: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    const ids = raw ? (JSON.parse(raw) as string[]) : []
    const next = Array.isArray(ids) ? ids : []
    if (!next.includes(notificationId)) {
      next.push(notificationId)
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(next.slice(-40)))
    }
  } catch {
    // ignore storage failures
  }
}
