import React, { useId } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useUiOverlayRegistration } from '../../contexts/UiOverlayContext'

export type AppModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
export type AppModalZIndex = 60 | 70 | 80

const sizeClasses: Record<AppModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-4xl',
  '3xl': 'max-w-[min(94vw,80rem)]',
}

const modalShellClasses: Record<AppModalSize, string> = {
  sm: 'max-h-[min(88dvh,calc(100dvh-var(--site-ticker-height,0px)-2rem))] overflow-hidden',
  md: 'max-h-[min(88dvh,calc(100dvh-var(--site-ticker-height,0px)-2rem))] overflow-hidden',
  lg: 'max-h-[min(88dvh,calc(100dvh-var(--site-ticker-height,0px)-2rem))] overflow-hidden',
  xl: 'max-h-[min(88dvh,calc(100dvh-var(--site-ticker-height,0px)-2rem))] overflow-hidden',
  '2xl': 'max-h-[min(88dvh,calc(100dvh-var(--site-ticker-height,0px)-2rem))] overflow-hidden',
  '3xl': 'max-h-[min(86dvh,calc(100dvh-var(--site-ticker-height,0px)-2.5rem))] overflow-hidden',
}

const zIndexClasses: Record<AppModalZIndex, string> = {
  60: 'z-[60]',
  70: 'z-[70]',
  80: 'z-[80]',
}

interface AppModalProps {
  title: string
  subtitle?: React.ReactNode
  onClose: () => void
  size?: AppModalSize
  zIndex?: AppModalZIndex
  children: React.ReactNode
  footer?: React.ReactNode
  headerExtra?: React.ReactNode
  closeOnBackdrop?: boolean
  titleId?: string
  bodyClassName?: string
  shellClassName?: string
}

export default function AppModal({
  title,
  subtitle,
  onClose,
  size = 'md',
  zIndex = 70,
  children,
  footer,
  headerExtra,
  closeOnBackdrop = true,
  titleId: titleIdProp,
  bodyClassName = '',
  shellClassName = '',
}: AppModalProps) {
  const generatedId = useId()
  const titleId = titleIdProp ?? generatedId
  const overlayId = useId()

  useBodyScrollLock(true)
  useUiOverlayRegistration(overlayId, true)

  // Portal to body — page content uses z-10 under the fixed header (z-40); a
  // fixed z-70 modal inside that shell still paints below the header.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`site-modal-backdrop ${zIndexClasses[zIndex]} flex items-center justify-center p-3 sm:p-4`}
      style={{
        paddingBottom: 'max(0.75rem, calc(var(--site-ticker-height, 0px) + 0.75rem))',
      }}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`site-modal-shell w-full max-w-[min(96vw,100%)] ${sizeClasses[size]} ${shellClassName || modalShellClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-3 sm:p-4 shrink-0 bg-gradient-to-r from-orange-950/45 via-orange-950/20 to-transparent border-b border-orange-500/20">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-amber-50 leading-snug tracking-wide">
              {title}
            </h2>
            {subtitle ? (
              typeof subtitle === 'string' ? (
                <p className="text-xs text-amber-200/45 mt-0.5">{subtitle}</p>
              ) : (
                <div className="mt-1.5">{subtitle}</div>
              )
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="site-chrome-control w-8 h-8 text-lg leading-none shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {headerExtra}

        <div
          className={`p-3 sm:p-4 overflow-y-auto overflow-x-auto overscroll-contain flex-1 min-h-0 min-w-0 ${bodyClassName}`.trim()}
        >
          {children}
        </div>

        {footer && (
          <div className="p-3 sm:p-4 border-t border-orange-500/15 shrink-0 bg-black/20">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
