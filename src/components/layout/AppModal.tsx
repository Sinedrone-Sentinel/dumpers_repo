import React, { useId } from 'react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

export type AppModalSize = 'sm' | 'md' | 'lg'
export type AppModalZIndex = 60 | 70 | 80

const sizeClasses: Record<AppModalSize, string> = {
  sm: 'max-w-md max-h-[min(90dvh,36rem)]',
  md: 'max-w-lg max-h-[min(90dvh,36rem)]',
  lg: 'max-w-xl max-h-[90dvh]',
}

const zIndexClasses: Record<AppModalZIndex, string> = {
  60: 'z-[60]',
  70: 'z-[70]',
  80: 'z-[80]',
}

interface AppModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  size?: AppModalSize
  zIndex?: AppModalZIndex
  children: React.ReactNode
  footer?: React.ReactNode
  headerExtra?: React.ReactNode
  closeOnBackdrop?: boolean
  titleId?: string
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
}: AppModalProps) {
  const generatedId = useId()
  const titleId = titleIdProp ?? generatedId

  useBodyScrollLock(true)

  return (
    <div
      className={`fixed inset-0 bg-black/80 backdrop-blur-sm ${zIndexClasses[zIndex]} flex items-center justify-center p-4 overflow-hidden`}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`bg-slate-900 border border-slate-700 rounded-2xl w-full shadow-2xl flex flex-col min-w-0 ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-3 sm:p-4 border-b border-slate-700 shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-white leading-snug">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {headerExtra}

        <div className="p-3 sm:p-4 overflow-y-auto overscroll-contain flex-1 min-h-0 min-w-0">
          {children}
        </div>

        {footer && (
          <div className="p-3 sm:p-4 border-t border-slate-700 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  )
}
