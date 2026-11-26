import type { StarMapShopPin, StarMapTelemetry } from '../../lib/starMapHighlight'
import { usePanelDrag } from './usePanelDrag'

const PANEL_W = 280
const EDGE = 8

interface Props {
  stop: StarMapShopPin
  telemetry: StarMapTelemetry
  anchor: { sx: number; sy: number }
  bounds: { w: number; h: number }
  zIndex: number
  onRaise: () => void
  onClose: () => void
}

/** Buy and sell lines for one stop on a shopping run or haul. */
export default function StarMapShopPopup({ stop, telemetry, anchor, bounds, zIndex, onRaise, onClose }: Props) {
  const drag = usePanelDrag(stop.markerId)
  const left = anchor.sx + 18 + PANEL_W > bounds.w ? Math.max(EDGE, anchor.sx - 18 - PANEL_W) : anchor.sx + 18
  const top = Math.min(Math.max(EDGE, anchor.sy - 24), Math.max(EDGE, bounds.h - 200))
  return (
    <div
      ref={drag.panelRef}
      className="site-tooltip-panel absolute w-[280px] max-w-[280px]"
      style={{ left, top, zIndex, ...drag.style }}
      role="dialog"
      aria-label={stop.title}
      onPointerDownCapture={onRaise}
    >
      <div {...drag.handleProps} className={`flex items-start justify-between gap-2 ${drag.handleProps.className}`}>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">{stop.title}</div>
          <div className="text-[11px] uppercase tracking-wide text-amber-300">
            {telemetry === 'hauler' ? 'Smart Hauler' : 'Shopping'}
          </div>
        </div>
        <button type="button" className="site-btn-icon !p-1" aria-label="Close" onClick={onClose}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {stop.lines.map((line, index) => (
          <li key={`${index}:${line.action}:${line.label}:${line.where || ''}`} className="text-sm text-slate-200">
            <span className="text-amber-300">{line.action === 'buy' ? 'Buy' : 'Sell'}</span> {line.label}
            {line.where ? <span className="text-slate-400"> at {line.where}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
