import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { deleteAllUserNotifications, deleteUserNotification } from '../../lib/operations'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useNotificationInbox } from '../../hooks/useNotificationInbox'
import NotificationBody from '../NotificationBody'
import { getNotificationVisual, NotificationStatusIcon } from '../../lib/notificationPresentation'
import {
  defaultCollapsedCategories,
  groupNotificationsByCategory,
  loadNotificationInboxCollapsed,
  NOTIFICATION_CATEGORIES,
  saveNotificationInboxCollapsed,
  type NotificationCategoryId,
} from '../../lib/notificationCategories'

interface AppNotificationBellProps {
  disabled?: boolean
  onOpenQuestionnaire?: (questionnaireId: string) => void
}

export default function AppNotificationBell({
  disabled = false,
  onOpenQuestionnaire,
}: AppNotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const collapsedInitializedRef = useRef(false)
  const { notifications, unreadCount, refresh, removeOne } = useNotificationInbox(disabled)
  const routerLocation = useRouterState({ select: (s) => s.location })
  const groupedNotifications = useMemo(
    () => groupNotificationsByCategory(notifications),
    [notifications]
  )
  const [collapsedCategories, setCollapsedCategories] = useState<Set<NotificationCategoryId>>(
    () => loadNotificationInboxCollapsed() ?? new Set()
  )

  const close = useCallback(() => setOpen(false), [])

  useClickOutside(containerRef, open && !disabled, close)

  useEffect(() => {
    close()
  }, [routerLocation.pathname, routerLocation.searchStr, close])

  useEffect(() => {
    if (open && !disabled) void refresh()
  }, [open, disabled, refresh])

  useEffect(() => {
    if (!open || collapsedInitializedRef.current || loadNotificationInboxCollapsed()) return
    collapsedInitializedRef.current = true
    setCollapsedCategories(defaultCollapsedCategories(groupedNotifications))
  }, [open, groupedNotifications])

  const toggleCategory = useCallback((categoryId: NotificationCategoryId) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      saveNotificationInboxCollapsed(next)
      return next
    })
  }, [])

  const handleDismiss = async (notificationId: string) => {
    const result = await deleteUserNotification(notificationId)
    if (!result.error) removeOne(notificationId)
  }

  const handleDismissAll = async () => {
    setLoading(true)
    const result = await deleteAllUserNotifications()
    setLoading(false)
    // Server skips questionnaire_available; refresh so local list matches.
    if (!result.error) void refresh()
  }

  const clearableCount = notifications.filter((n) => n.type !== 'questionnaire_available').length

  const triggerClass = disabled
    ? 'border-slate-700/80 bg-slate-900/50 opacity-50 cursor-not-allowed'
    : 'border-slate-600 bg-slate-800/90 hover:bg-slate-700 transition-colors'

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(!open)
        }}
        aria-label={
          disabled
            ? 'Notifications unavailable until account is approved'
            : unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'Notifications'
        }
        aria-expanded={open}
        className={`relative flex items-center justify-center px-2 py-1 rounded-lg border shadow-md ${triggerClass}`}
      >
        <svg
          className={`w-6 h-6 ${disabled ? 'text-slate-500' : 'text-slate-300'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {!disabled && unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-800"
            aria-hidden
          />
        )}
      </button>

      {open && !disabled && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-800 rounded-xl shadow-xl z-[60] overflow-hidden border border-slate-700">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-700">
            <p className="text-white font-medium text-sm">Notifications</p>
            {clearableCount > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleDismissAll()}
                className="text-xs text-slate-400 hover:text-white disabled:opacity-50"
                title="Does not clear questionnaire prompts"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto overscroll-contain">
            {NOTIFICATION_CATEGORIES.map((category) => {
              const items = groupedNotifications[category.id]
              const isCollapsed = collapsedCategories.has(category.id)

              return (
                <section key={category.id} className="border-b border-slate-700/80 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    aria-expanded={!isCollapsed}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                          isCollapsed ? '-rotate-90' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-300 truncate">{category.label}</span>
                    </div>
                    <span
                      className={`text-[10px] tabular-nums shrink-0 ${
                        items.length > 0 ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {items.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    items.length === 0 ? (
                      <p className="px-4 py-2 text-xs text-slate-600">None</p>
                    ) : (
                      <ul>
                        {items.map((notification) => {
                          const visual = getNotificationVisual(notification.type)
                          const isQuestionnaire = notification.type === 'questionnaire_available'
                          return (
                            <li
                              key={notification.id}
                              className="border-t border-slate-700/50 px-4 py-3 text-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex gap-2">
                                  {visual && <NotificationStatusIcon variant={visual} />}
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-200">{notification.title}</p>
                                    <NotificationBody
                                      notification={notification}
                                      onNavigate={close}
                                      onDismissAfterNavigate={
                                        isQuestionnaire
                                          ? undefined
                                          : () => void handleDismiss(notification.id)
                                      }
                                      onOpenQuestionnaire={onOpenQuestionnaire}
                                    />
                                  </div>
                                </div>
                                {!isQuestionnaire && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDismiss(notification.id)}
                                    className="shrink-0 text-xs text-purple-300 hover:text-purple-200"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
