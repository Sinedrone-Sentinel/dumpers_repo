import { STAR_MAP_ICON_COLORS, type StarMapKind } from '../../lib/starMap'

/** Stroke paths in a 24×24 box. Shared by the canvas and the legend SVGs. */
export const STAR_MAP_ICON_PATHS: Partial<Record<StarMapKind, string>> = {
  station:
    'M19 12a7 7 0 1 1-14 0a7 7 0 1 1 14 0Z M14.5 12a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z M12 5v4.5 M12 14.5V19 M5 12h4.5 M14.5 12H19',
  landing: 'M4 11l8-7 8 7 M6 10.5V20h12V10.5 M10 20v-5h4v5',
  jump_point:
    'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z M12 7a5 5 0 1 1-5 5 M12 10a2 2 0 1 1-2 2',
  wikelo:
    'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z M7.5 12q4.5-4.5 9 0q-4.5 4.5-9 0Z M13 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0Z',
  comm_array:
    'M10 10h4v4h-4Z M2.5 9h5v6h-5Z M16.5 9h5v6h-5Z M7.5 12H10 M14 12h2.5 M5 9v6 M19 9v6 M12 10V6.5 M9.5 5.5q2.5-2.5 5 0',
  executive_hangar:
    'M3 20v-9l9-6 9 6v9 M7 20v-5h10v5 M12 7.6l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 9.7l2-.3Z',
  supervisor: 'M12 3l7 3v5c0 4.5-3 8-7 10c-4-2-7-5.5-7-10V6Z M8.8 12l2.2 2.2 4.2-4.4',
  olp: 'M12 4.5l6.5 10h-13Z M12 14.5V21 M8.5 21h7 M12 4.5V1.5 M9.5 2.5l2.5 2 2.5-2',
  pa_station:
    'M14.5 8a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z M9 17a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z M20 17a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z M10.8 10.2l-3 4.6 M13.2 10.2l3 4.6 M9 17h6',
  qv: 'M12 3a9 9 0 0 1 8.4 5.8 M20.8 13.5A9 9 0 0 1 9 20.5 M5.4 18A9 9 0 0 1 6.5 5 M12.5 7l-2 4.5h3l-2 5',
  outlaw:
    'M12 3c-3.6 0-6 2.4-6 5.6c0 2 1 3.4 2.5 4.2V15h7v-2.2c1.5-.8 2.5-2.2 2.5-4.2C18 5.4 15.6 3 12 3Z M11 9a1.4 1.4 0 1 1-2.8 0a1.4 1.4 0 1 1 2.8 0Z M15.8 9a1.4 1.4 0 1 1-2.8 0a1.4 1.4 0 1 1 2.8 0Z M4 17l16 4 M20 17L4 21',
  rab: 'M4 14l2-6 5-3 6 1 3 5-2 6-6 2-5-1Z M9 15a3 3 0 0 1 6 0Z',
  rmb: 'M4 16l2-4 4-1.5 5 .5 3 3-1.5 4-5 1.5-5-1Z M7.5 5q4.5-2.5 9 0 M12 3.8v8',
  cluster:
    'M10 7.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z M19.5 10a3 3 0 1 1-6 0a3 3 0 1 1 6 0Z M13 17.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z',
}

const pathCache = new Map<string, Path2D>()

function iconPath(kind: StarMapKind): Path2D | null {
  const d = STAR_MAP_ICON_PATHS[kind]
  if (!d) return null
  let p = pathCache.get(kind)
  if (!p) {
    p = new Path2D(d)
    pathCache.set(kind, p)
  }
  return p
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Draw a category icon centred on (x, y), `size` pixels across. */
export function drawStarMapIcon(
  ctx: CanvasRenderingContext2D,
  kind: StarMapKind,
  x: number,
  y: number,
  size: number,
  color: string = STAR_MAP_ICON_COLORS[kind],
): void {
  const path = iconPath(kind)
  ctx.save()
  const glow = ctx.createRadialGradient(x, y, size * 0.15, x, y, size * 0.95)
  glow.addColorStop(0, withAlpha(color, 0.32))
  glow.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, size * 0.95, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, size / 2 + 1, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(7, 11, 18, 0.8)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = withAlpha(color, 0.5)
  ctx.stroke()
  if (path) {
    ctx.translate(x - size / 2, y - size / 2)
    ctx.scale(size / 24, size / 24)
    ctx.lineWidth = 1.65
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.stroke(path)
  }
  ctx.restore()
}
