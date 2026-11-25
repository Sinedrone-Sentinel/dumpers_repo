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

/** Speck count for a belt of the given width in pixels. Twice the previous field. */
export function beltSpeckCount(span: number): number {
  return Math.min(360, Math.max(48, Math.floor(Math.max(span, 0) / 0.8)))
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

/** Flare length past the surface, in star radii. Pyro can run long. Stanton and Nyx stay medium. */
export function flareReach(name: string, scale: number): number {
  const u = Math.min(1, Math.max(0, scale))
  const maxExtra = starKind(name) === 'pyro' ? 2.15 : 0.85
  return 0.26 + u * maxExtra
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

let grain: HTMLCanvasElement | null = null

/** Soft light and dark mottling, transparent between the spots. */
function starGrain(): HTMLCanvasElement | null {
  if (grain) return grain
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 160
  c.height = 160
  const g = c.getContext('2d')
  if (!g) return null
  const rnd = makeRng(42)
  for (let i = 0; i < 220; i++) {
    const x = rnd() * 160
    const y = rnd() * 160
    const rad = 4 + rnd() * 18
    const hot = rnd()
    const col = hot > 0.72 ? '255, 248, 220' : hot > 0.4 ? '255, 150, 48' : hot > 0.18 ? '180, 48, 12' : '70, 16, 8'
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, `rgba(${col}, ${0.5 + rnd() * 0.45})`)
    grd.addColorStop(1, `rgba(${col}, 0)`)
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  grain = c
  return c
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

  const count = beltSpeckCount(span)
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

function paintFlares(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  t: number,
  name: string,
): void {
  const kind = starKind(name)
  const pyro = kind === 'pyro'
  const slots = pyro ? 7 : 4
  const seed = kind === 'nyx' ? 19 : pyro ? 53 : 7
  const hot = kind === 'nyx' ? '255, 186, 150' : pyro ? '255, 120, 36' : '255, 186, 72'
  for (let i = 0; i < slots; i++) {
    const period = 3600 + hash(seed * 13 + i * 3.1) * 7800
    const life = 900 + hash(seed + i * 9.7) * 1600
    const local = (t + hash(i * 4.4 + seed) * period) % period
    if (local > life) continue
    const u = local / life
    const fade = Math.sin(u * Math.PI)
    const scale = hash(seed * 17 + i * 2.2) ** 2
    const ang = hash(seed * 3 + i * 11.7) * Math.PI * 2 + u * 0.2
    const len = r * flareReach(name, scale)
    const halfW = Math.max(1.15, r * (0.04 + scale * (pyro ? 0.16 : 0.09))) * (0.55 + 0.45 * fade)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(ang)
    const glow = ctx.createRadialGradient(r + len * 0.45, 0, 0, r + len * 0.45, 0, len * 0.65)
    glow.addColorStop(0, `rgba(${hot}, ${0.28 * fade})`)
    glow.addColorStop(1, `rgba(${hot}, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(r + len * 0.45, 0, len * 0.65, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(r * 0.9, -halfW * 0.35)
    ctx.quadraticCurveTo(r + len * 0.35, -halfW, r + len, 0)
    ctx.quadraticCurveTo(r + len * 0.35, halfW, r * 0.9, halfW * 0.35)
    ctx.closePath()
    const tongue = ctx.createLinearGradient(r * 0.9, 0, r + len, 0)
    tongue.addColorStop(0, `rgba(255, 252, 236, ${0.95 * fade})`)
    tongue.addColorStop(0.28, `rgba(${hot}, ${0.8 * fade})`)
    tongue.addColorStop(1, `rgba(${hot}, 0)`)
    ctx.fillStyle = tongue
    ctx.fill()
    if (pyro && scale > 0.55) {
      ctx.beginPath()
      ctx.moveTo(r + len * 0.25, -halfW * 0.1)
      ctx.quadraticCurveTo(r + len * 0.7, -halfW * 0.85, r + len * 1.15, -halfW * 0.15)
      ctx.quadraticCurveTo(r + len * 0.62, -halfW * 0.05, r + len * 0.25, halfW * 0.08)
      ctx.fill()
    }
    ctx.restore()
  }
}

function paintStarCells(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  t: number,
  kind: StarKind,
): void {
  const n = kind === 'pyro' ? 14 : 8
  for (let i = 0; i < n; i++) {
    const period = 1400 + hash(i * 5.2 + 2) * 2200
    const life = 520 + hash(i * 2.1 + 4) * 900
    const local = (t + hash(i * 8 + 1) * period) % period
    if (local > life) continue
    const fade = Math.sin((local / life) * Math.PI)
    const ang = hash(i * 12.9) * Math.PI * 2 + t * 0.00015
    const dist = hash(i * 4.7) * r * 0.7
    const rad = r * (0.045 + hash(i * 6.3) * 0.09) * (0.65 + fade)
    const x = sx + Math.cos(ang) * dist
    const y = sy + Math.sin(ang) * dist
    const cell = ctx.createRadialGradient(x, y, 0, x, y, rad)
    cell.addColorStop(0, `rgba(255, 252, 236, ${0.7 * fade})`)
    cell.addColorStop(1, 'rgba(255, 140, 32, 0)')
    ctx.fillStyle = cell
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A star: wide corona, a limb-darkened disc, a turning surface, and flares. */
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

  if (r > 4) paintFlares(ctx, sx, sy, r, t, name)

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

  const img = r > 5 ? starGrain() : null
  if (img) {
    ctx.save()
    ctx.globalCompositeOperation = 'soft-light'
    ctx.translate(sx, sy)
    ctx.rotate(t * 0.0001)
    ctx.globalAlpha = 0.85
    ctx.drawImage(img, -r, -r, r * 2, r * 2)
    ctx.rotate(t * -0.00016)
    ctx.globalAlpha = 0.45
    ctx.drawImage(img, -r * 1.2, -r * 1.2, r * 2.4, r * 2.4)
    ctx.restore()
  }
  if (r > 5) paintStarCells(ctx, sx, sy, r, t, kind)
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
