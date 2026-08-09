import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { UserNotification } from '../lib/operations'
import { getNotificationActionLink } from '../lib/notificationLinks'
import { requestBlueprintFocus } from '../lib/blueprintFocusRequest'
import {
  notifyFriendsChanged,
  openFriendsMenu,
  respondFriendRequest,
} from '../lib/friends'
import {
  SERVICE_REQUEST_ACCEPTED_TYPE,
  dispatchServiceRequestAccepted,
  parseServiceRequestAcceptedPayload,
} from '../lib/serviceRequestAccepted'
import { notifyNotificationsChanged } from '../hooks/useNotificationInbox'

interface NotificationBodyProps {
  notification: UserNotification
  onNavigate?: () => void
  /** Clear this notification after following its action link. */
  onDismissAfterNavigate?: () => void
  onOpenQuestionnaire?: (questionnaireId: string) => void
}

function friendshipIdFromPayload(payload: Record<string, unknown> | null | undefined): string | null {
  const raw = payload?.friendship_id
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export default function NotificationBody({
  notification,
  onNavigate,
  onDismissAfterNavigate,
  onOpenQuestionnaire,
}: NotificationBodyProps) {
  const navigate = useNavigate()
  const [friendBusy, setFriendBusy] = useState(false)
  const [friendError, setFriendError] = useState<string | null>(null)
  const link = getNotificationActionLink(notification)
  const questionnaireId =
    notification.type === 'questionnaire_available' &&
    typeof notification.payload?.questionnaire_id === 'string'
      ? notification.payload.questionnaire_id
      : null
  const acceptedDetail =
    notification.type === SERVICE_REQUEST_ACCEPTED_TYPE
      ? parseServiceRequestAcceptedPayload(notification.payload)
      : null
  const friendshipId = friendshipIdFromPayload(notification.payload)
  const isInboundFriendRequest = notification.type === 'friend_request' && !!friendshipId
  // Outgoing pending Cancel lives in the notification row action (replaces Clear).
  const hasFriendActions = isInboundFriendRequest

  if (
    !notification.body &&
    !link &&
    !questionnaireId &&
    !acceptedDetail &&
    !hasFriendActions &&
    notification.type !== 'friend_request_sent'
  ) {
    return null
  }

  const finishNavigate = () => {
    onNavigate?.()
    onDismissAfterNavigate?.()
  }

  const runFriendAction = async (fn: () => Promise<{ error?: string }>) => {
    setFriendBusy(true)
    setFriendError(null)
    const result = await fn()
    setFriendBusy(false)
    if (result.error) {
      setFriendError(result.error)
      return
    }
    notifyFriendsChanged()
    notifyNotificationsChanged()
    onNavigate?.()
  }

  return (
    <div className="text-xs mt-0.5 text-slate-400 leading-relaxed space-y-1.5">
      {notification.body ? <p>{notification.body}</p> : null}
      {acceptedDetail ? (
        <p className="text-slate-300">
          {acceptedDetail.orgName}
          {acceptedDetail.orgSid ? ` (${acceptedDetail.orgSid})` : ''} —{' '}
          <span className="text-orange-300 font-medium">{acceptedDetail.pricingLabel}</span>
        </p>
      ) : null}
      {acceptedDetail ? (
        <button
          type="button"
          onClick={() => {
            dispatchServiceRequestAccepted({
              ...acceptedDetail,
              notificationId: notification.id,
            })
            onNavigate?.()
          }}
          className="text-cyan-400 hover:text-cyan-300 underline font-medium"
        >
          View acceptance
        </button>
      ) : null}
      {questionnaireId && onOpenQuestionnaire ? (
        <button
          type="button"
          onClick={() => {
            onOpenQuestionnaire(questionnaireId)
            onNavigate?.()
          }}
          className="text-cyan-400 hover:text-cyan-300 underline font-medium"
        >
          Open questionnaire
        </button>
      ) : null}
      {isInboundFriendRequest && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={friendBusy}
            className="site-btn-success text-[10px] px-2 py-1"
            onClick={() => void runFriendAction(() => respondFriendRequest(friendshipId, true))}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={friendBusy}
            className="site-btn-danger text-[10px] px-2 py-1"
            onClick={() => void runFriendAction(() => respondFriendRequest(friendshipId, false))}
          >
            Deny
          </button>
        </div>
      )}
      {friendError ? <p className="text-rose-300/90">{friendError}</p> : null}
      {link && (
        <p>
          <Link
            to={link.to}
            search={link.blueprintFocus ? undefined : link.search}
            onClick={(event) => {
              if (link.openFriendsMenu) {
                event.preventDefault()
                openFriendsMenu()
                finishNavigate()
                return
              }
              if (link.blueprintFocus) {
                event.preventDefault()
                requestBlueprintFocus(link.blueprintFocus)
                void navigate({ to: link.to })
                finishNavigate()
                return
              }
              finishNavigate()
            }}
            className="text-cyan-400 hover:text-cyan-300 underline font-medium"
          >
            {link.label}
          </Link>
        </p>
      )}
    </div>
  )
}