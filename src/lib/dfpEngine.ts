import { DFP_CANONICAL_BASE_URL } from '../config/site'

export interface DfpEngineApi {
  calculateMaterialDfpPrice: (resourceName: string, minQuality: number, scuQuantity: number) => number
  calculateBlueprintDfp: (blueprint: unknown) => {
    materialTotal: number
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
    typeModifier: number
    total: number
    lines: unknown[]
  }
  isAmmoBlueprint: (blueprint: { categoryName?: string }) => boolean
}

let engine: DfpEngineApi | null = null
let loadPromise: Promise<DfpEngineApi> | null = null

function engineBaseUrl(): string {
  if (import.meta.env.DEV) return ''
  const override = import.meta.env.VITE_DFP_ENGINE_BASE_URL as string | undefined
  if (override) return override.replace(/\/$/, '')
  return DFP_CANONICAL_BASE_URL
}

function assetUrl(base: string, file: string): string {
  return base ? `${base}/${file}` : `/${file}`
}

async function verifyAndImport(moduleUrl: string, expectedSha256: string): Promise<DfpEngineApi> {
  const res = await fetch(moduleUrl, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`DFP engine fetch failed (${res.status})`)
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
      const manifestRes = await fetch(assetUrl(base, 'dfp-version.json'), { cache: 'no-cache' })
      if (!manifestRes.ok) throw new Error(`DFP manifest fetch failed (${manifestRes.status})`)
      const manifest = (await manifestRes.json()) as { sha256: string; module?: string }
      const moduleName = manifest.module ?? 'dfp-engine.js'
      const loaded = await verifyAndImport(assetUrl(base, moduleName), manifest.sha256)
      engine = loaded
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
