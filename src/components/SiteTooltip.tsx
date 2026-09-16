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
  /** Open even when a modal has registered (help inside that modal). */
  ignoreOverlayPause?: boolean
  /** Click toggles; hover does not open or close. */
  toggleOnClick?: boolean
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

  const midTop = anchorRect.top + anchorRect.height / 2 - panelRect.height / 2
  const clampedTop = Math.max(
    VIEWPORT_PAD,
    Math.min(midTop, window.innerHeight - VIEWPORT_PAD - panelRect.height),
  )

  if (resolvedSide === 'left') {
    let left = anchorRect.left - panelRect.width - GAP
    if (left < VIEWPORT_PAD) {
      left = Math.min(anchorRect.right + GAP, window.innerWidth - VIEWPORT_PAD - panelRect.width)
    }
    return {
      top: clampedTop,
      left,
      resolvedSide,
    }
  }

  return {
    top: clampedTop,
    left: Math.max(VIEWPORT_PAD, Math.min(anchorRect.right + GAP, window.innerWidth - VIEWPORT_PAD - panelRect.width)),
    resolvedSide,
  }
}

export default function SiteTooltip({
  content,
  side = 'top',
  className = '',
  panelClassName = '',
  children,
  ignoreOverlayPause = false,
  toggleOnClick = false,
}: SiteTooltipProps) {
  const overlayPaused = useUiOverlayPaused()
  const paused = overlayPaused && !ignoreOverlayPause
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const tooltipId = useId()
  const touchRef = useRef(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (paused) {
      setOpen(false)
      setPosition(null)
    }
  }, [paused])

  const show = useCallback(() => {
    if (paused || touchRef.current || toggleOnClick) return
    setOpen(true)
  }, [paused, toggleOnClick])

  const hide = useCallback(() => {
    if (toggleOnClick) return
    if (!touchRef.current) {
      setOpen(false)
      setPosition(null)
    }
  }, [toggleOnClick])

  const toggleOpen = useCallback(() => {
    if (paused) return
    setOpen((prev) => {
      if (prev) setPosition(null)
      return !prev
    })
  }, [paused])

  const toggleTouch = useCallback(() => {
    if (paused) return
    touchRef.current = true
    toggleOpen()
    window.setTimeout(() => {
      touchRef.current = false
    }, 300)
  }, [paused, toggleOpen])

  useEffect(() => {
    if (!toggleOnClick || !open) return
    const onDocDown = (event: MouseEvent) => {
      const anchor = anchorRef.current
      if (anchor && event.target instanceof Node && anchor.contains(event.target)) return
      setOpen(false)
      setPosition(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setPosition(null)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [toggleOnClick, open])

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

  const panel = open && !paused ? (
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
      onClick={(event) => {
        if (toggleOnClick) {
          event.stopPropagation()
          toggleOpen()
          return
        }
        if ('ontouchstart' in window) toggleTouch()
      }}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </span>
  )
}
