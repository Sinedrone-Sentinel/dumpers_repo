import {
  DEFAULT_CROP_RECT,
  defaultCropRectForImage,
  type NormalizedCropRect,
} from './rockCalculatorOcr'

const STORAGE_KEY_V2 = 'dumpers_repo_rock_scan_ocr_viewer_v2'
const STORAGE_KEY_V1 = 'dumpers_repo_rock_scan_ocr_crop_v1'

export const OCR_MIN_ZOOM = 1
export const OCR_MAX_ZOOM = 5

export interface OcrViewerState {
  crop: NormalizedCropRect
  zoom: number
  panX: number
  panY: number
  deskewDegrees: number
}

const _DEFAULT_VIEWER_STATE: OcrViewerState = {
  crop: DEFAULT_CROP_RECT,
  zoom: 1,
  panX: 0,
  panY: 0,
  deskewDegrees: 0,
}

function isValidCropRect(value: unknown): value is NormalizedCropRect {
  if (!value || typeof value !== 'object') return false
  const crop = value as Record<string, unknown>
  const { x, y, width, height } = crop
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return false
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return false
  }
  if (width < 0.02 || height < 0.02) return false
  if (x < 0 || y < 0 || x + width > 1.0001 || y + height > 1.0001) return false
  return true
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(OCR_MAX_ZOOM, Math.max(OCR_MIN_ZOOM, value))
}

function normalizeViewerState(raw: Partial<OcrViewerState>, cropFallback: NormalizedCropRect): OcrViewerState {
  const zoom = clampZoom(raw.zoom ?? 1)
  const deskew = raw.deskewDegrees
  const deskewDegrees =
    typeof deskew === 'number' && Number.isFinite(deskew) ? Math.min(4, Math.max(-4, deskew)) : 0

  let panX = typeof raw.panX === 'number' && Number.isFinite(raw.panX) ? raw.panX : 0
  let panY = typeof raw.panY === 'number' && Number.isFinite(raw.panY) ? raw.panY : 0
  if (zoom <= 1) {
    panX = 0
    panY = 0
  }

  return {
    crop: isValidCropRect(raw.crop) ? raw.crop : cropFallback,
    zoom,
    panX,
    panY,
    deskewDegrees,
  }
}

function readLegacyCropRect(): NormalizedCropRect | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY_V1) ?? 'null')
    return isValidCropRect(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function readSavedOcrViewerState(cropFallback = DEFAULT_CROP_RECT): OcrViewerState {
  if (typeof localStorage === 'undefined') {
    return normalizeViewerState({ crop: cropFallback }, cropFallback)
  }

  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY_V2) ?? 'null')
    if (parsed && typeof parsed === 'object') {
      return normalizeViewerState(parsed as Partial<OcrViewerState>, cropFallback)
    }
  } catch {
    // fall through to legacy crop migration
  }

  const legacyCrop = readLegacyCropRect()
  return normalizeViewerState({ crop: legacyCrop ?? cropFallback }, cropFallback)
}

export function writeSavedOcrViewerState(state: OcrViewerState): void {
  if (typeof localStorage === 'undefined') return
  const normalized = normalizeViewerState(state, state.crop)
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(normalized))
}

export function writeSavedOcrCropRect(crop: NormalizedCropRect): void {
  if (!isValidCropRect(crop)) return
  const current = readSavedOcrViewerState(crop)
  writeSavedOcrViewerState({ ...current, crop })
}

export function patchSavedOcrViewerState(patch: Partial<OcrViewerState>): OcrViewerState {
  const current = readSavedOcrViewerState(patch.crop ?? DEFAULT_CROP_RECT)
  const next = normalizeViewerState({ ...current, ...patch }, current.crop)
  writeSavedOcrViewerState(next)
  return next
}

export function initialOcrCropRect(): NormalizedCropRect {
  return readSavedOcrViewerState().crop
}

export function initialOcrViewerState(): OcrViewerState {
  return readSavedOcrViewerState()
}

export function resolveOcrCropForImage(imageWidth: number, imageHeight: number): NormalizedCropRect {
  const saved = readSavedOcrViewerState(defaultCropRectForImage(imageWidth, imageHeight))
  return saved.crop
}

export function resolveOcrViewerForImage(imageWidth: number, imageHeight: number): OcrViewerState {
  return readSavedOcrViewerState(defaultCropRectForImage(imageWidth, imageHeight))
}
