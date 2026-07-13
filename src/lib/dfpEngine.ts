import { DFP_CANONICAL_BASE_URL, DFP_OFFICIAL_HOSTS } from '../config/site'

export interface DfpEngineApi {
  calculateMaterialDfpPrice: (
    resourceName: string,
    minQuality: number,
    scuQuantity: number,
    bandThresholds?: number[],
  ) => number
  calculateBlueprintDfp: (
    blueprint: unknown,
    options?: {
      parts?: { slotIndex: number; quality: number }[]
      craftQuantity?: number
      bandThresholdsForResource?: (resourceName: string) => number[] | undefined
    },
  ) => {
    materialTotal: number
    acquisitionPremium?: number
    craftLaborPremium?: number
    typeModifier: number
    total: number
    lines: unknown[]
  }
  calculateBlueprintDfpForOrder: (
    blueprint: unknown,
    orderMinQuality: number,
    craftQuantity?: number,
  ) => {
    materialTotal: number
    acquisitionPremium?: number
    craftLaborPremium?: number
    typeModifier: number
    total: number
    lines: unknown[]
  }
  isAmmoBlueprint: (blueprint: { categoryName?: string }) => boolean
  /** Wikelo trade pricing (engine >= 1.6.0). total: null = account-bound vehicle (N/A). */
  calculateWikeloTradeDfp?: (trade: {
    category?: string
    isVehicleReward?: boolean
    costs?: {
      entityClass?: string
      resourceName?: string
      name?: string
      amount?: number
      scu?: number
    }[]
  }) => {
    total: number | null
    lines: { name: string; amount: number; lineTotal: number }[]
    unpricedItems: string[]
    isVehicleReward: boolean
  }
}

let engine: DfpEngineApi | null = null
let loadPromise: Promise<DfpEngineApi> | null = null
const readyListeners = new Set<() => void>()

function notifyReady(): void {
  for (const listener of readyListeners) {
    listener()
  }
}

export function subscribeDfpEngineReady(listener: () => void): () => void {
  readyListeners.add(listener)
  return () => readyListeners.delete(listener)
}

const FETCH_TIMEOUT_MS = 20_000

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-cache' })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function engineBaseUrl(): string {
  if (import.meta.env.DEV) return ''
  const override = import.meta.env.VITE_DFP_ENGINE_BASE_URL as string | undefined
  if (override) return override.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if ((DFP_OFFICIAL_HOSTS as readonly string[]).includes(host)) {
      return window.location.origin
    }
  }
  return DFP_CANONICAL_BASE_URL
}

function assetUrl(base: string, file: string): string {
  return base ? `${base}/${file}` : `/${file}`
}

async function verifyAndImport(moduleUrl: string, expectedSha256: string): Promise<DfpEngineApi> {
  const res = await fetchWithTimeout(moduleUrl)
  if (!res.ok) throw new Error(`DFP engine fetch failed (${res.status}) from ${moduleUrl}`)
  const source = await res.text()
  const sha256 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  const hash = Array.from(new Uint8Array(sha256))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  if (hash !== expectedSha256) {
    throw new Error('DFP engine integrity check failed — unauthorized or stale engine')
  }
  const blob = new Blob([source], { type: 'text/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    return (await import(/* @vite-ignore */ blobUrl)) as DfpEngineApi
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export async function ensureDfpEngine(): Promise<DfpEngineApi> {
  if (engine) return engine
  if (!loadPromise) {
    loadPromise = (async () => {
      const base = engineBaseUrl()
      const manifestUrl = assetUrl(base, 'dfp-version.json')
      const manifestRes = await fetchWithTimeout(manifestUrl)
      if (!manifestRes.ok) {
        throw new Error(`DFP manifest fetch failed (${manifestRes.status}) from ${manifestUrl}`)
      }
      const manifest = (await manifestRes.json()) as { sha256: string; module?: string }
      const moduleName = manifest.module ?? 'dfp-engine.js'
      const loaded = await verifyAndImport(assetUrl(base, moduleName), manifest.sha256)
      engine = loaded
      notifyReady()
      return loaded
    })()
  }
  return loadPromise
}

export function getDfpEngine(): DfpEngineApi {
  if (!engine) throw new Error('DFP engine not loaded')
  return engine
}

export function isDfpEngineReady(): boolean {
  return engine != null
}

export function getDfpEngineSnapshot(): boolean {
  return engine != null
}
