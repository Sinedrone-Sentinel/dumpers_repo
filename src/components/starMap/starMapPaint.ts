/**
 * Canvas paint for the star map. Belts fade out at both edges, bodies are lit
 * from their star, and stars carry a slow surface texture.
 */

const GAS_GIANTS = new Set(['Crusader', 'Pyro V', 'Nyx III'])

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
  let s = 42
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return (s % 10000) / 10000
  }
  for (let i = 0; i < 110; i++) {
    const x = rnd() * 160
    const y = rnd() * 160
    const rad = 5 + rnd() * 16
    const hot = rnd()
    const col = hot > 0.62 ? '255, 236, 200' : hot > 0.3 ? '244, 170, 80' : '90, 28, 12'
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, `rgba(${col}, ${0.45 + rnd() * 0.4})`)
    grd.addColorStop(1, `rgba(${col}, 0)`)
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  grain = c
  return c
}

/** A fixed dusting of background stars and a soft falloff toward the corners. */
export function paintStarfield(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  let s = 7919
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return (s % 10000) / 10000
  }
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

  const count = Math.min(180, Math.max(24, Math.floor(span / 1.6)))
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
    ctx.globalAlpha = (rock ? 0.9 : 0.55) * edge
    ctx.fillStyle = rock ? 'rgba(255, 244, 214, 0.95)' : 'rgba(214, 206, 170, 0.9)'
    const s = rock ? 2.4 : 1.5
    ctx.fillRect(x, y, s, s)
  }
  ctx.globalAlpha = 1
}

function fract(n: number): number {
  return n - Math.floor(n)
}

/** A star: wide corona, a limb-darkened disc, and a surface that turns slowly. */
export function paintStar(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  t: number,
  name: string,
): void {
  const flare = /pyro/i.test(name)
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
  } else if (/nyx/i.test(name)) {
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
    ctx.globalCompositeOperation = 'soft-light'
    ctx.translate(sx, sy)
    ctx.rotate(t * 0.0001)
    ctx.globalAlpha = 0.85
    ctx.drawImage(img, -r, -r, r * 2, r * 2)
    ctx.rotate(t * -0.00016)
    ctx.globalAlpha = 0.45
    ctx.drawImage(img, -r * 1.2, -r * 1.2, r * 2.4, r * 2.4)
  }
  ctx.restore()
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
): void {
  const [core, mid, edge] = tone(name)
  ctx.save()
  ctx.beginPath()
  ctx.arc(sx, sy, r, 0, Math.PI * 2)
  ctx.clip()
  const albedo = ctx.createRadialGradient(sx - r * 0.32, sy - r * 0.32, r * 0.04, sx, sy, r)
  albedo.addColorStop(0, core)
  albedo.addColorStop(0.62, mid)
  albedo.addColorStop(1, edge)
  ctx.fillStyle = albedo
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2)

  if (GAS_GIANTS.has(name) && r > 7) {
    for (let i = 0; i < 5; i++) {
      const y = sy - r + ((i + 0.35) / 5) * r * 2
      ctx.globalAlpha = i % 2 === 0 ? 0.16 : 0.1
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#1a120c'
      ctx.fillRect(sx - r, y, r * 2, Math.max(1.2, r * 0.09))
    }
    ctx.globalAlpha = 1
  }

  const dx = starSx - sx
  const dy = starSy - sy
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const shade = ctx.createLinearGradient(sx + ux * r, sy + uy * r, sx - ux * r, sy - uy * r)
  shade.addColorStop(0, 'rgba(255, 244, 220, 0.2)')
  shade.addColorStop(0.4, 'rgba(0, 0, 0, 0)')
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.7)')
  ctx.fillStyle = shade
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2)
  ctx.restore()
}
