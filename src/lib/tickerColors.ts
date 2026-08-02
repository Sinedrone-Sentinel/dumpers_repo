import type { CSSProperties } from 'react'

/** Hex accent (#RRGGBB) → inline styles for ticker badges / rows / bar. */

export type TickerAccentStyles = {
  badgeStyle: CSSProperties
  rowStyle: CSSProperties
  textStyle: CSSProperties
  barAccentStyle: CSSProperties
  swatchStyle: CSSProperties
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function normalizeAccentHex(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.trim()
  const withHash = t.startsWith('#') ? t : `#${t}`
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash)) return null
  return withHash.toUpperCase()
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeAccentHex(hex)
  if (!n) return null
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  }
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(148, 163, 184, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/** Lighten toward white for readable badge text on dark UI. */
function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#E2E8F0'
  const r = clampByte(rgb.r + (255 - rgb.r) * amount)
  const g = clampByte(rgb.g + (255 - rgb.g) * amount)
  const b = clampByte(rgb.b + (255 - rgb.b) * amount)
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function stylesFromAccentHex(hex: string | null | undefined): TickerAccentStyles {
  const accent = normalizeAccentHex(hex) ?? '#94A3B8'
  return {
    badgeStyle: {
      backgroundColor: rgba(accent, 0.2),
      color: lightenHex(accent, 0.45),
      borderColor: rgba(accent, 0.4),
    },
    rowStyle: {
      borderLeftWidth: 2,
      borderLeftStyle: 'solid',
      borderLeftColor: rgba(accent, 0.7),
    },
    textStyle: {
      color: lightenHex(accent, 0.55),
    },
    barAccentStyle: {
      borderTopColor: rgba(accent, 0.45),
    },
    swatchStyle: {
      backgroundColor: accent,
    },
  }
}
