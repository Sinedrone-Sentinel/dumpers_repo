export type NotificationVisualVariant = 'success' | 'error' | null

const LOG_WATCHER_TYPES: Record<string, NotificationVisualVariant> = {
  log_watcher_blueprint_acquired: 'success',
  log_watcher_ambiguous_blueprint: 'error',
  service_request_accepted: 'success',
}

export function getNotificationVisual(type: string): NotificationVisualVariant {
  return LOG_WATCHER_TYPES[type] ?? null
}

interface NotificationIconProps {
  variant: 'success' | 'error'
  className?: string
}

export function NotificationStatusIcon({ variant, className = 'w-4 h-4 shrink-0 mt-0.5' }: NotificationIconProps) {
  if (variant === 'success') {
    return (
      <svg
        className={`${className} text-emerald-400`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    )
  }

  return (
    <svg
      className={`${className} text-red-400`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
