import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ICON_PX,
  ORB_KINDS,
  STAR_MAP_COLORS,
  STAR_MAP_ICON_COLORS,
  STAR_MAP_KIND_LABELS,
  beltPxPerM,
  blinkAlpha,
  boxZoomCamera,
  declutterMarkers,
  displayPositionM,
  orbDisplayRadiusPx,
  systemBodyScale,
  type ProjectedMarker,
  type StarMapCamera,
  type StarMapIndex,
  type StarMapKind,
  type StarMapMarker,
  type StarMapSystem,
} from '../../lib/starMap'
import { routeSegmentsInSystem } from '../../lib/starMapHighlight'
import { STAR_MAP_ICON_PATHS, drawStarMapIcon } from './starMapIcons'
import SiteTooltip from '../SiteTooltip'

interface Props {
  system: StarMapSystem
  index: StarMapIndex
  markedIds: ReadonlySet<string>
  routePoints: StarMapMarker[]
  focusMarkerId?: string
  onBack: () => void
  onJump: (marker: StarMapMarker) => void
}

type Cam = StarMapCamera

const DRAG_THRESHOLD_PX = 4
const FIT_PADDING_PX = 32
const MAX_ZOOM_FACTOR = 20000
const FOCUS_ZOOM_FACTOR = 300
const MIN_BELT_HALF_PX = 3
const MIN_BOX_PX = 6

function systemExtentM(system: StarMapSystem, cx: number, cy: number): number {
  let ext = 0
  for (const m of system.markers) {
    const d = Math.hypot(m.x - cx, m.y - cy) + (m.kind === 'belt' ? (m.outerRadiusM ?? 0) : 0)
    ext = Math.max(ext, d)
  }
  return ext || 1
}

function titleCase(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

export default function StarMapSystemView({
  system,
  index,
  markedIds,
  routePoints,
  focusMarkerId,
  onBack,
  onJump,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const camRef = useRef<Cam | null>(null)
  const [camTick, setCamTick] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const projectedRef = useRef<{ items: ProjectedMarker[]; visible: Set<string> }>({ items: [], visible: new Set() })
  const dragRef = useRef<{ x: number; y: number; cam: Cam; moved: boolean; box: boolean } | null>(null)
  const leftShiftRef = useRef(false)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft') leftShiftRef.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft') leftShiftRef.current = false
    }
    const reset = () => {
      leftShiftRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
    }
  }, [])

  const star = useMemo(() => system.markers.find((m) => m.kind === 'star'), [system])
  const starX = star?.x ?? 0
  const starY = star?.y ?? 0
  const extentM = useMemo(() => systemExtentM(system, starX, starY), [system, starX, starY])
  const planetsByName = useMemo(() => {
    const map = new Map<string, StarMapMarker>()
    for (const m of system.markers) if (m.kind === 'planet') map.set(m.name, m)
    return map
  }, [system])
  const segments = useMemo(() => routeSegmentsInSystem(routePoints, system.id), [routePoints, system.id])
  const routeIds = useMemo(() => new Set(segments.flatMap(([a, b]) => [a.id, b.id])), [segments])
  const systemNames = useMemo(() => new Map(index.systems.map((s) => [s.id, s.name])), [index])
  const kindsPresent = useMemo(() => {
    const seen = new Set<StarMapKind>()
    for (const m of system.markers) if (STAR_MAP_ICON_PATHS[m.kind]) seen.add(m.kind)
    return [...seen]
  }, [system])

  const fitPxPerM = size.w && size.h ? (Math.min(size.w, size.h) / 2 - FIT_PADDING_PX) / extentM : 0

  const clampCam = useCallback(
    (cam: Cam): Cam => {
      const pxPerM = Math.min(Math.max(cam.pxPerM, fitPxPerM), fitPxPerM * MAX_ZOOM_FACTOR)
      const lim = extentM
      return {
        pxPerM,
        cx: Math.min(Math.max(cam.cx, starX - lim), starX + lim),
        cy: Math.min(Math.max(cam.cy, starY - lim), starY + lim),
      }
    },
    [fitPxPerM, extentM, starX, starY],
  )

  const setCam = useCallback(
    (cam: Cam) => {
      camRef.current = clampCam(cam)
      setCamTick((n) => n + 1)
    },
    [clampCam],
  )

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Initial camera: focus marker, then marks, then route, else the whole system.
  useEffect(() => {
    if (!fitPxPerM || camRef.current) return
    const focus = focusMarkerId ? system.markers.find((m) => m.id === focusMarkerId) : undefined
    if (focus) {
      setCam({ cx: focus.x, cy: focus.y, pxPerM: fitPxPerM * FOCUS_ZOOM_FACTOR })
      setSelectedId(focus.id)
      return
    }
    const targets = system.markers.filter((m) => markedIds.has(m.id) || routeIds.has(m.id))
    if (targets.length) {
      const reach = (m: StarMapMarker) => (m.kind === 'belt' ? (m.outerRadiusM ?? 0) : 0)
      const xs = targets.flatMap((m) => [m.x - reach(m), m.x + reach(m)])
      const ys = targets.flatMap((m) => [m.y - reach(m), m.y + reach(m)])
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const half = Math.max((maxX - minX) / 2, (maxY - minY) / 2, extentM / 40)
      setCam({
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        pxPerM: (Math.min(size.w, size.h) / 2 - FIT_PADDING_PX * 2) / half,
      })
      return
    }
    setCam({ cx: starX, cy: starY, pxPerM: fitPxPerM })
  }, [fitPxPerM, focusMarkerId, system, markedIds, routeIds, extentM, size, starX, starY, setCam])

  // Re-clamp when the box resizes.
  useEffect(() => {
    if (camRef.current) setCam(camRef.current)
  }, [size, setCam])

  const toScreen = useCallback(
    (x: number, y: number, cam: Cam) => ({
      sx: size.w / 2 + (x - cam.cx) * cam.pxPerM,
      sy: size.h / 2 - (y - cam.cy) * cam.pxPerM,
    }),
    [size],
  )

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current
      const cam = camRef.current
      if (!canvas || !cam || !size.w) return
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
        canvas.width = Math.round(size.w * dpr)
        canvas.height = Math.round(size.h * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#020617'
      ctx.fillRect(0, 0, size.w, size.h)

      const scale = systemBodyScale(system, cam.pxPerM, fitPxPerM)
      const sc = toScreen(starX, starY, cam)

      // Belts: one translucent band each.
      for (const m of system.markers) {
        if (m.kind !== 'belt' || !m.innerRadiusM || !m.outerRadiusM) continue
        const c = toScreen(m.x, m.y, cam)
        const parent = m.parentName ? system.markers.find((p) => p.name === m.parentName && ORB_KINDS.has(p.kind)) ?? null : null
        const k = beltPxPerM(m, parent, scale)
        const mid = ((m.outerRadiusM + m.innerRadiusM) / 2) * k
        const half = Math.max(((m.outerRadiusM - m.innerRadiusM) / 2) * k, parent ? 1 : MIN_BELT_HALF_PX)
        const ro = mid + half
        const ri = Math.max(0, mid - half)
        ctx.beginPath()
        ctx.arc(c.sx, c.sy, ro, 0, Math.PI * 2)
        ctx.arc(c.sx, c.sy, ri, 0, Math.PI * 2, true)
        ctx.fillStyle = STAR_MAP_COLORS.belt
        ctx.fill('evenodd')
        if (markedIds.has(m.id)) {
          ctx.save()
          ctx.globalAlpha = blinkAlpha(t) * 0.45
          ctx.fillStyle = STAR_MAP_COLORS.blink
          ctx.fill('evenodd')
          ctx.restore()
        }
      }

      // Project bodies and icons.
      const items: ProjectedMarker[] = []
      for (const m of system.markers) {
        if (m.kind === 'belt') continue
        const at = displayPositionM(m, scale)
        const p = toScreen(at.x, at.y, cam)
        const r = ORB_KINDS.has(m.kind) ? orbDisplayRadiusPx(m, scale) : ICON_PX / 2
        items.push({ marker: m, sx: p.sx, sy: p.sy, r })
      }
      const forced = new Set<string>([...markedIds, ...routeIds])
      if (selectedId) forced.add(selectedId)
      const visible = declutterMarkers(items, forced)
      projectedRef.current = { items, visible }
      const byId = new Map(items.map((it) => [it.marker.id, it]))

      // Orbits.
      ctx.lineWidth = 1
      ctx.strokeStyle = STAR_MAP_COLORS.orbit
      for (const it of items) {
        if (it.marker.kind !== 'planet') continue
        const r = Math.hypot(it.sx - sc.sx, it.sy - sc.sy)
        ctx.beginPath()
        ctx.arc(sc.sx, sc.sy, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (const it of items) {
        if (it.marker.kind !== 'moon' || !visible.has(it.marker.id)) continue
        const parent = it.marker.parentName ? planetsByName.get(it.marker.parentName) : undefined
        const pp = parent ? byId.get(parent.id) : undefined
        if (!pp) continue
        const r = Math.hypot(it.sx - pp.sx, it.sy - pp.sy)
        if (r < pp.r + 6) continue
        ctx.beginPath()
        ctx.arc(pp.sx, pp.sy, r, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Route: bright yellow dots moving toward the next stop.
      if (segments.length) {
        ctx.save()
        ctx.strokeStyle = STAR_MAP_COLORS.route
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.setLineDash([0.1, 10])
        ctx.lineDashOffset = -((t / 40) % 10.1)
        for (const [a, b] of segments) {
          const pa = byId.get(a.id)
          const pb = byId.get(b.id)
          if (!pa || !pb) continue
          ctx.beginPath()
          ctx.moveTo(pa.sx, pa.sy)
          ctx.lineTo(pb.sx, pb.sy)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Orbs.
      for (const it of items) {
        if (!ORB_KINDS.has(it.marker.kind) || !visible.has(it.marker.id)) continue
        const { sx, sy, r } = it
        const [core, edge] =
          it.marker.kind === 'star'
            ? [STAR_MAP_COLORS.starCore, STAR_MAP_COLORS.star]
            : it.marker.kind === 'planet'
              ? [STAR_MAP_COLORS.planetCore, STAR_MAP_COLORS.planet]
              : [STAR_MAP_COLORS.moonCore, STAR_MAP_COLORS.moon]
        const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
        g.addColorStop(0, core)
        g.addColorStop(1, edge)
        ctx.save()
        if (it.marker.kind === 'star') {
          ctx.shadowColor = STAR_MAP_COLORS.star
          ctx.shadowBlur = r * 1.2
        }
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
        ctx.restore()
      }

      // Icons.
      for (const it of items) {
        if (ORB_KINDS.has(it.marker.kind) || !visible.has(it.marker.id)) continue
        drawStarMapIcon(ctx, it.marker.kind, it.sx, it.sy, ICON_PX)
      }

      // Blink.
      if (markedIds.size) {
        const a = blinkAlpha(t)
        ctx.save()
        ctx.strokeStyle = STAR_MAP_COLORS.blink
        ctx.fillStyle = STAR_MAP_COLORS.blink
        ctx.lineWidth = 2.5
        for (const id of markedIds) {
          const it = byId.get(id)
          if (!it || !visible.has(id)) continue
          ctx.globalAlpha = a
          ctx.beginPath()
          ctx.arc(it.sx, it.sy, it.r + 5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = a * 0.22
          ctx.fill()
        }
        ctx.restore()
      }

      // Selection.
      if (selectedId) {
        const it = byId.get(selectedId)
        if (it) {
          ctx.save()
          ctx.strokeStyle = '#f8fafc'
          ctx.lineWidth = 1.5
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.arc(it.sx, it.sy, it.r + 8, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }

      // Labels: skip any that would overlap a marker or a label already placed.
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      type Box = { x: number; y: number; w: number; h: number; owner: string }
      const boxes: Box[] = []
      for (const it of items) {
        if (!visible.has(it.marker.id)) continue
        boxes.push({ x: it.sx - it.r, y: it.sy - it.r, w: it.r * 2, h: it.r * 2, owner: it.marker.id })
      }
      const rank = (it: ProjectedMarker) => {
        if (it.marker.kind === 'star') return 0
        if (forced.has(it.marker.id)) return 1
        if (it.marker.kind === 'planet') return 2
        if (it.marker.kind === 'moon') return 3
        return 4
      }
      const labelOrder = items.filter((it) => visible.has(it.marker.id)).sort((a, b) => rank(a) - rank(b))
      for (const it of labelOrder) {
        const text = it.marker.name
        const w = ctx.measureText(text).width
        const gap = it.r + 4
        // Right of the marker first, then left, above, below.
        const spots: Box[] = [
          { x: it.sx + gap, y: it.sy - 7, w, h: 14, owner: it.marker.id },
          { x: it.sx - gap - w, y: it.sy - 7, w, h: 14, owner: it.marker.id },
          { x: it.sx - w / 2, y: it.sy - gap - 14, w, h: 14, owner: it.marker.id },
          { x: it.sx - w / 2, y: it.sy + gap, w, h: 14, owner: it.marker.id },
        ]
        const box = spots.find(
          (s) =>
            s.x >= 0 &&
            s.y >= 0 &&
            s.x + s.w <= size.w &&
            s.y + s.h <= size.h &&
            !boxes.some(
              (b) => b.owner !== it.marker.id && s.x < b.x + b.w && s.x + s.w > b.x && s.y < b.y + b.h && s.y + s.h > b.y,
            ),
        )
        if (!box) continue
        boxes.push(box)
        ctx.fillStyle = ORB_KINDS.has(it.marker.kind) ? '#e2e8f0' : 'rgba(203, 213, 225, 0.85)'
        ctx.fillText(text, box.x, box.y + 7)
      }
    },
    [system, size, toScreen, starX, starY, markedIds, routeIds, selectedId, segments, planetsByName, fitPxPerM],
  )

  // Animate while something blinks or a route moves; otherwise redraw on change.
  const animated = markedIds.size > 0 || segments.length > 0
  useEffect(() => {
    if (!animated) {
      draw(0)
      return
    }
    let raf = 0
    const loop = (t: number) => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animated, draw, camTick])

  // Wheel zooms toward the cursor.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = camRef.current
      if (!cam) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const wx = cam.cx + (mx - size.w / 2) / cam.pxPerM
      const wy = cam.cy - (my - size.h / 2) / cam.pxPerM
      const next = clampCam({ ...cam, pxPerM: cam.pxPerM * Math.exp(-e.deltaY * 0.0015) })
      setCam({
        pxPerM: next.pxPerM,
        cx: wx - (mx - size.w / 2) / next.pxPerM,
        cy: wy + (my - size.h / 2) / next.pxPerM,
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [size, clampCam, setCam])

  const hitTest = (mx: number, my: number): StarMapMarker | null => {
    const { items, visible } = projectedRef.current
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (!visible.has(it.marker.id)) continue
      if (Math.hypot(mx - it.sx, my - it.sy) <= Math.max(it.r, 7) + 3) {
        if (!ORB_KINDS.has(it.marker.kind)) return it.marker
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (!visible.has(it.marker.id) || !ORB_KINDS.has(it.marker.kind)) continue
      if (Math.hypot(mx - it.sx, my - it.sy) <= Math.max(it.r, 7) + 3) return it.marker
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !camRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      cam: camRef.current,
      moved: false,
      box: leftShiftRef.current && e.shiftKey,
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    if (!drag) {
      e.currentTarget.style.cursor = hitTest(e.clientX - rect.left, e.clientY - rect.top) ? 'pointer' : 'grab'
      return
    }
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    if (drag.box) {
      e.currentTarget.style.cursor = 'crosshair'
      setBox({
        x0: drag.x - rect.left,
        y0: drag.y - rect.top,
        x1: e.clientX - rect.left,
        y1: e.clientY - rect.top,
      })
      return
    }
    e.currentTarget.style.cursor = 'grabbing'
    setCam({
      pxPerM: drag.cam.pxPerM,
      cx: drag.cam.cx - dx / drag.cam.pxPerM,
      cy: drag.cam.cy + dy / drag.cam.pxPerM,
    })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    e.currentTarget.style.cursor = 'grab'
    const rect = e.currentTarget.getBoundingClientRect()
    if (drag?.box && drag.moved) {
      setBox(null)
      const left = Math.min(drag.x, e.clientX) - rect.left
      const top = Math.min(drag.y, e.clientY) - rect.top
      const width = Math.abs(e.clientX - drag.x)
      if (width < MIN_BOX_PX) return
      setCam(boxZoomCamera(drag.cam, size, { left, top, width }))
      return
    }
    if (!drag || drag.moved) return
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    setSelectedId(hit ? hit.id : null)
  }

  const selected = selectedId ? system.markers.find((m) => m.id === selectedId) : undefined
  const cam = camRef.current
  let readoutPos: { left: number; top: number } | null = null
  if (selected && cam && size.w) {
    const p = toScreen(selected.x, selected.y, cam)
    const panelW = 280
    const left = p.sx + 18 + panelW > size.w ? Math.max(8, p.sx - 18 - panelW) : p.sx + 18
    const top = Math.min(Math.max(8, p.sy - 24), Math.max(8, size.h - 200))
    readoutPos = { left, top }
  }

  const jumpTarget = selected?.kind === 'jump_point' && selected.toSystem ? selected.toSystem : null
  const jumpTargetName = jumpTarget ? systemNames.get(jumpTarget) : undefined

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        style={{ cursor: 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null
          setBox(null)
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {box && (
        <div
          className="absolute pointer-events-none border-2 border-dashed border-slate-100/80"
          style={{
            left: Math.min(box.x0, box.x1),
            top: Math.min(box.y0, box.y1),
            width: Math.abs(box.x1 - box.x0),
            height: Math.abs(box.y1 - box.y0),
          }}
        />
      )}

      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="text-lg font-semibold text-slate-100">{system.name}</div>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2">
        <SiteTooltip
          side="bottom"
          content="Scroll to zoom and drag to pan. Hold left Shift and drag a box to zoom into that area."
        >
          <span
            className="site-btn-icon !p-1.5 rounded-lg text-xs font-semibold text-slate-300 cursor-help"
            tabIndex={0}
            aria-label="Map controls"
          >
            ?
          </span>
        </SiteTooltip>
        <button type="button" onClick={onBack} className="site-btn-secondary rounded-lg text-sm">
          Back
        </button>
      </div>

      {kindsPresent.length > 0 && (
        <div className="absolute bottom-3 left-3 site-tooltip-panel pointer-events-none max-w-[16rem]">
          <ul className="grid grid-cols-1 gap-1">
            {kindsPresent.map((kind) => (
              <li key={kind} className="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={STAR_MAP_ICON_COLORS[kind]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={STAR_MAP_ICON_PATHS[kind]} />
                </svg>
                <span>{STAR_MAP_KIND_LABELS[kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && readoutPos && (
        <div
          className="site-tooltip-panel absolute z-10 w-[280px] max-w-[280px]"
          style={{ left: readoutPos.left, top: readoutPos.top }}
          role="dialog"
          aria-label={selected.name}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100">{selected.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {STAR_MAP_KIND_LABELS[selected.kind]}
                {selected.parentName ? ` · ${selected.parentName}` : ''}
              </div>
            </div>
            <button
              type="button"
              className="site-btn-icon !p-1"
              aria-label="Close"
              onClick={() => setSelectedId(null)}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {selected.description && <p className="mt-2 text-slate-300">{selected.description}</p>}
          {selected.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-slate-300">
              {selected.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {jumpTarget &&
            (jumpTargetName ? (
              <button
                type="button"
                className="site-btn-primary mt-3 w-full !px-3 !py-2 text-xs"
                onClick={() => onJump(selected)}
              >
                Jump to {jumpTargetName}
              </button>
            ) : (
              <p className="mt-2 text-slate-400">Leads to {titleCase(jumpTarget)}</p>
            ))}
        </div>
      )}
    </div>
  )
}
