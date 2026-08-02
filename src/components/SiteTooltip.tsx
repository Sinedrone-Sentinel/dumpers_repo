import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUiOverlayPaused } from '../contexts/UiOverlayContext'

type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

interface SiteTooltipProps {
  content: React.ReactNode
  side?: TooltipSide
  className?: string
  panelClassName?: string
  children: React.ReactNode
}

const VIEWPORT_PAD = 8
const GAP = 8

interface PanelPosition {
  top: number
  left: number
  resolvedSide: TooltipSide
}

function resolveSide(
  preferred: TooltipSide,
  anchorRect: DOMRect,
  panelRect: DOMRect
): TooltipSide {
  if (preferred === 'top' || preferred === 'bottom') {
    if (preferred === 'top' && anchorRect.top - panelRect.height - GAP < VIEWPORT_PAD) {
      return 'bottom'
    }
    if (
      preferred === 'bottom' &&
      anchorRect.bottom + panelRect.height + GAP > window.innerHeight - VIEWPORT_PAD
    ) {
      return 'top'
    }
    return preferred
  }
  return preferred
}

function computePanelPosition(
  anchorRect: DOMRect,
  panelRect: DOMRect,
  preferredSide: TooltipSide
): PanelPosition {
  const resolvedSide = resolveSide(preferredSide, anchorRect, panelRect)

  if (resolvedSide === 'top') {
    let left = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - VIEWPORT_PAD - panelRect.width))
    return {
      top: anchorRect.top - panelRect.height - GAP,
      left,
      resolvedSide,
    }
  }

  if (resolvedSide === 'bottom') {
    let left = anchorRect.left + anchorRect.width / 2 - panelRect.width / 2
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - VIEWPORT_PAD - panelRect.width))
    return {
      top: anchorRect.bottom + GAP,
      left,
      resolvedSide,
    }
  }

  if (resolvedSide === 'left') {
    return {
      top: anchorRect.top + anchorRect.height / 2 - panelRect.height / 2,
      left: anchorRect.left - panelRect.width - GAP,
      resolvedSide,
    }
  }

  return {
    top: anchorRect.top + anchorRect.height / 2 - panelRect.height / 2,
    left: anchorRect.right + GAP,
    resolvedSide,
  }
}

export default function SiteTooltip({
  content,
  side = 'top',
  className = '',
  panelClassName = '',
  children,
}: SiteTooltipProps) {
  const overlayPaused = useUiOverlayPaused()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const tooltipId = useId()
  const touchRef = useRef(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (overlayPaused) {
      setOpen(false)
      setPosition(null)
    }
  }, [overlayPaused])

  const show = useCallback(() => {
    if (overlayPaused || touchRef.current) return
    setOpen(true)
  }, [overlayPaused])

  const hide = useCallback(() => {
    if (!touchRef.current) {
      setOpen(false)
      setPosition(null)
    }
  }, [])

  const toggleTouch = useCallback(() => {
    if (overlayPaused) return
    touchRef.current = true
    setOpen((prev) => {
      if (prev) setPosition(null)
      return !prev
    })
    window.setTimeout(() => {
      touchRef.current = false
    }, 300)
  }, [overlayPaused])

  useLayoutEffect(() => {
    if (!open) return

    let rafId = 0
    let pending = false

    const updatePosition = () => {
      pending = false
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (!anchor || !panel) return
      setPosition(computePanelPosition(anchor.getBoundingClientRect(), panel.getBoundingClientRect(), side))
    }

    const scheduleUpdate = () => {
      if (pending) return
      pending = true
      rafId = window.requestAnimationFrame(updatePosition)
    }

    updatePosition()
    window.addEventListener('scroll', scheduleUpdate, true)
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      pending = false
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', scheduleUpdate, true)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [open, side, content])

  const panel = open && !overlayPaused ? (
    <span
      ref={panelRef}
      id={tooltipId}
      role="tooltip"
      style={
        position
          ? { position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }
          : { position: 'fixed', top: -9999, left: -9999, visibility: 'hidden', zIndex: 9999 }
      }
      className={`site-tooltip-panel pointer-events-none ${panelClassName}`}
    >
      {content}
    </span>
  ) : null

  return (
    <span
      ref={anchorRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={() => {
        if ('ontouchstart' in window) toggleTouch()
      }}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </span>
  )
}
