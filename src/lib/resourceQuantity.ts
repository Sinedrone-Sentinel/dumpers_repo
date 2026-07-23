import { isWholeUnitResource } from '../config/resourceTypes'

/** Game-aligned SCU precision — ores/salvage locked to 3 decimal places max. */
export const RESOURCE_QUANTITY_DECIMALS = 3
export const RESOURCE_QUANTITY_STEP = 0.001
export const GEM_QUANTITY_STEP = 1

const SCU_SCALE = 10 ** RESOURCE_QUANTITY_DECIMALS

/**
 * Lock free-text / controlled input to at most 3 decimal places while typing.
 * No rounding — extra digits are discarded.
 */
export function lockQuantityInput(raw: string): string {
  if (raw === '') return ''

  const cleaned = raw.replace(/[^\d.]/g, '')
  const dotIdx = cleaned.indexOf('.')
  if (dotIdx === -1) return cleaned

  const before = cleaned.slice(0, dotIdx + 1)
  const after = cleaned
    .slice(dotIdx + 1)
    .replace(/\./g, '')
    .slice(0, RESOURCE_QUANTITY_DECIMALS)

  return before + after
}

/** Integer thousandths-of-SCU — all SCU math should run in this space. */
export function toMilliScu(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0

  const locked = lockQuantityInput(String(value))
  if (!locked || locked === '.') return 0

  const [intPart = '0', decPart = ''] = locked.split('.')
  const dec = decPart.slice(0, RESOURCE_QUANTITY_DECIMALS)
  const decMilli = dec.length === 0 ? 0 : Number(dec.padEnd(RESOURCE_QUANTITY_DECIMALS, '0'))

  return Number(intPart) * SCU_SCALE + decMilli
}

export function fromMilliScu(milli: number): number {
  if (!Number.isFinite(milli) || milli < 0) return 0

  const intMilli = Math.trunc(milli)
  const intPart = Math.trunc(intMilli / SCU_SCALE)
  const decMilli = intMilli % SCU_SCALE
  const decStr = String(decMilli).padStart(RESOURCE_QUANTITY_DECIMALS, '0')

  return Number(`${intPart}.${decStr}`)
}

/** Snap an existing number to the 3-decimal SCU grid (no upward rounding). */
export function normalizeResourceQuantity(value: number): number {
  return fromMilliScu(toMilliScu(value))
}

/** @deprecated Alias — SCU is never rounded, only locked to 3 decimals. */
export const roundResourceQuantity = normalizeResourceQuantity

export function addResourceQuantities(...values: number[]): number {
  let milli = 0
  for (const value of values) {
    milli += toMilliScu(value)
  }
  return fromMilliScu(milli)
}

export function parseResourceQuantity(input: string): number | null {
  const locked = lockQuantityInput(input.trim())
  if (!locked || locked === '.') return null

  const value = Number(locked)
  if (!Number.isFinite(value) || value < 0) return null

  return fromMilliScu(toMilliScu(value))
}

/** Display up to 3 decimal SCU; strips trailing zeros (1.03 not 1.030). */
export function formatResourceQuantity(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return fromMilliScu(toMilliScu(value))
    .toFixed(RESOURCE_QUANTITY_DECIMALS)
    .replace(/\.?0+$/, '')
}

/** Gems and harvest items — whole integers only. */
export function lockGemQuantityInput(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function parseGemQuantity(input: string): number | null {
  const locked = lockGemQuantityInput(input.trim())
  if (!locked) return null
  const value = Number(locked)
  if (!Number.isFinite(value) || value < 1) return null
  return Math.trunc(value)
}

export function normalizeGemQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.trunc(value)
}

export function formatGemQuantity(value: number): string {
  if (!Number.isFinite(value) || value < 1) return '1'
  return String(Math.trunc(value))
}

export function quantityStepForResource(resourceKey: string): number {
  return isWholeUnitResource(resourceKey) ? GEM_QUANTITY_STEP : RESOURCE_QUANTITY_STEP
}

export function adjustStepsForResource(resourceKey: string): readonly number[] {
  return isWholeUnitResource(resourceKey) ? [1, 5] : [0.001, 0.01, 0.1, 1]
}

export function parseQuantityForResource(resourceKey: string, input: string): number | null {
  return isWholeUnitResource(resourceKey) ? parseGemQuantity(input) : parseResourceQuantity(input)
}

export function normalizeQuantityForResource(resourceKey: string, value: number): number {
  return isWholeUnitResource(resourceKey) ? normalizeGemQuantity(value) : normalizeResourceQuantity(value)
}

export function formatQuantityForResource(resourceKey: string, value: number): string {
  return isWholeUnitResource(resourceKey) ? formatGemQuantity(value) : formatResourceQuantity(value)
}

export function lockQuantityInputForResource(resourceKey: string, raw: string): string {
  return isWholeUnitResource(resourceKey) ? lockGemQuantityInput(raw) : lockQuantityInput(raw)
}
