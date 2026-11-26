import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StarMapIndex, StarMapSystemSummary } from '../../lib/starMap'
import { paintStar } from './starMapPaint'
import { containWheel } from './containWheel'
import { usePanelDrag } from './usePanelDrag'

interface Props {
  index: StarMapIndex
  onEnter: (systemId: string) => void
}

type Vec = { x: number; y: number; z: number }
type Cam = { yaw: number; pitch: number; dist: number; target: Vec }

const ORB_WORLD_R = 10
const FOV_RAD = (50 * Math.PI) / 180
const DRAG_THRESHOLD_PX = 4
const FIT_PADDING_PX = 36
const MAX_ORB_VIEW_FRACTION = 0.35
const ANIM_MS = 450

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z)
const norm = (a: Vec): Vec => mul(a, 1 / (len(a) || 1))

function cameraBasis(cam: Cam) {
  const offset: Vec = {
    x: Math.cos(cam.pitch) * Math.sin(cam.yaw) * cam.dist,
    y: Math.sin(cam.pitch) * cam.dist,
    z: Math.cos(cam.pitch) * Math.cos(cam.yaw) * cam.dist,
  }
  const eye = add(cam.target, offset)
  const forward = norm(sub(cam.target, eye))
  const right = norm(cross(forward, { x: 0, y: 1, z: 0 }))
  const up = cross(right, forward)
  return { eye, forward, right, up }
}

function hashStars(count: number) {
  const out: { x: number; y: number; a: number }[] = []
  let s = 1337
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  for (let i = 0; i < count; i++) out.push({ x: rnd(), y: rnd(), a: 0.2 + rnd() * 0.6 })
  return out
}

const BACKDROP = hashStars(220)

export default function StarMapOverview({ index, onEnter }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const camRef = useRef<Cam | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const savedCamRef = useRef<Cam | null>(null)
  const animRef = useRef(0)
  const dragRef = useRef<{ x: number; y: number; button: number; cam: Cam; moved: boolean } | null>(null)
  const projectedRef = useRef<{ sys: StarMapSystemSummary; sx: number; sy: number; r: number }[]>([])

  const extent = useMemo(() => {
    let e = 0
    for (const s of index.systems) e = Math.max(e, len(s.overview))
    return e + ORB_WORLD_R * 2
  }, [index])

  const focal = size.h ? size.h / 2 / Math.tan(FOV_RAD / 2) : 1
  const minSide = Math.min(size.w, size.h) || 1
  const maxDist = extent + (extent * focal) / Math.max(40, minSide / 2 - FIT_PADDING_PX)
  const minDist = ORB_WORLD_R + (2 * ORB_WORLD_R * focal) / (MAX_ORB_VIEW_FRACTION * minSide)

  const clampCam = useCallback(
    (cam: Cam): Cam => {
      const dist = Math.min(Math.max(cam.dist, minDist), maxDist)
      const pitch = Math.min(Math.max(cam.pitch, -1.45), 1.45)
      // Room to pan shrinks to zero as the view reaches the fit-all distance.
      const room = maxDist > minDist ? extent * ((maxDist - dist) / (maxDist - minDist)) : 0
      const t = cam.target
      const tl = len(t)
      const target = tl > room ? mul(t, room / (tl || 1)) : t
      return { yaw: cam.yaw, pitch, dist, target }
    },
    [minDist, maxDist, extent],
  )

  const setCam = useCallback(
    (cam: Cam) => {
      camRef.current = clampCam(cam)
    },
    [clampCam],
  )

  const animateTo = useCallback(
    (to: Cam) => {
      const from = camRef.current
      if (!from) return setCam(to)
      cancelAnimationFrame(animRef.current)
      const start = performance.now()
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / ANIM_MS)
        const e = 1 - Math.pow(1 - k, 3)
        const lerp = (a: number, b: number) => a + (b - a) * e
        setCam({
          yaw: lerp(from.yaw, to.yaw),
          pitch: lerp(from.pitch, to.pitch),
          dist: lerp(from.dist, to.dist),
          target: {
            x: lerp(from.target.x, to.target.x),
            y: lerp(from.target.y, to.target.y),
            z: lerp(from.target.z, to.target.z),
          },
        })
        if (k < 1) animRef.current = requestAnimationFrame(step)
      }
      animRef.current = requestAnimationFrame(step)
    },
    [setCam],
  )

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!size.w) return
    if (!camRef.current) {
      setCam({ yaw: 0, pitch: 0.55, dist: maxDist, target: { x: 0, y: 0, z: 0 } })
    } else {
      setCam(camRef.current)
    }
  }, [size, maxDist, setCam])

  const project = useCallback(
    (p: Vec, cam: Cam) => {
      const { eye, forward, right, up } = cameraBasis(cam)
      const v = sub(p, eye)
      const z = dot(v, forward)
      if (z <= 0.01) return null
      const k = focal / z
      return { sx: size.w / 2 + dot(v, right) * k, sy: size.h / 2 - dot(v, up) * k, k, z }
    },
    [focal, size],
  )

  const drawRef = useRef<(t: number) => void>(() => {})
  drawRef.current = (t: number) => {
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
    for (const s of BACKDROP) {
      ctx.fillStyle = `rgba(226, 232, 240, ${s.a})`
      ctx.fillRect(s.x * size.w, s.y * size.h, 1, 1)
    }

    const bySys = new Map(index.systems.map((s) => [s.id, s]))
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
    ctx.lineWidth = 1.5
    const drawn = new Set<string>()
    for (const l of index.links) {
      const key = [l.from, l.to].sort().join('>')
      if (drawn.has(key)) continue
      drawn.add(key)
      const a = bySys.get(l.from)
      const b = bySys.get(l.to)
      if (!a || !b) continue
      const pa = project(a.overview, cam)
      const pb = project(b.overview, cam)
      if (!pa || !pb) continue
      ctx.beginPath()
      ctx.moveTo(pa.sx, pa.sy)
      ctx.lineTo(pb.sx, pb.sy)
      ctx.stroke()
    }

    const projected: { sys: StarMapSystemSummary; sx: number; sy: number; r: number; z: number }[] = []
    for (const sys of index.systems) {
      const p = project(sys.overview, cam)
      if (!p) continue
      projected.push({ sys, sx: p.sx, sy: p.sy, r: ORB_WORLD_R * p.k, z: p.z })
    }
    projected.sort((a, b) => b.z - a.z)
    projectedRef.current = projected

    for (const it of projected) {
      const { sx, sy, r } = it
      paintStar(ctx, sx, sy, r, t, it.sys.name)
      if (it.sys.id === focusId) {
        ctx.strokeStyle = '#f8fafc'
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.arc(sx, sy, r + 8, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#e2e8f0'
      ctx.fillText(it.sys.name, sx, sy + r + 8)
    }
  }

  useEffect(() => {
    let raf = 0
    const loop = (now: number) => {
      drawRef.current(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    return wrap ? containWheel(wrap) : undefined
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = camRef.current
      if (!cam) return
      cancelAnimationFrame(animRef.current)
      setCam({ ...cam, dist: cam.dist * Math.exp(e.deltaY * 0.0012) })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [setCam])

  const hitTest = (mx: number, my: number): StarMapSystemSummary | null => {
    const list = projectedRef.current
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i]
      if (Math.hypot(mx - it.sx, my - it.sy) <= Math.max(it.r, 10) + 4) return it.sys
    }
    return null
  }

  const focusSystem = (sys: StarMapSystemSummary) => {
    const cam = camRef.current
    if (!cam) return
    if (!focusId) savedCamRef.current = cam
    setFocusId(sys.id)
    animateTo({ ...cam, target: { ...sys.overview }, dist: minDist * 1.5 })
  }

  const closeFocus = () => {
    setFocusId(null)
    const saved = savedCamRef.current
    savedCamRef.current = null
    if (saved) animateTo(saved)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if ((e.button !== 0 && e.button !== 2) || !camRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    cancelAnimationFrame(animRef.current)
    dragRef.current = { x: e.clientX, y: e.clientY, button: e.button, cam: camRef.current, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) {
      const rect = e.currentTarget.getBoundingClientRect()
      e.currentTarget.style.cursor = hitTest(e.clientX - rect.left, e.clientY - rect.top) ? 'pointer' : 'default'
      return
    }
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    if (drag.button === 2) {
      setCam({ ...drag.cam, yaw: drag.cam.yaw - dx * 0.006, pitch: drag.cam.pitch + dy * 0.006 })
      return
    }
    const { right, up } = cameraBasis(drag.cam)
    const worldPerPx = drag.cam.dist / focal
    const move = add(mul(right, -dx * worldPerPx), mul(up, dy * worldPerPx))
    setCam({ ...drag.cam, target: add(drag.cam.target, move) })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || drag.moved || drag.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) focusSystem(hit)
  }

  const focused = focusId ? index.systems.find((s) => s.id === focusId) : undefined
  const cardDrag = usePanelDrag(focusId)
  let readoutPos: { left: number; top: number } | null = null
  if (focused && camRef.current && size.w) {
    const p = project(focused.overview, camRef.current)
    if (p) {
      const r = ORB_WORLD_R * p.k
      const panelW = 300
      const left = p.sx + r + 20 + panelW > size.w ? Math.max(8, p.sx - r - 20 - panelW) : p.sx + r + 20
      readoutPos = { left, top: Math.min(Math.max(8, p.sy - 40), Math.max(8, size.h - 180)) }
    }
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {focused && readoutPos && (
        <div
          ref={cardDrag.panelRef}
          className="site-tooltip-panel absolute z-10 w-[300px] max-w-[300px]"
          style={{ left: readoutPos.left, top: readoutPos.top, ...cardDrag.style }}
          role="dialog"
          aria-label={focused.name}
        >
          <div {...cardDrag.handleProps} className={`flex items-start justify-between gap-2 ${cardDrag.handleProps.className}`}>
            <div className="text-sm font-semibold text-slate-100">{focused.name}</div>
            <button type="button" className="site-btn-icon !p-1" aria-label="Close" onClick={closeFocus}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {focused.description && <p className="mt-2 text-slate-300">{focused.description}</p>}
          <button
            type="button"
            className="site-btn-primary mt-3 w-full !px-3 !py-2 text-xs"
            onClick={() => onEnter(focused.id)}
          >
            Enter System
          </button>
        </div>
      )}
    </div>
  )
}
