/**
 * Canvas paint for the star map. Belts are a dust band with orbiting rocks,
 * bodies carry a cached surface, and each sun throws timed flares.
 */

const GAS_GIANTS = new Set(['Crusader', 'Pyro V', 'Nyx III'])
const ICE = new Set(['Yela', 'microTech', 'Clio', 'Wala'])
const VOLCANIC = new Set(['Aberdeen', 'Cellin', 'Ignis', 'Fuego', 'Vuur', 'Vatra', 'Pyro I'])
const CITY = new Set(['ArcCorp'])
const VERDANT = new Set(['Arial', 'Calliope', 'Euterpe', 'Bloom'])
const DUST = new Set(['Hurston', 'Daymar', 'Magda', 'Monox', 'Terminus', 'Fairo', 'Adir'])

type SurfaceKind = 'gas' | 'ice' | 'volcanic' | 'city' | 'verdant' | 'dust' | 'rock'
type StarKind = 'pyro' | 'nyx' | 'stanton'

/** [lit, mid, limb] — the colors these bodies show in the game. */
const BODY_TONE: Record<string, [string, string, string]> = {
  Hurston: ['#cbb892', '#8d6840', '#3e2e22'],
  Arial: ['#a3b584', '#5e7548', '#2a3424'],
  Aberdeen: ['#e2a86a', '#b15e2c', '#5c2c16'],
  Ita: ['#8a948c', '#4a564e', '#222826'],
  Magda: ['#c4b49c', '#7d6c58', '#3a322c'],
  ArcCorp: ['#b0b8c4', '#66717e', '#2c333c'],
  Wala: ['#dce4ec', '#96a8ba', '#445466'],
  Lyria: ['#c8b8a8', '#7e6c5e', '#3a322c'],
  microTech: ['#e8eef4', '#a8c0d2', '#4a647c'],
  Calliope: ['#8ea472', '#526840', '#263024'],
  Euterpe: ['#a4c090', '#5c784e', '#283426'],
  Clio: ['#e2eaf0', '#a4b6c6', '#4a5e70'],
  Crusader: ['#f2c8a4', '#d48c52', '#7a4424'],
  Yela: ['#e6eef4', '#b4c4d2', '#56687a'],
  Daymar: ['#d4bc96', '#a68858', '#564430'],
  Cellin: ['#c88870', '#8a4436', '#3a201c'],
  'Pyro V': ['#d2ce78', '#6e8c4a', '#2c4026'],
  Bloom: ['#9cbc78', '#5a7a44', '#26341e'],
  Monox: ['#c8b070', '#7a6840', '#3a321c'],
  Terminus: ['#9a9088', '#5c564e', '#2a2824'],
  'Pyro I': ['#c47a58', '#7a3828', '#3a1c14'],
  Adir: ['#c49070', '#7a5040', '#3a2820'],
  Ignis: ['#d09060', '#8a4428', '#401c14'],
  Fuego: ['#cc7848', '#843828', '#3c1814'],
  Vuur: ['#c08058', '#7a4030', '#3a1e18'],
  Vatra: ['#c88858', '#804830', '#3c2218'],
  Fairo: ['#d0a070', '#8a5c38', '#3e2c1c'],
  'Nyx III': ['#d4e2ee', '#8eacc4', '#3e5a72'],
}

function fallbackTone(name: string): [string, string, string] {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  const cool = (h >>> 8) % 4 === 0
  const hue = cool ? 200 + (h % 24) : 18 + (h % 32)
  return [`hsl(${hue} 24% 64%)`, `hsl(${hue} 18% 42%)`, `hsl(${hue} 16% 22%)`]
}

function tone(name: string): [string, string, string] {
  return BODY_TONE[name] ?? fallbackTone(name)
}

function surfaceKind(name: string): SurfaceKind {
  if (GAS_GIANTS.has(name)) return 'gas'
  if (ICE.has(name)) return 'ice'
  if (VOLCANIC.has(name)) return 'volcanic'
  if (CITY.has(name)) return 'city'
  if (VERDANT.has(name)) return 'verdant'
  if (DUST.has(name)) return 'dust'
  return 'rock'
}

function starKind(name: string): StarKind {
  if (/pyro/i.test(name)) return 'pyro'
  if (/nyx/i.test(name)) return 'nyx'
  return 'stanton'
}

function fract(n: number): number {
  return n - Math.floor(n)
}

function hash(n: number): number {
  return fract(Math.sin(n) * 43758.5453)
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const n = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')
    return `${color}${n}`
  }
  if (color.startsWith('hsl(')) return color.replace('hsl(', 'hsla(').replace(')', ` / ${alpha})`)
  return color
}

/**
 * Yela Ring is the density baseline. Its width over its midline is what the
 * old span/0.8 count looked like when that ring read as clustered. Every belt
 * keeps that many specks per pixel of circumference, so a longer ring gets
 * more specks instead of spreading a fixed handful around a bigger circle.
 */
const YELA_RING_MID_M = (482_000 + 782_000) / 2
const YELA_RING_WIDTH_M = 782_000 - 482_000

export function beltSpeckCount(midPx: number): number {
  const yelaRatio = YELA_RING_WIDTH_M / YELA_RING_MID_M
  const count = (Math.max(0, midPx) * yelaRatio) / 0.8
  return Math.max(12, Math.min(2400, Math.round(count)))
}

/**
 * Speck size for a 0–1 roll. Most stay small. The top of the range is 4.8,
 * twice the previous 2.4 rock.
 */
export function beltSpeckSize(roll: number): number {
  const u = Math.min(1, Math.max(0, roll))
  if (u > 0.82) return 2.4 + ((u - 0.82) / 0.18) * 2.4
  return 1.1 + u * 1.4
}

function makeRng(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s % 10000) / 10000
  }
}

function seedOf(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  return (h >>> 0) || 1
}

interface StarMote {
  ang: number
  dist: number
  size: number
  roll: number
  phase: number
  spin: number
  /** 0 cell, 1 dark lane. */
  group: number
}

/** Inside this radius a bouncing cell reflects off the limb. */
const STAR_LIMB = 0.9

interface StarMoteSim {
  t: number
  x: number
  y: number
  vx: number
  vy: number
}

const moteSim = new WeakMap<object, StarMoteSim>()

const starMotes = new Map<StarKind, StarMote[]>()

function motesFor(kind: StarKind): StarMote[] {
  const cached = starMotes.get(kind)
  if (cached) return cached
  const rnd = makeRng(kind === 'nyx' ? 11 : kind === 'pyro' ? 29 : 5)
  const motes: StarMote[] = []
  for (let i = 0; i < 210; i++) {
    motes.push({
      ang: rnd() * Math.PI * 2,
      dist: Math.sqrt(rnd()) * 0.9,
      size: 0.012 + rnd() * (rnd() > 0.82 ? 0.07 : 0.04),
      roll: rnd(),
      phase: rnd() * Math.PI * 2,
      spin: 0.45 + rnd() * 1.1,
      group: 0,
    })
  }
  for (let i = 0; i < 6; i++) {
    motes.push({
      ang: rnd() * Math.PI * 2,
      dist: Math.sqrt(rnd()) * 0.72,
      size: 0.14 + rnd() * 0.12,
      roll: rnd(),
      phase: rnd() * Math.PI * 2,
      spin: 0.35 + rnd() * 0.4,
      group: 1,
    })
  }
  starMotes.set(kind, motes)
  return motes
}

/** Slow turn of the whole disc, added on top of each cell's own motion. */
export function starDiscTurn(t: number): number {
  return t * 0.00008
}

function wanderMote(mote: { roll?: number; phase: number }): boolean {
  const roll = mote.roll ?? ((mote.phase / (Math.PI * 2)) % 1)
  return roll < 0.3
}

function clampLimb(x: number, y: number): { x: number; y: number } {
  const d = Math.hypot(x, y)
  if (d <= STAR_LIMB || d === 0) return { x, y }
  return { x: (x * STAR_LIMB) / d, y: (y * STAR_LIMB) / d }
}

/** A cell that only travels so far, then comes back on a new heading. */
function wanderPoint(mote: { ang: number; dist: number; phase: number; spin: number }, t: number): { x: number; y: number } {
  const base = Math.min(Math.max(0.05, mote.dist), 0.72)
  const pace = 0.7 + (mote.spin % 1.5) / 1.5
  const reach = 0.06 + 0.12 * pace
  const along = Math.sin(t * 0.00115 * pace + mote.phase)
  const across = Math.sin(t * 0.00047 * (1.4 - pace * 0.3) + mote.phase * 1.7)
  const head = mote.phase + Math.sin(t * 0.00018 * pace + mote.phase) * 2.1
  const c = Math.cos(head)
  const s = Math.sin(head)
  return clampLimb(
    Math.cos(mote.ang) * base + (along * c - across * s) * reach,
    Math.sin(mote.ang) * base + (along * s + across * c) * reach,
  )
}

function bounceStep(
  x: number,
  y: number,
  vx: number,
  vy: number,
  dt: number,
): { x: number; y: number; vx: number; vy: number } {
  let px = x
  let py = y
  let left = dt
  const held = clampLimb(px, py)
  px = held.x
  py = held.y
  for (let n = 0; n < 64 && left > 1e-4; n++) {
    const a = vx * vx + vy * vy
    if (a < 1e-18) break
    const b = 2 * (px * vx + py * vy)
    const c = px * px + py * py - STAR_LIMB * STAR_LIMB
    const disc = b * b - 4 * a * c
    if (disc <= 0) {
      px += vx * left
      py += vy * left
      break
    }
    const root = Math.sqrt(disc)
    const r1 = (-b - root) / (2 * a)
    const r2 = (-b + root) / (2 * a)
    const hit = r1 > 1e-4 ? r1 : r2
    if (!(hit > 1e-4) || hit >= left) {
      px += vx * left
      py += vy * left
      break
    }
    px += vx * hit
    py += vy * hit
    left -= hit
    const len = Math.hypot(px, py) || 1
    const nx = px / len
    const ny = py / len
    const dot = vx * nx + vy * ny
    vx -= 2 * dot * nx
    vy -= 2 * dot * ny
    px *= (STAR_LIMB - 0.004) / len
    py *= (STAR_LIMB - 0.004) / len
  }
  const end = clampLimb(px, py)
  return { x: end.x, y: end.y, vx, vy }
}

/**
 * Where a granule sits in the sun's own frame at time `t`.
 * About 30% wander out and come back on a new heading. The rest travel in a
 * straight line and bounce off the limb. The disc turn is applied by the painter.
 */
export function starMotePlace(
  mote: { ang: number; dist: number; phase: number; spin: number; roll?: number },
  t: number,
): { ang: number; dist: number } {
  const at = wanderMote(mote) ? wanderPoint(mote, t) : bouncePoint(mote, t)
  const dist = Math.hypot(at.x, at.y)
  return { ang: Math.atan2(at.y, at.x), dist }
}

function bouncePoint(
  mote: { ang: number; dist: number; phase: number; spin: number },
  t: number,
): { x: number; y: number } {
  const speed = 0.00009 + mote.spin * 0.00005
  let x = Math.cos(mote.ang) * Math.min(mote.dist, STAR_LIMB - 0.02)
  let y = Math.sin(mote.ang) * Math.min(mote.dist, STAR_LIMB - 0.02)
  let vx = Math.cos(mote.phase) * speed
  let vy = Math.sin(mote.phase) * speed
  let from = 0
  const sim = moteSim.get(mote)
  if (sim && t >= sim.t && t - sim.t <= 4000) {
    x = sim.x
    y = sim.y
    vx = sim.vx
    vy = sim.vy
    from = sim.t
  }
  const moved = bounceStep(x, y, vx, vy, Math.max(0, t - from))
  moteSim.set(mote, { t, x: moved.x, y: moved.y, vx: moved.vx, vy: moved.vy })
  return moved
}

function starRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function paintStarSurface(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  t: number,
  kind: StarKind,
): void {
  const hot = kind === 'nyx' ? '#ffd0c4' : kind === 'pyro' ? '#fff6d0' : '#ffe7a8'
  const mid = kind === 'nyx' ? '#d46858' : kind === 'pyro' ? '#ff9a2e' : '#f0a040'
  const cool = kind === 'nyx' ? '#6e2820' : kind === 'pyro' ? '#9a2808' : '#b45309'
  const base = kind === 'nyx' ? '#9a4034' : kind === 'pyro' ? '#e85d04' : '#e08820'
  const turn = starDiscTurn(t)
  const motes = motesFor(kind)
  const cells = motes.filter((mote) => mote.group === 0).slice().sort((a, b) => b.size - a.size)
  for (const mote of cells) {
    const at = starMotePlace(mote, t)
    const ang = at.ang + turn
    const x = sx + Math.cos(ang) * at.dist * r
    const y = sy + Math.sin(ang) * at.dist * r
    const rad = mote.size * r
    const core = mote.roll > 0.86 ? hot : mote.roll > 0.4 ? mid : cool
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, starRgba(core, 0.55))
    grd.addColorStop(0.22, starRgba(core, 0.28))
    grd.addColorStop(0.55, starRgba(mid, 0.12))
    grd.addColorStop(1, starRgba(base, 0))
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const mote of motes) {
    if (mote.group !== 1) continue
    const at = starMotePlace(mote, t)
    const ang = at.ang + turn
    const x = sx + Math.cos(ang) * at.dist * r
    const y = sy + Math.sin(ang) * at.dist * r
    const rad = mote.size * r
    const shade = ctx.createRadialGradient(x, y, 0, x, y, rad)
    shade.addColorStop(0, 'rgba(48, 14, 4, 0.22)')
    shade.addColorStop(0.4, 'rgba(48, 14, 4, 0.08)')
    shade.addColorStop(1, 'rgba(48, 14, 4, 0)')
    ctx.fillStyle = shade
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
}

const surfaces = new Map<string, HTMLCanvasElement>()

function bodyTexture(name: string): HTMLCanvasElement | null {
  const cached = surfaces.get(name)
  if (cached) return cached
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  const n = 192
  c.width = n
  c.height = n
  const g = c.getContext('2d')
  if (!g) return null
  paintSurface(g, name, n)
  surfaces.set(name, c)
  return c
}

function paintSurface(g: CanvasRenderingContext2D, name: string, n: number): void {
  const [core, mid, edge] = tone(name)
  const rnd = makeRng(seedOf(name))
  const kind = surfaceKind(name)
  g.fillStyle = kind === 'city' ? '#12151c' : mid
  g.fillRect(0, 0, n, n)

  if (kind === 'gas') {
    for (let i = 0; i < 18; i++) {
      const y = (i / 18) * n
      const h = (n / 18) * (0.65 + rnd() * 0.9)
      const wobble = (rnd() - 0.5) * n * 0.1
      g.globalAlpha = 0.45 + rnd() * 0.5
      g.fillStyle = i % 3 === 0 ? core : i % 3 === 1 ? edge : mid
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(n * 0.33, y + wobble, n * 0.66, y - wobble, n, y + wobble * 0.25)
      g.lineTo(n, y + h)
      g.bezierCurveTo(n * 0.66, y + h - wobble, n * 0.33, y + h + wobble, 0, y + h)
      g.closePath()
      g.fill()
    }
    const stormX = n * (0.32 + rnd() * 0.36)
    const stormY = n * (0.38 + rnd() * 0.24)
    const stormR = n * (0.09 + rnd() * 0.05)
    const storm = g.createRadialGradient(stormX, stormY, stormR * 0.15, stormX, stormY, stormR)
    storm.addColorStop(0, core)
    storm.addColorStop(0.55, mid)
    storm.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalAlpha = 0.8
    g.fillStyle = storm
    g.beginPath()
    g.ellipse(stormX, stormY, stormR * 1.55, stormR * 0.85, -0.45, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
    return
  }

  const blobs = kind === 'ice' ? 26 : 40
  for (let i = 0; i < blobs; i++) {
    const x = rnd() * n
    const y = rnd() * n
    const rad = n * (0.035 + rnd() * (kind === 'dust' ? 0.16 : 0.09))
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, rnd() > 0.45 ? core : edge)
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalAlpha = 0.32 + rnd() * 0.45
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1

  if (kind === 'volcanic') {
    g.lineCap = 'round'
    g.strokeStyle = 'rgba(255, 132, 42, 0.9)'
    g.lineWidth = 2.2
    for (let i = 0; i < 8; i++) {
      let x = rnd() * n
      let y = rnd() * n
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 0; k < 4; k++) {
        x = Math.max(0, Math.min(n, x + (rnd() - 0.5) * n * 0.5))
        y = Math.max(0, Math.min(n, y + (rnd() - 0.5) * n * 0.5))
        g.lineTo(x, y)
      }
      g.stroke()
    }
    for (let i = 0; i < 6; i++) {
      const x = rnd() * n
      const y = rnd() * n
      const rad = 5 + rnd() * 12
      const grd = g.createRadialGradient(x, y, 0, x, y, rad)
      grd.addColorStop(0, 'rgba(255, 230, 150, 0.95)')
      grd.addColorStop(1, 'rgba(160, 32, 8, 0)')
      g.fillStyle = grd
      g.beginPath()
      g.arc(x, y, rad, 0, Math.PI * 2)
      g.fill()
    }
  } else if (kind === 'ice') {
    g.strokeStyle = 'rgba(236, 246, 255, 0.55)'
    g.lineWidth = 1.25
    for (let i = 0; i < 8; i++) {
      g.beginPath()
      g.moveTo(rnd() * n, rnd() * n)
      g.lineTo(rnd() * n, rnd() * n)
      g.stroke()
    }
  } else if (kind === 'city') {
    for (let i = 0; i < 110; i++) {
      const x = rnd() * n
      const y = rnd() * n
      const big = rnd() > 0.86
      g.globalAlpha = 0.4 + rnd() * 0.6
      g.fillStyle = rnd() > 0.8 ? '#9ad7ff' : '#ffc078'
      g.fillRect(x, y, big ? 3.2 : 1.5, big ? 3.2 : 1.5)
    }
    g.globalAlpha = 1
  } else {
    const craters = kind === 'verdant' ? 5 : 12
    for (let i = 0; i < craters; i++) {
      const x = rnd() * n
      const y = rnd() * n
      const rad = 4 + rnd() * (kind === 'dust' ? 18 : 12)
      g.strokeStyle = 'rgba(255,255,255,0.2)'
      g.lineWidth = 1.6
      g.beginPath()
      g.arc(x, y, rad, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = 'rgba(0,0,0,0.3)'
      g.beginPath()
      g.arc(x + rad * 0.16, y + rad * 0.14, rad * 0.72, 0, Math.PI * 2)
      g.fill()
    }
  }
}

/** A fixed dusting of background stars and a soft falloff toward the corners. */
export function paintStarfield(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rnd = makeRng(7919)
  for (let i = 0; i < 160; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const bright = rnd()
    ctx.fillStyle = `rgba(226, 232, 240, ${0.12 + bright * 0.5})`
    const d = bright > 0.92 ? 1.6 : 0.8
    ctx.fillRect(x, y, d, d)
  }
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72)
  v.addColorStop(0, 'rgba(0, 0, 0, 0)')
  v.addColorStop(1, 'rgba(0, 0, 0, 0.5)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, w, h)
}

/**
 * An asteroid belt or ring. A soft dust band, a brighter glow along the
 * middle, and drifting specks. The fill fades out at both edges. `marked` is 0–1.
 */
export function paintBelt(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  innerPx: number,
  outerPx: number,
  t: number,
  marked: number,
): void {
  const span = Math.max(outerPx - innerPx, 8)
  const feather = Math.max(14, span * 0.65)
  const inner = Math.max(0, innerPx - feather * 0.2)
  const outer = outerPx + feather * 0.45
  if (outer < 1.5) return
  const dust = '196, 206, 168'
  const g = ctx.createRadialGradient(sx, sy, inner, sx, sy, outer)
  g.addColorStop(0, `rgba(${dust}, 0)`)
  g.addColorStop(0.18, `rgba(${dust}, 0.08)`)
  g.addColorStop(0.5, `rgba(${dust}, ${0.2 + marked * 0.1})`)
  g.addColorStop(0.82, `rgba(${dust}, 0.07)`)
  g.addColorStop(1, `rgba(${dust}, 0)`)
  ctx.beginPath()
  ctx.arc(sx, sy, outer, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()

  const mid = (innerPx + outerPx) / 2
  const glowHalf = Math.max(5, Math.min(span * 0.28, 36))
  const glow = ctx.createRadialGradient(sx, sy, Math.max(0, mid - glowHalf), sx, sy, mid + glowHalf)
  glow.addColorStop(0, 'rgba(236, 220, 160, 0)')
  glow.addColorStop(0.42, 'rgba(236, 220, 160, 0.08)')
  glow.addColorStop(0.5, `rgba(255, 236, 180, ${0.42 + marked * 0.2})`)
  glow.addColorStop(0.58, 'rgba(236, 220, 160, 0.08)')
  glow.addColorStop(1, 'rgba(236, 220, 160, 0)')
  ctx.beginPath()
  ctx.arc(sx, sy, mid + glowHalf, 0, Math.PI * 2)
  ctx.fillStyle = glow
  ctx.fill()

  const count = beltSpeckCount(mid)
  const seed = (Math.round(sx) * 13 + Math.round(sy)) % 997
  for (let i = 0; i < count; i++) {
    const u = fract(Math.sin(i * 127.1 + seed) * 43758.5453)
    const v = fract(Math.sin(i * 269.5 + seed * 0.37) * 24634.6345)
    const ang = u * Math.PI * 2 + t * 0.00003 * (0.4 + v)
    const rad = innerPx + v * (outerPx - innerPx)
    const x = sx + Math.cos(ang) * rad
    const y = sy + Math.sin(ang) * rad
    const edge = Math.sin(v * Math.PI)
    const rock = v > 0.82
    const s = beltSpeckSize(v)
    ctx.globalAlpha = (rock ? 0.9 : 0.55) * edge
    ctx.fillStyle = rock ? 'rgba(255, 244, 214, 0.95)' : 'rgba(214, 206, 170, 0.9)'
    if (s > 3.2) {
      ctx.beginPath()
      ctx.arc(x, y, s * 0.5, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillRect(x - s / 2, y - s / 2, s, s)
    }
  }
  ctx.globalAlpha = 1
}

/** A star: corona and a soft photosphere. Cells fade into the disc as it turns. */
export function paintStar(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  t: number,
  name: string,
): void {
  const kind = starKind(name)
  const flare = kind === 'pyro'
  const pulse = 0.9 + 0.1 * Math.sin(t * (flare ? 0.0035 : 0.0011))
  const reach = Math.min(r * (flare ? 3.6 : 3), r + 96) * pulse
  ctx.save()
  const corona = ctx.createRadialGradient(sx, sy, r * 0.55, sx, sy, reach)
  corona.addColorStop(0, flare ? 'rgba(255, 150, 64, 0.42)' : 'rgba(255, 198, 120, 0.32)')
  corona.addColorStop(0.4, flare ? 'rgba(255, 96, 32, 0.1)' : 'rgba(255, 160, 70, 0.07)')
  corona.addColorStop(1, 'rgba(255, 140, 40, 0)')
  ctx.fillStyle = corona
  ctx.beginPath()
  ctx.arc(sx, sy, reach, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(sx, sy, r, 0, Math.PI * 2)
  ctx.clip()
  const disc = ctx.createRadialGradient(sx - r * 0.22, sy - r * 0.26, r * 0.04, sx, sy, r)
  if (flare) {
    disc.addColorStop(0, '#fff0cc')
    disc.addColorStop(0.42, '#ee8434')
    disc.addColorStop(1, '#6e1e0c')
  } else if (kind === 'nyx') {
    disc.addColorStop(0, '#fff1e8')
    disc.addColorStop(0.5, '#e08c6c')
    disc.addColorStop(1, '#6e3428')
  } else {
    disc.addColorStop(0, '#fff6dc')
    disc.addColorStop(0.48, '#f0b056')
    disc.addColorStop(1, '#a84e1c')
  }
  ctx.fillStyle = disc
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2)

  if (r > 5) paintStarSurface(ctx, sx, sy, r, t, kind)
  if (r > 5) {
    const limb = ctx.createRadialGradient(sx, sy, r * 0.42, sx, sy, r)
    limb.addColorStop(0, 'rgba(0, 0, 0, 0)')
    limb.addColorStop(0.68, 'rgba(70, 16, 0, 0.05)')
    limb.addColorStop(1, 'rgba(28, 4, 0, 0.62)')
    ctx.fillStyle = limb
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2)
  }
  ctx.restore()

  if (r > 5) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(sx, sy, r * 0.98, 0, Math.PI * 2)
    ctx.strokeStyle = flare ? 'rgba(255, 214, 150, 0.55)' : 'rgba(255, 236, 200, 0.4)'
    ctx.lineWidth = Math.max(1, r * 0.045)
    ctx.stroke()
    ctx.restore()
  }
}

/** A planet or moon, brighter on the side that faces the star. */
export function paintBody(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  name: string,
  starSx: number,
  starSy: number,
  t: number,
): void {
  const [core, mid, edge] = tone(name)
  const kind = surfaceKind(name)
  const tex = r >= 6 ? bodyTexture(name) : null

  if (r >= 8) {
    const reach = r * (kind === 'gas' ? 1.55 : 1.28)
    const haze = ctx.createRadialGradient(sx, sy, r * 0.9, sx, sy, reach)
    haze.addColorStop(0, 'rgba(0,0,0,0)')
    haze.addColorStop(0.5, withAlpha(core, kind === 'gas' ? 0.28 : 0.18))
    haze.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = haze
    ctx.beginPath()
    ctx.arc(sx, sy, reach, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.save()
  ctx.beginPath()
  ctx.arc(sx, sy, r, 0, Math.PI * 2)
  ctx.clip()

  if (tex) {
    ctx.save()
    ctx.translate(sx, sy)
    if (kind !== 'gas') ctx.rotate(t * 0.00005)
    ctx.drawImage(tex, -r, -r, r * 2, r * 2)
    ctx.restore()
  } else {
    const albedo = ctx.createRadialGradient(sx - r * 0.32, sy - r * 0.32, r * 0.04, sx, sy, r)
    albedo.addColorStop(0, core)
    albedo.addColorStop(0.62, mid)
    albedo.addColorStop(1, edge)
    ctx.fillStyle = albedo
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2)
  }

  if (kind === 'gas' && r > 7) {
    ctx.lineCap = 'round'
    for (let i = 0; i < 6; i++) {
      const base = -1 + ((i + 0.5) / 6) * 2
      const y = sy + base * r * 0.92 + Math.sin(t * 0.00022 + i) * r * 0.04
      ctx.beginPath()
      ctx.moveTo(sx - r, y)
      ctx.bezierCurveTo(
        sx - r * 0.25,
        y + Math.sin(t * 0.0003 + i) * r * 0.07,
        sx + r * 0.3,
        y - Math.sin(t * 0.00027 + i * 1.7) * r * 0.07,
        sx + r,
        y,
      )
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(20,10,6,0.22)'
      ctx.lineWidth = Math.max(1.2, r * 0.05)
      ctx.stroke()
    }
  }

  if (kind === 'ice') {
    const cap = ctx.createLinearGradient(sx, sy - r, sx, sy + r)
    cap.addColorStop(0, 'rgba(255,255,255,0.62)')
    cap.addColorStop(0.2, 'rgba(255,255,255,0)')
    cap.addColorStop(0.8, 'rgba(255,255,255,0)')
    cap.addColorStop(1, 'rgba(255,255,255,0.5)')
    ctx.fillStyle = cap
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2)
  }

  const limb = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r)
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = limb
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2)

  const dx = starSx - sx
  const dy = starSy - sy
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const shade = ctx.createLinearGradient(sx + ux * r, sy + uy * r, sx - ux * r, sy - uy * r)
  shade.addColorStop(0, 'rgba(255, 244, 220, 0.22)')
  shade.addColorStop(0.42, 'rgba(0, 0, 0, 0)')
  shade.addColorStop(1, kind === 'city' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.62)')
  ctx.fillStyle = shade
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2)
  ctx.restore()

  if (r >= 8) {
    const ang = Math.atan2(dy, dx)
    ctx.save()
    ctx.beginPath()
    ctx.arc(sx, sy, r * 0.97, ang - 1.05, ang + 1.05)
    ctx.strokeStyle = 'rgba(255, 244, 220, 0.32)'
    ctx.lineWidth = Math.max(1, r * 0.045)
    ctx.stroke()
    ctx.restore()
  }
}
