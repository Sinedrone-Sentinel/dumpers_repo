import type { PSM } from 'tesseract.js'
import {
  assessCropLegibility,
  buildOcrFailureHints,
} from './rockCalculatorOcrLegibility'
import {
  parseRockScanOcrText,
  scoreRockScanOcrParseAttempt,
  type RockScanOcrParseResult,
} from './rockCalculatorOcrParse'

export interface NormalizedCropRect {
  x: number
  y: number
  width: number
  height: number
}

const OCR_PREPROCESS_SCALES = [2, 3, 4] as const
const LUMINANCE_THRESHOLD = 128

function applyBinaryThreshold(
  data: Uint8ClampedArray,
  threshold: number
): void {
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] >= threshold ? 255 : 0
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
}

function stretchLuminanceToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number
): { canvas: HTMLCanvasElement; imageData: ImageData; ctx: CanvasRenderingContext2D } {
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
    const lum = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
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
  }

  return { canvas, imageData, ctx }
}

function preprocessCrop(
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number
): HTMLCanvasElement {
  const stretched = stretchLuminanceToCanvas(source, width, height, scale)
  applyBinaryThreshold(stretched.imageData.data, LUMINANCE_THRESHOLD)
  stretched.ctx.putImageData(stretched.imageData, 0, 0)
  return stretched.canvas
}

/** Orange HUD text is often lost in luminance-only thresholding — isolate warm foreground pixels. */
function preprocessCropOrangeHud(
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

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const isOrangeHud = r >= 110 && r > g + 18 && r > b + 35 && g >= 35
    const value = isOrangeHud ? 255 : 0
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

type CropPreprocessFn = (
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number
) => HTMLCanvasElement

interface OcrScaleEscalationResult {
  success: RockScanOcrParseResult | null
  bestFailure: RockScanOcrParseResult | null
  bestFailureScore: number
  lastOcrText: string
  maxOcrConfidence: number
}

/** Run 2× → 3× → 4× with one preprocess variant; escalate only if parse score does not improve. */
async function runOcrScaleEscalation(
  deskewed: HTMLCanvasElement,
  preprocess: CropPreprocessFn
): Promise<OcrScaleEscalationResult> {
  let bestFailure: RockScanOcrParseResult | null = null
  let bestFailureScore = -1
  let previousScore = -1
  let lastOcrText = ''
  let maxOcrConfidence = 0

  for (let attempt = 0; attempt < OCR_PREPROCESS_SCALES.length; attempt++) {
    const scale = OCR_PREPROCESS_SCALES[attempt]
    const preprocessed = preprocess(deskewed, deskewed.width, deskewed.height, scale)
    const ocr = await runMultiPassOcr(preprocessed)
    lastOcrText = ocr.text
    maxOcrConfidence = Math.max(maxOcrConfidence, ocr.maxConfidence)
    const parsed = parseRockScanOcrText(ocr.text)

    if (parsed.ok) {
      return {
        success: parsed,
        bestFailure: null,
        bestFailureScore: -1,
        lastOcrText,
        maxOcrConfidence,
      }
    }

    const score = scoreRockScanOcrParseAttempt(parsed)
    if (score > bestFailureScore) {
      bestFailureScore = score
      bestFailure = parsed
    }

    const isLastScale = attempt === OCR_PREPROCESS_SCALES.length - 1
    if (isLastScale) break

    if (attempt > 0 && score < previousScore) break

    previousScore = score
  }

  return {
    success: null,
    bestFailure,
    bestFailureScore,
    lastOcrText,
    maxOcrConfidence,
  }
}

function pickBetterOcrPass(
  normal: OcrScaleEscalationResult,
  orange: OcrScaleEscalationResult
): OcrScaleEscalationResult {
  if (orange.bestFailureScore > normal.bestFailureScore) return orange
  if (normal.bestFailureScore > orange.bestFailureScore) return normal
  return orange.maxOcrConfidence >= normal.maxOcrConfidence ? orange : normal
}

let activeWorker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | null = null

export async function terminateOcrWorker(): Promise<void> {
  if (!activeWorker) return
  await activeWorker.terminate()
  activeWorker = null
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (!degrees) return source

  const rad = (degrees * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const width = source.width
  const height = source.height
  const rotatedWidth = Math.max(1, Math.ceil(width * cos + height * sin))
  const rotatedHeight = Math.max(1, Math.ceil(width * sin + height * cos))

  const canvas = document.createElement('canvas')
  canvas.width = rotatedWidth
  canvas.height = rotatedHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return source

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, rotatedWidth, rotatedHeight)
  ctx.translate(rotatedWidth / 2, rotatedHeight / 2)
  ctx.rotate(rad)
  ctx.drawImage(source, -width / 2, -height / 2)
  return canvas
}

export function cropPixelRect(
  sourceWidth: number,
  sourceHeight: number,
  crop: NormalizedCropRect
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, Math.round(crop.x * sourceWidth)),
    y: Math.max(0, Math.round(crop.y * sourceHeight)),
    width: Math.max(1, Math.round(crop.width * sourceWidth)),
    height: Math.max(1, Math.round(crop.height * sourceHeight)),
  }
}

function cropImageToCanvas(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop: NormalizedCropRect
): HTMLCanvasElement | null {
  const { x, y, width, height } = cropPixelRect(sourceWidth, sourceHeight, crop)

  if (width < 8 || height < 8) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height)
  return canvas
}

async function getWorker() {
  if (activeWorker) {
    const { PSM: PsmEnum } = await import('tesseract.js')
    return { worker: activeWorker, PsmEnum }
  }
  const { createWorker, PSM: PsmEnum, OEM } = await import('tesseract.js')
  const worker = await createWorker('eng', OEM.LSTM_ONLY)
  activeWorker = worker
  return { worker, PsmEnum }
}

async function recognizePass(
  canvas: HTMLCanvasElement,
  psm: PSM
): Promise<{ text: string; confidence: number }> {
  const { worker } = await getWorker()
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })
  const result = await worker.recognize(canvas)
  const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : 0
  return { text: result.data.text ?? '', confidence }
}

async function runMultiPassOcr(
  canvas: HTMLCanvasElement
): Promise<{ text: string; maxConfidence: number }> {
  const { PsmEnum } = await getWorker()
  const passes: PSM[] = [PsmEnum.SINGLE_BLOCK, PsmEnum.SINGLE_COLUMN, PsmEnum.SPARSE_TEXT]
  const results = await Promise.all(passes.map((psm) => recognizePass(canvas, psm)))

  results.sort((a, b) => b.confidence - a.confidence)
  const maxConfidence = results[0]?.confidence ?? 0

  const primaryLines = (results[0]?.text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (primaryLines.length === 0) {
    return { text: results[0]?.text ?? '', maxConfidence }
  }

  const merged = [...primaryLines]
  const seen = new Set(primaryLines.map((line) => line.toUpperCase()))

  for (let passIndex = 1; passIndex < results.length; passIndex++) {
    for (const line of results[passIndex].text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const key = trimmed.toUpperCase()
      if (seen.has(key)) continue

      const redundant = merged.some((existing) => {
        const existingKey = existing.toUpperCase()
        return existingKey.includes(key) || key.includes(existingKey)
      })
      if (redundant) continue

      merged.push(trimmed)
      seen.add(key)
    }
  }

  return { text: merged.join('\n'), maxConfidence }
}

function attachFailureHints(
  result: RockScanOcrParseResult,
  legibility: ReturnType<typeof assessCropLegibility>,
  maxOcrConfidence: number,
  lastOcrText: string
): RockScanOcrParseResult {
  if (result.ok) return result

  const hints = buildOcrFailureHints({
    legibility,
    maxOcrConfidence,
    parseScore: scoreRockScanOcrParseAttempt(result),
    hadReadableText: lastOcrText.trim().length > 0,
  })

  if (!hints.length) return result
  return { ...result, hints }
}

export async function processRockScanCrop(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop: NormalizedCropRect,
  deskewDegrees = 0
): Promise<RockScanOcrParseResult> {
  const rawCrop = cropImageToCanvas(image, sourceWidth, sourceHeight, crop)
  if (!rawCrop) {
    return { ok: false, error: 'Crop area is too small — drag a larger box around SCAN RESULTS.' }
  }

  const deskewed = rotateCanvas(rawCrop, deskewDegrees)
  const legibility = assessCropLegibility(deskewed)

  const normalPass = await runOcrScaleEscalation(deskewed, preprocessCrop)
  if (normalPass.success) return normalPass.success

  const orangePass = await runOcrScaleEscalation(deskewed, preprocessCropOrangeHud)
  if (orangePass.success) return orangePass.success

  const bestPass = pickBetterOcrPass(normalPass, orangePass)
  const failure =
    bestPass.bestFailure ?? {
      ok: false as const,
      error: 'OCR returned no readable text — try a tighter crop around SCAN RESULTS.',
    }

  return attachFailureHints(
    failure,
    legibility,
    Math.max(normalPass.maxOcrConfidence, orangePass.maxOcrConfidence),
    bestPass.lastOcrText
  )
}

export function loadImageFromFile(file: File): Promise<{
  image: HTMLImageElement
  objectUrl: string
  width: number
  height: number
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({
        image,
        objectUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not load pasted image.'))
    }
    image.src = objectUrl
  })
}

/** 16:9 reference capture (member 2560×1440) and ideal SCAN RESULTS panel crop (382×549). */
const REFERENCE_DISPLAY = { width: 2560, height: 1440 } as const
const REFERENCE_PANEL = { width: 382, height: 549 } as const
/** Right HUD column — top-left of panel on the reference capture. */
const REFERENCE_CROP_ORIGIN = { x: 2170, y: 115 } as const

function clampCropFraction(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Default SCAN RESULTS crop for a pasted screenshot (normalized 0–1). */
export function defaultCropRectForImage(
  _imageWidth: number,
  _imageHeight: number
): NormalizedCropRect {
  const width = REFERENCE_PANEL.width / REFERENCE_DISPLAY.width
  const height = REFERENCE_PANEL.height / REFERENCE_DISPLAY.height
  const y = REFERENCE_CROP_ORIGIN.y / REFERENCE_DISPLAY.height
  const rightMargin =
    (REFERENCE_DISPLAY.width - REFERENCE_CROP_ORIGIN.x - REFERENCE_PANEL.width) /
    REFERENCE_DISPLAY.width

  const x = 1 - width - rightMargin

  return {
    x: clampCropFraction(x, 0, 1 - width),
    y: clampCropFraction(y, 0, 1 - height),
    width,
    height,
  }
}

export const DEFAULT_CROP_RECT: NormalizedCropRect = defaultCropRectForImage(
  REFERENCE_DISPLAY.width,
  REFERENCE_DISPLAY.height
)
