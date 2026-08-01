import React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { UserNotification } from '../lib/operations'
import { getNotificationActionLink } from '../lib/notificationLinks'
import { requestBlueprintFocus } from '../lib/blueprintFocusRequest'
import {
  SERVICE_REQUEST_ACCEPTED_TYPE,
  dispatchServiceRequestAccepted,
  parseServiceRequestAcceptedPayload,
} from '../lib/serviceRequestAccepted'

interface NotificationBodyProps {
  notification: UserNotification
  onNavigate?: () => void
  /** Clear this notification after following its action link. */
  onDismissAfterNavigate?: () => void
  onOpenQuestionnaire?: (questionnaireId: string) => void
}

export default function NotificationBody({
  notification,
  onNavigate,
  onDismissAfterNavigate,
  onOpenQuestionnaire,
}: NotificationBodyProps) {
  const navigate = useNavigate()
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

  if (!notification.body && !link && !questionnaireId && !acceptedDetail) return null

  const finishNavigate = () => {
    onNavigate?.()
    onDismissAfterNavigate?.()
  }

  return (
    <p className="text-xs mt-0.5 text-slate-400 leading-relaxed">
      {notification.body}
      {acceptedDetail ? (
        <>
          {notification.body ? ' ' : null}
          <span className="text-slate-300">
            {acceptedDetail.orgName}
            {acceptedDetail.orgSid ? ` (${acceptedDetail.orgSid})` : ''} —{' '}
            <span className="text-orange-300 font-medium">{acceptedDetail.pricingLabel}</span>
          </span>
        </>
      ) : null}
      {notification.body || acceptedDetail
        ? link || questionnaireId || acceptedDetail
          ? ' '
          : null
        : null}
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
      {link && (
        <Link
          to={link.to}
          search={link.blueprintFocus ? undefined : link.search}
          onClick={(event) => {
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
      )}
    </p>
  )
}
