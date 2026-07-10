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

let activeWorker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | null = null

export async function terminateOcrWorker(): Promise<void> {
  if (!activeWorker) return
  await activeWorker.terminate()
  activeWorker = null
}

function preprocessCrop(
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
    const threshold = stretched >= 145 ? 255 : 0
    data[i] = threshold
    data[i + 1] = threshold
    data[i + 2] = threshold
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
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
  const merged = new Set<string>()
  for (const result of results) {
    for (const line of result.text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) merged.add(trimmed)
    }
  }

  if (merged.size === 0) {
    return { text: results[0]?.text ?? '', maxConfidence }
  }
  return { text: [...merged].join('\n'), maxConfidence }
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

  let bestFailure: RockScanOcrParseResult | null = null
  let bestFailureScore = -1
  let previousScore = -1
  let lastOcrText = ''
  let maxOcrConfidence = 0

  for (let attempt = 0; attempt < OCR_PREPROCESS_SCALES.length; attempt++) {
    const scale = OCR_PREPROCESS_SCALES[attempt]
    const preprocessed = preprocessCrop(deskewed, deskewed.width, deskewed.height, scale)
    const ocr = await runMultiPassOcr(preprocessed)
    lastOcrText = ocr.text
    maxOcrConfidence = Math.max(maxOcrConfidence, ocr.maxConfidence)
    const parsed = parseRockScanOcrText(ocr.text)

    if (parsed.ok) return parsed

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

  const failure =
    bestFailure ?? {
      ok: false as const,
      error: 'OCR returned no readable text — try a tighter crop around SCAN RESULTS.',
    }

  return attachFailureHints(failure, legibility, maxOcrConfidence, lastOcrText)
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

export const DEFAULT_CROP_RECT: NormalizedCropRect = {
  x: 0.55,
  y: 0.08,
  width: 0.4,
  height: 0.55,
}
