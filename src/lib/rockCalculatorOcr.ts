import type { PSM, Worker } from 'tesseract.js'
import {
  detectTextLineBands,
  extractLineCanvas,
  OCR_USER_DPI,
  preprocessHudCrop,
  preprocessHudCropBinary,
  scaleLineToTargetXHeight,
  type TextLineBand,
} from './rockCalculatorOcrPreprocess'
import {
  parseRockScanOcrText,
  parseRockScanOcrWords,
  scoreRockScanOcrParseAttempt,
  type OcrWordBox,
  type RockScanOcrParseResult,
} from './rockCalculatorOcrParse'
import { ROCK_OCR_CHAR_WHITELIST } from './rockCalculatorOcrWordlist'

export interface NormalizedCropRect {
  x: number
  y: number
  width: number
  height: number
}

const OCR_PREPROCESS_SCALES = [2, 3, 4] as const
const MIN_DETECTED_LINES = 5

interface LineOcrPassResult {
  text: string
  confidence: number
  words: OcrWordBox[]
  parsed: RockScanOcrParseResult
  parseScore: number
  lineCount: number
}

interface OcrScaleEscalationResult {
  success: RockScanOcrParseResult | null
  bestFailure: RockScanOcrParseResult | null
  bestFailureScore: number
}

function mapTesseractWords(
  data: {
    words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>
  },
  lineOffsetY: number,
  lineScale: number
): OcrWordBox[] {
  if (!data.words?.length) return []
  return data.words
    .filter((word) => word.text.trim().length > 0)
    .map((word) => ({
      text: word.text,
      x0: word.bbox.x0 / lineScale,
      y0: word.bbox.y0 / lineScale + lineOffsetY,
      x1: word.bbox.x1 / lineScale,
      y1: word.bbox.y1 / lineScale + lineOffsetY,
    }))
}

function parseOcrOutput(text: string, words: OcrWordBox[]): RockScanOcrParseResult {
  if (words.length) return parseRockScanOcrWords(text, words)
  return parseRockScanOcrText(text)
}

let activeWorker: Worker | null = null
let workerReady: Promise<{ worker: Worker; PsmEnum: typeof import('tesseract.js').PSM }> | null =
  null

export async function terminateOcrWorker(): Promise<void> {
  if (!activeWorker) return
  await activeWorker.terminate()
  activeWorker = null
  workerReady = null
}

async function getWorker(): Promise<{ worker: Worker; PsmEnum: typeof import('tesseract.js').PSM }> {
  if (workerReady) return workerReady

  workerReady = (async () => {
    const { createWorker, PSM: PsmEnum, OEM } = await import('tesseract.js')
    const worker = await createWorker('eng', OEM.LSTM_ONLY)
    await worker.setParameters({
      tessedit_pageseg_mode: PsmEnum.SINGLE_LINE,
      preserve_interword_spaces: '1',
      user_defined_dpi: String(OCR_USER_DPI),
      tessedit_char_whitelist: ROCK_OCR_CHAR_WHITELIST,
      tessedit_enable_dict_correction: '0',
      textord_min_xheight: '8',
      min_sane_x_ht_pixels: '8',
    })
    activeWorker = worker
    return { worker, PsmEnum }
  })()

  return workerReady
}

async function recognizeLine(
  worker: Worker,
  lineCanvas: HTMLCanvasElement,
  psm: PSM,
  lineOffsetY: number,
  lineScale: number
): Promise<{ text: string; confidence: number; words: OcrWordBox[] }> {
  await worker.setParameters({ tessedit_pageseg_mode: psm })
  const result = await worker.recognize(lineCanvas)
  const text = (result.data.text ?? '').replace(/\s+/g, ' ').trim()
  const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : 0
  const words = mapTesseractWords(result.data, lineOffsetY, lineScale)
  return { text, confidence, words }
}

async function runLineByLineOcr(
  preprocessed: HTMLCanvasElement,
  bands: TextLineBand[]
): Promise<LineOcrPassResult> {
  const { worker, PsmEnum } = await getWorker()
  const lines: string[] = []
  const words: OcrWordBox[] = []
  let confidenceTotal = 0
  let confidenceCount = 0

  for (const band of bands) {
    const rawLine = extractLineCanvas(preprocessed, band)
    const scaled = scaleLineToTargetXHeight(rawLine)
    const lineOffsetY = band.y0

    const result = await recognizeLine(
      worker,
      scaled.canvas,
      PsmEnum.SINGLE_LINE,
      lineOffsetY,
      scaled.scale
    )
    if (result.text) {
      lines.push(result.text)
      words.push(...result.words)
      if (result.confidence > 0) {
        confidenceTotal += result.confidence
        confidenceCount++
      }
    }
  }

  const text = lines.join('\n')
  const confidence = confidenceCount ? confidenceTotal / confidenceCount : 0
  const parsed = parseOcrOutput(text, words)
  const parseScore = scoreRockScanOcrParseAttempt(parsed)

  return {
    text,
    confidence,
    words,
    parsed,
    parseScore,
    lineCount: lines.length,
  }
}

async function runOcrScaleEscalation(
  deskewed: HTMLCanvasElement,
  useBinary: boolean
): Promise<OcrScaleEscalationResult> {
  let bestFailure: RockScanOcrParseResult | null = null
  let bestFailureScore = -1
  let bestSuccess: RockScanOcrParseResult | null = null
  let bestSuccessScore = -1
  let previousScore = -1

  for (let attempt = 0; attempt < OCR_PREPROCESS_SCALES.length; attempt++) {
    const scale = OCR_PREPROCESS_SCALES[attempt]
    const preprocessed = useBinary
      ? preprocessHudCropBinary(deskewed, deskewed.width, deskewed.height, scale)
      : preprocessHudCrop(deskewed, deskewed.width, deskewed.height, scale)

    const bands = detectTextLineBands(preprocessed)
    if (bands.length < MIN_DETECTED_LINES) {
      continue
    }

    const pass = await runLineByLineOcr(preprocessed, bands)

    if (pass.parsed.ok) {
      if (pass.parseScore > bestSuccessScore) {
        bestSuccessScore = pass.parseScore
        bestSuccess = pass.parsed
      }
    } else if (pass.parseScore > bestFailureScore) {
      bestFailureScore = pass.parseScore
      bestFailure = pass.parsed
    }

    const isLastScale = attempt === OCR_PREPROCESS_SCALES.length - 1
    if (isLastScale) break
    if (attempt > 0 && pass.parseScore < previousScore) break
    previousScore = pass.parseScore
  }

  if (bestSuccess) {
    return { success: bestSuccess, bestFailure: null, bestFailureScore: -1 }
  }

  return { success: null, bestFailure, bestFailureScore }
}

function pickBestOcrFailure(...passes: OcrScaleEscalationResult[]): OcrScaleEscalationResult {
  return passes.reduce((best, pass) =>
    pass.bestFailureScore > best.bestFailureScore ? pass : best
  )
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
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height)
  return canvas
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
    return { ok: false, error: 'Crop area is too small — drag a larger box around the RESULTS panel.' }
  }

  const deskewed = rotateCanvas(rawCrop, deskewDegrees)

  const cleanPass = await runOcrScaleEscalation(deskewed, false)
  if (cleanPass.success) return cleanPass.success

  const binaryPass = await runOcrScaleEscalation(deskewed, true)
  if (binaryPass.success) return binaryPass.success

  const bestPass = pickBestOcrFailure(cleanPass, binaryPass)
  return (
    bestPass.bestFailure ?? {
      ok: false,
      error:
        'OCR could not read enough RESULTS lines — crop the full panel (RESULTS header through composition rows).',
    }
  )
}

export function loadImageFromFile(file: File): Promise<{
  image: HTMLImageElement
  objectUrl: string
  width: number
  height: number
}> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        if (typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(file)
          const width = bitmap.width
          const height = bitmap.height
          if (width < 1 || height < 1) {
            bitmap.close()
            reject(new Error('Pasted image has no pixel data — try ALT+PrtSc again.'))
            return
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            bitmap.close()
            reject(new Error('Could not load pasted image.'))
            return
          }
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()

          const blob = await new Promise<Blob | null>((res) =>
            canvas.toBlob((b) => res(b), 'image/png')
          )
          if (!blob) {
            reject(new Error('Could not load pasted image.'))
            return
          }

          const objectUrl = URL.createObjectURL(blob)
          const image = new Image()
          image.onload = () => {
            void (async () => {
              try {
                if (typeof image.decode === 'function') await image.decode()
              } catch {
                // onload dimensions are still valid
              }
              resolve({ image, objectUrl, width, height })
            })()
          }
          image.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('Could not load pasted image.'))
          }
          image.src = objectUrl
          return
        }
      } catch {
        // fall through to blob URL load
      }

      const objectUrl = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        void (async () => {
          try {
            if (typeof image.decode === 'function') await image.decode()
          } catch {
            // onload dimensions are still valid
          }

          const width = image.naturalWidth
          const height = image.naturalHeight
          if (width < 1 || height < 1) {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('Pasted image has no pixel data — try ALT+PrtSc again.'))
            return
          }

          resolve({ image, objectUrl, width, height })
        })()
      }
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Could not load pasted image.'))
      }
      image.src = objectUrl
    })()
  })
}

/** 16:9 reference capture (member 2560×1440) and ideal RESULTS panel crop (382×549). */
const REFERENCE_DISPLAY = { width: 2560, height: 1440 } as const
const REFERENCE_PANEL = { width: 382, height: 549 } as const
const REFERENCE_CROP_ORIGIN = { x: 2170, y: 115 } as const

function clampCropFraction(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

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
