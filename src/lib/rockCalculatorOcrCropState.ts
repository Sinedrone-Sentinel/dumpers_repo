import {
  DEFAULT_CROP_RECT,
  defaultCropRectForImage,
  type NormalizedCropRect,
} from './rockCalculatorOcr'

const STORAGE_KEY = 'dumpers_repo_rock_scan_ocr_crop_v1'

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

export function readSavedOcrCropRect(): NormalizedCropRect | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return isValidCropRect(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeSavedOcrCropRect(crop: NormalizedCropRect): void {
  if (typeof localStorage === 'undefined' || !isValidCropRect(crop)) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(crop))
}

export function initialOcrCropRect(): NormalizedCropRect {
  return readSavedOcrCropRect() ?? DEFAULT_CROP_RECT
}

export function resolveOcrCropForImage(imageWidth: number, imageHeight: number): NormalizedCropRect {
  return readSavedOcrCropRect() ?? defaultCropRectForImage(imageWidth, imageHeight)
}
