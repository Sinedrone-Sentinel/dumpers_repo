import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ICON_PX,
  TELEMETRY_ICON_PX,
  ORB_KINDS,
  STAR_MAP_COLORS,
  STAR_MAP_POI_ORDER,
  beltPxPerM,
  blinkAlpha,
  boxZoomCamera,
  declutterMarkers,
  displayPositionM,
  orbDisplayRadiusPx,
  starMapFocusCenter,
  starMapFocusHalfM,
  starMapJumpDestination,
  starMapMarkerLabel,
  starMapMarkerReadout,
  starMapMarkerShown,
  starMapPoiGroup,
  systemBodyScale,
  type ProjectedMarker,
  type StarMapCamera,
  type StarMapIndex,
  type StarMapMarker,
  type StarMapPoiGroup,
  type StarMapSystem,
} from '../../lib/starMap'
import { groupShopPins, routeLegTone, routeSegmentsInSystem, type StarMapShopStop, type StarMapTelemetry } from '../../lib/starMapHighlight'
import { STAR_MAP_ICON_PATHS, drawStarMapIcon, drawTelemetryIcon, strokeTelemetryLink } from './starMapIcons'
import { paintBelt, paintBody, paintStar, paintStarfield } from './starMapPaint'
import SiteTooltip from '../SiteTooltip'

interface Props {
  system: StarMapSystem
  index: StarMapIndex
  markedIds: ReadonlySet<string>
  routePoints: StarMapMarker[]
  /** Stops drawn as a temporary icon. Click one for the buy or sell list. */
  shops?: StarMapShopStop[]
  /** Menu icon drawn inside the shared telemetry frame. */
  telemetry?: StarMapTelemetry
  /** Place the bright route leg ends at. Earlier legs are dim. */
  active?: string
  /** Open zoomed out to the whole system, ignoring marks and route. */
  wholeSystem?: boolean
  /** A new value refits the view to the current stops. */
  focusId?: number
  onBack: () => void
  onJump: (marker: StarMapMarker) => void
}

type Cam = StarMapCamera

const DRAG_THRESHOLD_PX = 4
const FIT_PADDING_PX = 32
const MAX_ZOOM_FACTOR = 5_000_000
const MIN_BELT_HALF_PX = 3
const MIN_BOX_PX = 6
const MIN_BELT_LABEL_RADIUS_PX = 40

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
  shops,
  telemetry = 'shopping',
  active,
  wholeSystem,
  focusId = 0,
  onBack,
  onJump,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const camRef = useRef<Cam | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedShop, setSelectedShop] = useState<number | null>(null)
  const shopHitsRef = useRef<{ index: number; sx: number; sy: number }[]>([])
  const shopPins = useMemo(
    () => groupShopPins(shops ?? [], { [system.id]: system }, system.id),
    [shops, system],
  )
  const [poiOn, setPoiOn] = useState<Record<string, boolean>>({})
  const projectedRef = useRef<{ items: ProjectedMarker[]; visible: Set<string> }>({ items: [], visible: new Set() })
  const dragRef = useRef<{ x: number; y: number; cam: Cam; moved: boolean; box: boolean } | null>(null)
  const leftShiftRef = useRef(false)
  const boxElRef = useRef<HTMLDivElement>(null)
  const boxingRef = useRef(false)

  useEffect(() => {
    setSelectedShop(null)
  }, [focusId])

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
  const legend = useMemo(() => {
    const seen = new Map<string, StarMapPoiGroup>()
    for (const m of system.markers) {
      const group = starMapPoiGroup(m)
      if (group && STAR_MAP_ICON_PATHS[group.iconKind]) seen.set(group.id, group)
    }
    const rank = (id: string) => {
      const i = STAR_MAP_POI_ORDER.indexOf(id)
      return i < 0 ? STAR_MAP_POI_ORDER.length : i
    }
    return [...seen.values()].sort((a, b) => rank(a.id) - rank(b.id))
  }, [system])
  const groupOn = useCallback(
    (group: StarMapPoiGroup) => (Object.prototype.hasOwnProperty.call(poiOn, group.id) ? poiOn[group.id] : !group.startsHidden),
    [poiOn],
  )

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

  const focusTargets = useMemo(
    () => (wholeSystem ? [] : system.markers.filter((m) => markedIds.has(m.id) || routeIds.has(m.id))),
    [wholeSystem, system, markedIds, routeIds],
  )
  const focusKey = `${focusId}|${wholeSystem ? 'all' : focusTargets.map((m) => m.id).join(',')}`
  const fittedKey = useRef('')

  // Opening view: the route fills the screen, one stop zooms in, otherwise the whole system.
  // A new focus refits. Scrolling after that is left alone. A jump opens the whole system.
  useEffect(() => {
    if (!fitPxPerM || fittedKey.current === focusKey) return
    fittedKey.current = focusKey
    const center = starMapFocusCenter(focusTargets, { x: starX, y: starY })
    const half = starMapFocusHalfM(system, focusTargets, extentM)
    const pxPerM = focusTargets.length
      ? (Math.min(size.w, size.h) / 2 - FIT_PADDING_PX * 2) / half
      : fitPxPerM
    setCam({ cx: center.x, cy: center.y, pxPerM })
  }, [focusKey, fitPxPerM, focusTargets, system, extentM, size, starX, starY, setCam])

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
      ctx.fillStyle = '#02040c'
      ctx.fillRect(0, 0, size.w, size.h)
      paintStarfield(ctx, size.w, size.h)

      const scale = systemBodyScale(system, cam.pxPerM, fitPxPerM)
      const sc = toScreen(starX, starY, cam)

      // Belts: one translucent band each.
      const beltBands: { marker: StarMapMarker; sx: number; sy: number; midPx: number }[] = []
      for (const m of system.markers) {
        if (m.kind !== 'belt' || !m.innerRadiusM || !m.outerRadiusM) continue
        const parent = m.parentName ? system.markers.find((p) => p.name === m.parentName && ORB_KINDS.has(p.kind)) ?? null : null
        const centre = parent ? displayPositionM(parent, scale) : m
        const c = toScreen(centre.x, centre.y, cam)
        const k = beltPxPerM(m, parent, scale)
        const mid = ((m.outerRadiusM + m.innerRadiusM) / 2) * k
        const half = Math.max(((m.outerRadiusM - m.innerRadiusM) / 2) * k, parent ? 1 : MIN_BELT_HALF_PX)
        const ro = mid + half
        const ri = Math.max(0, mid - half)
        paintBelt(ctx, c.sx, c.sy, ri, ro, t, markedIds.has(m.id) ? blinkAlpha(t) : 0)
        beltBands.push({ marker: m, sx: c.sx, sy: c.sy, midPx: mid })
      }

      // Project bodies and icons.
      const items: ProjectedMarker[] = []
      for (const m of system.markers) {
        if (m.kind === 'belt' || !starMapMarkerShown(m, poiOn)) continue
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

      // Route: the current leg is bright yellow. Legs already traveled are dim.
      if (segments.length) {
        ctx.save()
        ctx.lineCap = 'round'
        ctx.setLineDash([0.1, 10])
        ctx.lineDashOffset = -((t / 40) % 10.1)
        for (const [a, b] of segments) {
          const pa = byId.get(a.id)
          const pb = byId.get(b.id)
          if (!pa || !pb) continue
          const fromIndex = routePoints.findIndex((p, i) => p.id === a.id && routePoints[i + 1]?.id === b.id)
          const tone = routeLegTone(routePoints, fromIndex, active)
          ctx.strokeStyle = tone === 'dim' ? STAR_MAP_COLORS.routeDim : STAR_MAP_COLORS.route
          ctx.lineWidth = tone === 'dim' ? 2 : 3
          ctx.beginPath()
          ctx.moveTo(pa.sx, pa.sy)
          ctx.lineTo(pb.sx, pb.sy)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Orbs. Stars carry a moving surface; planets and moons are lit from the star.
      for (const it of items) {
        if (!ORB_KINDS.has(it.marker.kind) || !visible.has(it.marker.id)) continue
        if (it.marker.kind === 'star') paintStar(ctx, it.sx, it.sy, it.r, t, it.marker.name)
        else paintBody(ctx, it.sx, it.sy, it.r, it.marker.name, sc.sx, sc.sy, t)
      }

      // Icons.
      for (const it of items) {
        if (ORB_KINDS.has(it.marker.kind) || !visible.has(it.marker.id)) continue
        drawStarMapIcon(ctx, it.marker.kind, it.sx, it.sy, ICON_PX, starMapPoiGroup(it.marker)?.color)
      }

      // One pin per body. Every buy and sell there is on that pin, in haul order.
      const shopHits: { index: number; sx: number; sy: number }[] = []
      shopPins.forEach((pin, index) => {
        const marker = system.markers.find((row) => row.id === pin.markerId)
        if (!marker) return
        const at = displayPositionM(marker, scale)
        const p = toScreen(at.x, at.y, cam)
        const body = byId.get(marker.id)
        const fromR = body?.r ?? ICON_PX / 2
        const gap = fromR + TELEMETRY_ICON_PX * 0.75 + 16
        const sx = p.sx + gap
        const sy = p.sy - gap
        strokeTelemetryLink(ctx, p.sx, p.sy, fromR, sx, sy)
        drawTelemetryIcon(ctx, sx, sy, t, telemetry)
        shopHits.push({ index, sx, sy })
      })
      shopHitsRef.current = shopHits

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
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
      ctx.shadowBlur = 4
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
        if (
          it.marker.kind === 'station' ||
          it.marker.kind === 'transit' ||
          it.marker.kind === 'landing' ||
          it.marker.kind === 'comm_array'
        ) {
          return 3
        }
        if (it.marker.kind === 'moon') return 4
        return 5
      }
      const labelOrder = items.filter((it) => visible.has(it.marker.id)).sort((a, b) => rank(a) - rank(b))
      for (const it of labelOrder) {
        const text = starMapMarkerLabel(it.marker)
        const w = ctx.measureText(text).width
        const gap = it.r + 4
        // Right of the marker first, then left, above, below.
        const spots: Box[] = [
          { x: it.sx + gap, y: it.sy - 7, w, h: 14, owner: it.marker.id },
          { x: it.sx - gap - w, y: it.sy - 7, w, h: 14, owner: it.marker.id },
          { x: it.sx - w / 2, y: it.sy - gap - 14, w, h: 14, owner: it.marker.id },
          { x: it.sx - w / 2, y: it.sy + gap, w, h: 14, owner: it.marker.id },
        ]
        const onScreen = spots.filter(
          (s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= size.w && s.y + s.h <= size.h,
        )
        const clear = onScreen.find(
          (s) =>
            !boxes.some(
              (b) => b.owner !== it.marker.id && s.x < b.x + b.w && s.x + s.w > b.x && s.y < b.y + b.h && s.y + s.h > b.y,
            ),
        )
        // Orbital stations keep a name even when the planet disc is the only thing nearby.
        const box = clear ?? (it.marker.kind === 'station' || it.marker.kind === 'transit' || it.marker.kind === 'landing' ? onScreen[0] : undefined)
        if (!box) continue
        boxes.push(box)
        ctx.fillStyle = ORB_KINDS.has(it.marker.kind) ? '#e2e8f0' : 'rgba(203, 213, 225, 0.85)'
        ctx.fillText(text, box.x, box.y + 7)
      }

      // Belt and ring names sit on the band where it crosses the view, nudged along it to dodge other labels.
      const free = (s: Box) =>
        s.x >= 0 &&
        s.y >= 0 &&
        s.x + s.w <= size.w &&
        s.y + s.h <= size.h &&
        !boxes.some((b) => s.x < b.x + b.w && s.x + s.w > b.x && s.y < b.y + b.h && s.y + s.h > b.y)
      for (const band of beltBands) {
        if (band.midPx < MIN_BELT_LABEL_RADIUS_PX && !forced.has(band.marker.id)) continue
        const text = band.marker.name
        const w = ctx.measureText(text).width
        const toCentre = Math.atan2(size.h / 2 - band.sy, size.w / 2 - band.sx)
        const base = Math.hypot(size.w / 2 - band.sx, size.h / 2 - band.sy) < 1 ? -Math.PI / 2 : toCentre
        let placed: Box | null = null
        for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
          const a = base + step * (Math.PI / 24)
          const px = band.sx + Math.cos(a) * band.midPx
          const py = band.sy + Math.sin(a) * band.midPx
          const s: Box = { x: px - w / 2, y: py - 7, w, h: 14, owner: band.marker.id }
          if (free(s)) {
            placed = s
            break
          }
        }
        if (!placed) continue
        boxes.push(placed)
        ctx.fillStyle = STAR_MAP_COLORS.beltLabel
        ctx.fillText(text, placed.x, placed.y + 7)
      }
    },
    [system, size, toScreen, starX, starY, markedIds, routeIds, selectedId, segments, routePoints, shopPins, telemetry, active, planetsByName, fitPxPerM, poiOn],
  )

  // The star surface and belt dust move, so the view redraws continuously.
  useEffect(() => {
    let raf = 0
    const loop = (t: number) => {
      if (!boxingRef.current) draw(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

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
      // A mouse notch is about 100 units. Trackpads send a stream of small values.
      const notches = Math.abs(e.deltaY) >= 50 ? Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) / 100, 4) : e.deltaY / 100
      const next = clampCam({ ...cam, pxPerM: cam.pxPerM * Math.exp(-notches * 0.32) })
      setCam({
        pxPerM: next.pxPerM,
        cx: wx - (mx - size.w / 2) / next.pxPerM,
        cy: wy + (my - size.h / 2) / next.pxPerM,
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [size, clampCam, setCam])

  const shopAt = (mx: number, my: number): number | null => {
    for (let i = shopHitsRef.current.length - 1; i >= 0; i--) {
      const hit = shopHitsRef.current[i]
      if (Math.hypot(mx - hit.sx, my - hit.sy) <= TELEMETRY_ICON_PX * 0.72) return hit.index
    }
    return null
  }

  const hitTest = (mx: number, my: number): StarMapMarker | null => {
    if (shopAt(mx, my)) return null
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
      e.currentTarget.style.cursor = shopAt(e.clientX - rect.left, e.clientY - rect.top) || hitTest(e.clientX - rect.left, e.clientY - rect.top) ? 'pointer' : 'grab'
      return
    }
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    if (drag.box) {
      e.currentTarget.style.cursor = 'crosshair'
      boxingRef.current = true
      const el = boxElRef.current
      if (el) {
        const left = Math.min(drag.x, e.clientX) - rect.left
        const top = Math.min(drag.y, e.clientY) - rect.top
        el.style.display = 'block'
        el.style.transform = `translate(${left}px, ${top}px)`
        el.style.width = `${Math.abs(e.clientX - drag.x)}px`
        el.style.height = `${Math.abs(e.clientY - drag.y)}px`
      }
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
      boxingRef.current = false
      if (boxElRef.current) boxElRef.current.style.display = 'none'
      const left = Math.min(drag.x, e.clientX) - rect.left
      const top = Math.min(drag.y, e.clientY) - rect.top
      const width = Math.abs(e.clientX - drag.x)
      const height = Math.abs(e.clientY - drag.y)
      if (width < MIN_BOX_PX || height < MIN_BOX_PX) return
      setCam(boxZoomCamera(drag.cam, size, { left, top, width, height }))
      return
    }
    if (!drag || drag.moved) return
    const shop = shopAt(e.clientX - rect.left, e.clientY - rect.top)
    if (shop) {
      setSelectedShop(shop)
      setSelectedId(null)
      return
    }
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    setSelectedShop(null)
    setSelectedId(hit ? hit.id : null)
  }

  const shopStop = selectedShop != null ? shopPins[selectedShop] : undefined
  const shopHit = shopStop ? shopHitsRef.current.find((hit) => hit.index === selectedShop) : undefined
  const selected = selectedId ? system.markers.find((m) => m.id === selectedId && starMapMarkerShown(m, poiOn)) : undefined
  const readout = selected ? starMapMarkerReadout(selected) : null
  const cam = camRef.current
  let readoutPos: { left: number; top: number } | null = null
  const anchor = selected && cam && size.w
    ? toScreen(selected.x, selected.y, cam)
    : shopHit
      ? { sx: shopHit.sx, sy: shopHit.sy }
      : null
  if (anchor && size.w) {
    const panelW = 280
    const left = anchor.sx + 18 + panelW > size.w ? Math.max(8, anchor.sx - 18 - panelW) : anchor.sx + 18
    const top = Math.min(Math.max(8, anchor.sy - 24), Math.max(8, size.h - 200))
    readoutPos = { left, top }
  }

  const jumpTarget = selected ? starMapJumpDestination(selected) : null
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
          boxingRef.current = false
          if (boxElRef.current) boxElRef.current.style.display = 'none'
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div
        ref={boxElRef}
        className="absolute left-0 top-0 pointer-events-none border-2 border-dashed border-slate-100/80 bg-slate-100/10"
        style={{ display: 'none' }}
      />

      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="text-lg font-semibold text-slate-100">{system.name}</div>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2">
        <SiteTooltip
          side="bottom"
          content="Scroll to zoom and drag to pan. Hold left Shift and drag a box. That area fills the view."
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

      {legend.length > 0 && (
        <div className="absolute bottom-3 left-3 site-tooltip-panel max-h-[46vh] max-w-[18rem] overflow-y-auto">
          <ul className="grid grid-cols-1 gap-0.5">
            {legend.map((group) => {
              const on = groupOn(group)
              return (
                <li key={group.id}>
                  <SiteTooltip side="right" content={on ? 'Hide these on the map.' : 'Show these on the map.'}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setPoiOn((prev) => ({ ...prev, [group.id]: !on }))
                        setSelectedId((id) => {
                          if (!id) return id
                          const marker = system.markers.find((m) => m.id === id)
                          return marker && starMapPoiGroup(marker)?.id === group.id && on ? null : id
                        })
                      }}
                      className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left ${on ? 'opacity-100' : 'opacity-35'}`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={on ? group.color : '#64748b'}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d={STAR_MAP_ICON_PATHS[group.iconKind]} />
                      </svg>
                      <span className={on ? 'text-slate-100' : 'text-slate-500'}>{group.label}</span>
                    </button>
                  </SiteTooltip>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {shopStop && readoutPos && (
        <div
          className="site-tooltip-panel absolute z-10 w-[280px] max-w-[280px]"
          style={{ left: readoutPos.left, top: readoutPos.top }}
          role="dialog"
          aria-label={shopStop.title}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100">{shopStop.title}</div>
              <div className="text-[11px] uppercase tracking-wide text-amber-300">
                {telemetry === 'hauler' ? 'Smart Hauler' : 'Shopping'}
              </div>
            </div>
            <button type="button" className="site-btn-icon !p-1" aria-label="Close" onClick={() => setSelectedShop(null)}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {shopStop.lines.map((line, index) => (
              <li key={`${index}:${line.action}:${line.label}:${line.where || ''}`} className="text-sm text-slate-200">
                <span className="text-amber-300">{line.action === 'buy' ? 'Buy' : 'Sell'}</span> {line.label}
                {line.where ? <span className="text-slate-400"> at {line.where}</span> : null}
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
          aria-label={starMapMarkerLabel(selected)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100">{starMapMarkerLabel(selected)}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {readout?.subtitle}
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
          {readout?.mission && <p className="mt-2 text-slate-300">{readout.mission}</p>}
          {readout?.description && <p className="mt-2 text-slate-300">{readout.description}</p>}
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
                onClick={() => onJump(jumpTarget && jumpTarget !== selected.toSystem ? { ...selected, toSystem: jumpTarget } : selected)}
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
