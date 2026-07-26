import React from 'react'
import { Link } from '@tanstack/react-router'
import type { UserNotification } from '../lib/operations'
import { getNotificationActionLink } from '../lib/notificationLinks'

interface NotificationBodyProps {
  notification: UserNotification
  onNavigate?: () => void
  onOpenQuestionnaire?: (questionnaireId: string) => void
}

export default function NotificationBody({
  notification,
  onNavigate,
  onOpenQuestionnaire,
}: NotificationBodyProps) {
  const link = getNotificationActionLink(notification)
  const questionnaireId =
    notification.type === 'questionnaire_available' &&
    typeof notification.payload?.questionnaire_id === 'string'
      ? notification.payload.questionnaire_id
      : null

  if (!notification.body && !link && !questionnaireId) return null

  return (
    <p className="text-xs mt-0.5 text-slate-400 leading-relaxed">
      {notification.body}
      {notification.body && (link || questionnaireId) ? ' ' : null}
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
          search={link.search}
          onClick={onNavigate}
          className="text-cyan-400 hover:text-cyan-300 underline font-medium"
        >
          {link.label}
        </Link>
      )}

    </p>
  )
}
