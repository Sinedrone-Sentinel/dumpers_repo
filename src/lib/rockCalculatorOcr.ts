import type { PSM } from 'tesseract.js'
import {
  parseRockScanOcrText,
  parseRockScanOcrWords,
  scoreRockScanOcrParseAttempt,
  type OcrWordBox,
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

function applyBinaryThreshold(data: Uint8ClampedArray, threshold: number): void {
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
  if (!ctx) {
    const fallback = canvas.getContext('2d')
    return {
      canvas,
      imageData: new ImageData(Math.max(1, canvas.width), Math.max(1, canvas.height)),
      ctx: fallback!,
    }
  }

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

/** Contrast-stretched grayscale only — no binary crush. Primary OCR path for HUD text. */
function preprocessCropClean(
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number
): HTMLCanvasElement {
  const stretched = stretchLuminanceToCanvas(source, width, height, scale)
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

interface OcrPassResult {
  text: string
  confidence: number
  words: OcrWordBox[]
  parsed: RockScanOcrParseResult
  parseScore: number
}

interface OcrScaleEscalationResult {
  success: RockScanOcrParseResult | null
  bestFailure: RockScanOcrParseResult | null
  bestFailureScore: number
}

function mapTesseractWords(data: {
  words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>
}): OcrWordBox[] {
  if (!data.words?.length) return []
  return data.words
    .filter((word) => word.text.trim().length > 0)
    .map((word) => ({
      text: word.text,
      x0: word.bbox.x0,
      y0: word.bbox.y0,
      x1: word.bbox.x1,
      y1: word.bbox.y1,
    }))
}

function parseOcrOutput(text: string, words: OcrWordBox[]): RockScanOcrParseResult {
  if (words.length) return parseRockScanOcrWords(text, words)
  return parseRockScanOcrText(text)
}

/** Run 2× → 3× → 4× with one preprocess variant; escalate only if parse score does not improve. */
async function runOcrScaleEscalation(
  deskewed: HTMLCanvasElement,
  preprocess: CropPreprocessFn
): Promise<OcrScaleEscalationResult> {
  let bestFailure: RockScanOcrParseResult | null = null
  let bestFailureScore = -1
  let previousScore = -1

  for (let attempt = 0; attempt < OCR_PREPROCESS_SCALES.length; attempt++) {
    const scale = OCR_PREPROCESS_SCALES[attempt]
    const preprocessed = preprocess(deskewed, deskewed.width, deskewed.height, scale)
    const pass = await runBestOcrPass(preprocessed)

    if (pass.parsed.ok) {
      return { success: pass.parsed, bestFailure: null, bestFailureScore: -1 }
    }

    if (pass.parseScore > bestFailureScore) {
      bestFailureScore = pass.parseScore
      bestFailure = pass.parsed
    }

    const isLastScale = attempt === OCR_PREPROCESS_SCALES.length - 1
    if (isLastScale) break
    if (attempt > 0 && pass.parseScore < previousScore) break
    previousScore = pass.parseScore
  }

  return { success: null, bestFailure, bestFailureScore }
}

function pickBestOcrFailure(...passes: OcrScaleEscalationResult[]): OcrScaleEscalationResult {
  return passes.reduce((best, pass) =>
    pass.bestFailureScore > best.bestFailureScore ? pass : best
  )
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
  ctx.imageSmoothingEnabled = false
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

async function recognizePass(canvas: HTMLCanvasElement, psm: PSM): Promise<OcrPassResult> {
  const { worker } = await getWorker()
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })
  const result = await worker.recognize(canvas)
  const text = result.data.text ?? ''
  const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : 0
  const words = mapTesseractWords(result.data)
  const parsed = parseOcrOutput(text, words)
  return {
    text,
    confidence,
    words,
    parsed,
    parseScore: scoreRockScanOcrParseAttempt(parsed),
  }
}

/** Try multiple page layouts; pick the pass that parses the most complete scan. */
async function runBestOcrPass(canvas: HTMLCanvasElement): Promise<OcrPassResult> {
  const { PsmEnum } = await getWorker()
  const modes: PSM[] = [PsmEnum.SINGLE_BLOCK, PsmEnum.SINGLE_COLUMN, PsmEnum.SPARSE_TEXT]
  const passes = await Promise.all(modes.map((psm) => recognizePass(canvas, psm)))

  passes.sort((a, b) => {
    if (b.parseScore !== a.parseScore) return b.parseScore - a.parseScore
    return b.confidence - a.confidence
  })

  return passes[0] ?? {
    text: '',
    confidence: 0,
    words: [],
    parsed: { ok: false, error: 'OCR returned no readable text — try a tighter crop around SCAN RESULTS.' },
    parseScore: 0,
  }
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

  const cleanPass = await runOcrScaleEscalation(deskewed, preprocessCropClean)
  if (cleanPass.success) return cleanPass.success

  const orangePass = await runOcrScaleEscalation(deskewed, preprocessCropOrangeHud)
  if (orangePass.success) return orangePass.success

  const binaryPass = await runOcrScaleEscalation(deskewed, preprocessCrop)
  if (binaryPass.success) return binaryPass.success

  const bestPass = pickBestOcrFailure(cleanPass, orangePass, binaryPass)
  return (
    bestPass.bestFailure ?? {
      ok: false,
      error: 'OCR returned no readable text — try a tighter crop around SCAN RESULTS.',
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

/** 16:9 reference capture (member 2560×1440) and ideal SCAN RESULTS panel crop (382×549). */
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
