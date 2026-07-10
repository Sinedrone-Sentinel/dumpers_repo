import type { RockScanOcrResult } from './rockCalculatorOcrParse'

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:38471'

function bridgeBaseUrl(): string {
  const configured = import.meta.env.VITE_ROCK_SCAN_BRIDGE_URL?.trim()
  return configured || DEFAULT_BRIDGE_URL
}

export interface RockScanBridgeHealth {
  ok: boolean
  calibrated?: boolean
}

export type RockScanBridgeScanResult =
  | { ok: true; data: RockScanOcrResult; warnings?: string[] }
  | { ok: false; error: string; hints?: string[]; warnings?: string[] }

export async function fetchRockScanBridgeHealth(
  timeoutMs = 800
): Promise<RockScanBridgeHealth | null> {
  try {
    const response = await fetch(`${bridgeBaseUrl()}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    return (await response.json()) as RockScanBridgeHealth
  } catch {
    return null
  }
}

export async function probeRockScanBridge(timeoutMs = 800): Promise<boolean> {
  const health = await fetchRockScanBridgeHealth(timeoutMs)
  return health?.ok === true
}

export async function requestRockScanFromBridge(
  timeoutMs = 120_000
): Promise<RockScanBridgeScanResult> {
  const response = await fetch(`${bridgeBaseUrl()}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(timeoutMs),
  })

  let payload: RockScanBridgeScanResult
  try {
    payload = (await response.json()) as RockScanBridgeScanResult
  } catch {
    return { ok: false, error: 'Rock scan bridge returned invalid JSON.' }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload.error ?? `Rock scan failed (HTTP ${response.status}).`,
      hints: payload.hints,
      warnings: payload.warnings,
    }
  }

  if (!payload.ok || !payload.data) {
    return {
      ok: false,
      error: payload.error ?? 'Rock scan bridge did not return calculator data.',
      hints: payload.hints,
      warnings: payload.warnings,
    }
  }

  return payload
}
