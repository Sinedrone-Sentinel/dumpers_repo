import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

const EDGE = 4

interface DragStart {
  pointerX: number
  pointerY: number
  x: number
  y: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Drag a map popup by its top bar. The offset stays inside the map and goes
 * back to zero when `resetKey` changes (a different place was opened).
 */
export function usePanelDrag(resetKey: unknown) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const start = useRef<DragStart | null>(null)

  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    start.current = null
  }, [resetKey])

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return
    const panel = panelRef.current
    const box = (panel?.offsetParent as HTMLElement | null)?.getBoundingClientRect()
    if (!panel || !box) return
    const rect = panel.getBoundingClientRect()
    start.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      x: offset.x,
      y: offset.y,
      minX: offset.x + box.left + EDGE - rect.left,
      maxX: offset.x + box.right - EDGE - rect.right,
      minY: offset.y + box.top + EDGE - rect.top,
      maxY: offset.y + box.bottom - EDGE - Math.min(rect.bottom, rect.top + 40),
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const s = start.current
    if (!s) return
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
    setOffset({
      x: clamp(s.x + e.clientX - s.pointerX, s.minX, s.maxX),
      y: clamp(s.y + e.clientY - s.pointerY, s.minY, s.maxY),
    })
  }

  const end = () => {
    start.current = null
  }

  const style: CSSProperties = offset.x || offset.y ? { translate: `${offset.x}px ${offset.y}px` } : {}

  return {
    panelRef,
    style,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      className: 'cursor-move touch-none select-none',
    },
  }
}
