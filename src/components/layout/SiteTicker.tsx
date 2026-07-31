import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SiteTickerItem, SiteTickerWhatsNew } from '../../lib/whatsNew'
import SiteTickerDetailModal from './SiteTickerDetailModal'

const HOLD_MS = 2500
const MARQUEE_PX_PER_SEC = 48
const VERTICAL_MS = 420
const SLIDE_BACK_MS = 500

type Props = {
  items: SiteTickerItem[]
  onOpenQuestionnaire: (id: string) => void
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function SiteTicker({ items, onOpenQuestionnaire }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const itemsRef = useRef(items)
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<SiteTickerWhatsNew | null>(null)
  const [xOffset, setXOffset] = useState(0)
  const [yPhase, setYPhase] = useState<'in' | 'out' | 'idle'>('idle')
  const timers = useRef<number[]>([])
  const reduced = prefersReducedMotion()

  itemsRef.current = items

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }

  useLayoutEffect(() => {
    const el = barRef.current
    if (!el || items.length === 0) {
      document.documentElement.style.setProperty('--site-ticker-height', '0px')
      return
    }
    const sync = () => {
      document.documentElement.style.setProperty(
        '--site-ticker-height',
        `${el.getBoundingClientRect().height}px`
      )
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.setProperty('--site-ticker-height', '0px')
    }
  }, [items.length])

  useEffect(() => {
    if (items.length === 0) {
      setExpanded(false)
      indexRef.current = 0
      setIndex(0)
      return
    }
    if (indexRef.current >= items.length) {
      indexRef.current = 0
      setIndex(0)
    }
  }, [items.length])

  useEffect(() => {
    if (expanded || items.length === 0) {
      clearTimers()
      setXOffset(0)
      setYPhase('idle')
      return
    }

    if (reduced) {
      clearTimers()
      setXOffset(0)
      setYPhase('idle')
      return
    }

    let cancelled = false
    clearTimers()

    const setIdx = (next: number) => {
      indexRef.current = next
      setIndex(next)
    }

    const runHoldAndMarquee = () => {
      if (cancelled) return
      setYPhase('in')
      setXOffset(0)

      schedule(() => {
        if (cancelled) return
        const viewport = viewportRef.current
        const text = textRef.current
        const overflow = viewport && text ? text.scrollWidth - viewport.clientWidth : 0

        const afterMarquee = (didMarquee: boolean) => {
          if (cancelled) return
          const list = itemsRef.current
          if (list.length <= 1) {
            if (didMarquee) {
              setXOffset(0)
              schedule(() => runHoldAndMarquee(), SLIDE_BACK_MS + HOLD_MS)
            } else {
              schedule(() => runHoldAndMarquee(), HOLD_MS)
            }
            return
          }

          setYPhase('out')
          schedule(() => {
            if (cancelled) return
            const next = (indexRef.current + 1) % list.length
            setIdx(next)
            setXOffset(0)
            setYPhase('in')
            schedule(() => runHoldAndMarquee(), VERTICAL_MS)
          }, VERTICAL_MS)
        }

        if (overflow > 4) {
          const duration = Math.max(1200, (overflow / MARQUEE_PX_PER_SEC) * 1000)
          setXOffset(-overflow)
          schedule(() => {
            schedule(() => afterMarquee(true), HOLD_MS)
          }, duration)
        } else {
          schedule(() => afterMarquee(false), HOLD_MS)
        }
      }, HOLD_MS)
    }

    runHoldAndMarquee()

    return () => {
      cancelled = true
      clearTimers()
    }
  }, [expanded, items, reduced])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  if (items.length === 0) return null

  const current = items[Math.min(index, items.length - 1)]

  const openItem = (item: SiteTickerItem) => {
    if (item.type === 'questionnaire') {
      setExpanded(false)
      onOpenQuestionnaire(item.questionnaireId)
      return
    }
    setDetail(item)
  }

  const marqueeDuration =
    xOffset === 0
      ? `${SLIDE_BACK_MS}ms`
      : `${Math.max(1200, (Math.abs(xOffset) / MARQUEE_PX_PER_SEC) * 1000)}ms`

  return (
    <>
      {expanded ? (
        <button
          type="button"
          className="fixed inset-0 z-[48] bg-black/40"
          aria-label="Close ticker list"
          onClick={() => setExpanded(false)}
        />
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-[49] flex flex-col justify-end pointer-events-none">
        {expanded ? (
          <div
            className="pointer-events-auto mx-auto w-full max-w-[92vw] border border-b-0 border-orange-500/30 bg-slate-950/98 shadow-2xl shadow-black/50 rounded-t-xl overflow-hidden"
            role="listbox"
            aria-label="Site updates"
          >
            <div className="max-h-[min(50vh,22rem)] overflow-y-auto overscroll-contain divide-y divide-slate-800">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800/80 transition-colors"
                  onClick={() => openItem(item)}
                >
                  <span className="font-medium">{item.headline}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div
          ref={barRef}
          className="pointer-events-auto border-t border-orange-500/30 bg-slate-950/98"
        >
          <div className="site-shell">
            <button
              type="button"
              className="w-full h-9 flex items-center gap-2 text-left"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse site updates' : 'Expand site updates'}
            >
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-orange-400/90">
                Updates
              </span>
              <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-hidden h-5">
                <div
                  className={`absolute left-0 top-0 w-full ${
                    yPhase === 'out'
                      ? 'site-ticker-scroll-out'
                      : yPhase === 'in'
                        ? 'site-ticker-scroll-in'
                        : ''
                  }`}
                >
                  <div
                    ref={textRef}
                    className="whitespace-nowrap text-xs sm:text-sm text-slate-200 font-medium"
                    style={
                      reduced
                        ? { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }
                        : {
                            transform: `translateX(${xOffset}px)`,
                            transition: `transform ${marqueeDuration} linear`,
                          }
                    }
                    title={current.headline}
                  >
                    {current.headline}
                  </div>
                </div>
              </div>
              <span
                className={`shrink-0 text-slate-500 text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden
              >
                ▲
              </span>
            </button>
          </div>
        </div>
      </div>

      {detail ? <SiteTickerDetailModal item={detail} onClose={() => setDetail(null)} /> : null}
    </>
  )
}
