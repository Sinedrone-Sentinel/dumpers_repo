import type { RockScanOcrResult } from './rockCalculatorOcrParse'
import { memberFacingRockScanError } from './rockScanMemberCopy'

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:38471'
const BRIDGE_HEALTH_TIMEOUT_MS = 3000

function bridgeBaseUrl(): string {
  const configured = import.meta.env.VITE_ROCK_SCAN_BRIDGE_URL?.trim()
  return configured || DEFAULT_BRIDGE_URL
}

export function rockScanBridgeUrl(): string {
  return bridgeBaseUrl()
}

export interface RockScanBridgeHealth {
  ok: boolean
  calibrated?: boolean
}

export interface RockScanBridgeStatus {
  ok: boolean
  active: boolean
  phase?: string
}

export type RockScanBridgeScanResult =
  | { ok: true; data: RockScanOcrResult; warnings?: string[] }
  | { ok: false; error: string; hints?: string[]; warnings?: string[] }

export async function fetchRockScanBridgeHealth(
  timeoutMs = BRIDGE_HEALTH_TIMEOUT_MS
): Promise<RockScanBridgeHealth | null> {
  try {
    const response = await fetch(`${bridgeBaseUrl()}/health`, {
      mode: 'cors',
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

export async function fetchRockScanBridgeStatus(
  timeoutMs = 1500
): Promise<RockScanBridgeStatus | null> {
  try {
    const response = await fetch(`${bridgeBaseUrl()}/scan/status`, {
      mode: 'cors',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    return (await response.json()) as RockScanBridgeStatus
  } catch {
    return null
  }
}

export async function requestRockScanFromBridge(
  timeoutMs = 120_000,
  onPhase?: (phase: string) => void
): Promise<RockScanBridgeScanResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let pollTimer: ReturnType<typeof setInterval> | undefined
  if (onPhase) {
    const poll = async () => {
      const status = await fetchRockScanBridgeStatus(2000)
      if (status?.active && status.phase) onPhase(status.phase)
    }
    void poll()
    pollTimer = setInterval(() => void poll(), 600)
  }

  try {
    const response = await fetch(`${bridgeBaseUrl()}/scan`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })

    let payload: RockScanBridgeScanResult
    try {
      payload = (await response.json()) as RockScanBridgeScanResult
    } catch {
      return { ok: false, error: memberFacingRockScanError('Rock scan bridge returned invalid JSON.') }
    }

    if (!response.ok) {
      return {
        ok: false,
        error: memberFacingRockScanError(
          payload.error ?? `Rock scan failed (HTTP ${response.status}).`
        ),
        hints: payload.hints,
        warnings: payload.warnings,
      }
    }

    if (!payload.ok || !payload.data) {
      return {
        ok: false,
        error: memberFacingRockScanError(
          payload.error ?? 'Rock scan bridge did not return calculator data.'
        ),
        hints: payload.hints,
        warnings: payload.warnings,
      }
    }

    return payload
  } finally {
    clearTimeout(timeoutId)
    if (pollTimer) clearInterval(pollTimer)
  }
}
