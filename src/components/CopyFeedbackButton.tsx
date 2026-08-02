import React, { useCallback, useEffect, useRef, useState } from 'react'

type CopyFeedbackButtonVariant = 'primary' | 'danger'

interface CopyFeedbackButtonProps {
  label: string
  copiedLabel?: string
  onCopy: () => Promise<void>
  variant?: CopyFeedbackButtonVariant
  disabled?: boolean
  className?: string
}

const variantClasses: Record<CopyFeedbackButtonVariant, string> = {
  primary: 'site-btn-secondary',
  danger: 'site-btn-danger',
}

export default function CopyFeedbackButton({
  label,
  copiedLabel = 'Copied!',
  onCopy,
  variant = 'primary',
  disabled = false,
  className = '',
}: CopyFeedbackButtonProps) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleClick = useCallback(async () => {
    if (loading || disabled) return

    setLoading(true)
    try {
      await onCopy()
      setCopied(true)
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        resetTimerRef.current = null
      }, 4000)
    } finally {
      setLoading(false)
    }
  }, [disabled, loading, onCopy])

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || loading}
      className={`${variantClasses[variant]} py-2.5 ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
