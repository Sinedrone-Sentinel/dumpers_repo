/** Target cap height (px) for a single HUD text line before Tesseract — tuned for ~300 DPI reads. */
export const TARGET_LINE_XHEIGHT = 64

export const OCR_USER_DPI = 300

export interface TextLineBand {
  y0: number
  y1: number
}

function luminance(r: number, g: number, b: number): number {
  return Math.round(r * 0.299 + g * 0.587 + b * 0.114)
}

/** Contrast-stretched grayscale upscale — no color filtering, no binary crush. */
export function preprocessHudCrop(
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  let min = 255
  let max = 0

  for (let i = 0; i < data.length; i += 4) {
    const lum = luminance(data[i], data[i + 1], data[i + 2])
    min = Math.min(min, lum)
    max = Math.max(max, lum)
    data[i] = lum
    data[i + 1] = lum
    data[i + 2] = lum
  }

  const range = Math.max(1, max - min)
  for (let i = 0; i < data.length; i += 4) {
    const stretched = Math.round(((data[i] - min) / range) * 255)
    data[i] = stretched
    data[i + 1] = stretched
    data[i + 2] = stretched
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Binary threshold variant — fallback when grayscale lines are too faint. */
export function preprocessHudCropBinary(
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number,
  threshold = 128
): HTMLCanvasElement {
  const canvas = preprocessHudCrop(source, width, height, scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] >= threshold ? 255 : 0
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function rowInkCount(data: Uint8ClampedArray, width: number, y: number, inkThreshold: number): number {
  let count = 0
  const rowStart = y * width * 4
  for (let x = 0; x < width; x++) {
    if (data[rowStart + x * 4] >= inkThreshold) count++
  }
  return count
}

function inkBoundsInBand(
  data: Uint8ClampedArray,
  width: number,
  y0: number,
  y1: number,
  inkThreshold: number
): { top: number; bottom: number } | null {
  let top = -1
  let bottom = -1
  for (let y = y0; y < y1; y++) {
    if (rowInkCount(data, width, y, inkThreshold) > 0) {
      if (top < 0) top = y
      bottom = y
    }
  }
  if (top < 0 || bottom < 0) return null
  return { top, bottom }
}

/**
 * Horizontal projection to find text rows — we do layout analysis ourselves instead of
 * relying on Tesseract page segmentation.
 */
export function detectTextLineBands(
  canvas: HTMLCanvasElement,
  options?: { minLineHeight?: number; mergeGap?: number; inkThreshold?: number }
): TextLineBand[] {
  const minLineHeight = options?.minLineHeight ?? 5
  const mergeGap = options?.mergeGap ?? 3
  const inkThreshold = options?.inkThreshold ?? 120

  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const projection = new Float32Array(height)

  for (let y = 0; y < height; y++) {
    projection[y] = rowInkCount(imageData.data, width, y, inkThreshold)
  }

  const smoothed = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sum = 0
    let count = 0
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy >= 0 && yy < height) {
        sum += projection[yy]
        count++
      }
    }
    smoothed[y] = sum / count
  }

  const peak = Math.max(...smoothed)
  if (peak <= 0) return []

  const threshold = Math.max(2, peak * 0.07)
  const rawBands: TextLineBand[] = []
  let inBand = false
  let bandStart = 0

  for (let y = 0; y < height; y++) {
    const active = smoothed[y] >= threshold
    if (active && !inBand) {
      inBand = true
      bandStart = y
    } else if (!active && inBand) {
      inBand = false
      if (y - bandStart >= minLineHeight) rawBands.push({ y0: bandStart, y1: y })
    }
  }
  if (inBand && height - bandStart >= minLineHeight) {
    rawBands.push({ y0: bandStart, y1: height })
  }

  if (!rawBands.length) return []

  const merged: TextLineBand[] = [rawBands[0]]
  for (let i = 1; i < rawBands.length; i++) {
    const prev = merged[merged.length - 1]
    const next = rawBands[i]
    if (next.y0 - prev.y1 <= mergeGap) {
      prev.y1 = next.y1
    } else {
      merged.push(next)
    }
  }

  return merged
}

export function extractLineCanvas(
  source: HTMLCanvasElement,
  band: TextLineBand,
  paddingY = 2
): HTMLCanvasElement {
  const y0 = Math.max(0, band.y0 - paddingY)
  const y1 = Math.min(source.height, band.y1 + paddingY)
  const lineHeight = Math.max(1, y1 - y0)

  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = lineHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, y0, source.width, lineHeight, 0, 0, source.width, lineHeight)
  return canvas
}

/** Scale a single line so ink cap-height approaches TARGET_LINE_XHEIGHT. */
export function scaleLineToTargetXHeight(
  lineCanvas: HTMLCanvasElement,
  targetXHeight = TARGET_LINE_XHEIGHT,
  inkThreshold = 120
): { canvas: HTMLCanvasElement; scale: number } {
  const ctx = lineCanvas.getContext('2d')
  if (!ctx) return { canvas: lineCanvas, scale: 1 }

  const imageData = ctx.getImageData(0, 0, lineCanvas.width, lineCanvas.height)
  const bounds = inkBoundsInBand(
    imageData.data,
    lineCanvas.width,
    0,
    lineCanvas.height,
    inkThreshold
  )
  if (!bounds) return { canvas: lineCanvas, scale: 1 }

  const inkHeight = Math.max(1, bounds.bottom - bounds.top + 1)
  const scale = Math.min(6, Math.max(1, targetXHeight / inkHeight))
  if (Math.abs(scale - 1) < 0.05) return { canvas: lineCanvas, scale: 1 }

  const scaled = document.createElement('canvas')
  scaled.width = Math.max(1, Math.round(lineCanvas.width * scale))
  scaled.height = Math.max(1, Math.round(lineCanvas.height * scale))
  const scaledCtx = scaled.getContext('2d')
  if (!scaledCtx) return { canvas: lineCanvas, scale: 1 }

  scaledCtx.fillStyle = '#000'
  scaledCtx.fillRect(0, 0, scaled.width, scaled.height)
  scaledCtx.imageSmoothingEnabled = true
  scaledCtx.imageSmoothingQuality = 'high'
  scaledCtx.drawImage(lineCanvas, 0, 0, scaled.width, scaled.height)
  return { canvas: scaled, scale }
}
