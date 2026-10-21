import savedClock from '../data/executive-hangar-cycle.json'

/** Published hangar clock. Raw GitHub allows a browser read. */
export const HANGAR_CLOCK_URL = 'https://raw.githubusercontent.com/ArkanisCorporation/Exec-Hangar/main/config.json'

const MINUTE = 60_000

export type HangarLight = 'red' | 'green' | 'off'
export type HangarPhase = 'insert' | 'blackout' | 'charging'

export interface HangarClock {
  /** Moment all five lights turn green. */
  initialOpenTime: string
  openDurationMs: number
  closeDurationMs: number
}

export interface HangarSnapshot {
  lights: HangarLight[]
  phase: HangarPhase
  nextChangeAt: number
  /** Start of the current insert window, or the next one when the lights are not ready. */
  insertOpensAt: number
  insertEndsAt: number
}

interface LightStep {
  at: number
  lights: HangarLight[]
}

/** Measured from the all-green instant. Matches the published tracker's light table. */
const STEPS: LightStep[] = [
  { at: 0, lights: ['green', 'green', 'green', 'green', 'green'] },
  { at: 12 * MINUTE, lights: ['green', 'green', 'green', 'green', 'off'] },
  { at: 24 * MINUTE, lights: ['green', 'green', 'green', 'off', 'off'] },
  { at: 36 * MINUTE, lights: ['green', 'green', 'off', 'off', 'off'] },
  { at: 48 * MINUTE, lights: ['green', 'off', 'off', 'off', 'off'] },
  { at: 60 * MINUTE, lights: ['off', 'off', 'off', 'off', 'off'] },
  { at: 65 * MINUTE, lights: ['red', 'red', 'red', 'red', 'red'] },
  { at: 89 * MINUTE, lights: ['green', 'red', 'red', 'red', 'red'] },
  { at: 113 * MINUTE, lights: ['green', 'green', 'red', 'red', 'red'] },
  { at: 137 * MINUTE, lights: ['green', 'green', 'green', 'red', 'red'] },
  { at: 161 * MINUTE, lights: ['green', 'green', 'green', 'green', 'red'] },
]

const INSERT_MS = 60 * MINUTE

export const FALLBACK_CLOCK: HangarClock = {
  initialOpenTime: savedClock.initialOpenTime,
  openDurationMs: savedClock.openDurationMs,
  closeDurationMs: savedClock.closeDurationMs,
}

function phaseOf(lights: HangarLight[]): HangarPhase {
  if (lights.some((light) => light === 'red')) return 'charging'
  if (lights.some((light) => light === 'green')) return 'insert'
  return 'blackout'
}

export function parseHangarClock(raw: unknown): HangarClock | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as { serverStartTimes?: unknown }
  const source = record.serverStartTimes && typeof record.serverStartTimes === 'object'
    ? record.serverStartTimes as Record<string, unknown>
    : raw as Record<string, unknown>
  const initialOpenTime = source.initialOpenTime
  const openDurationMs = source.openDurationMs
  const closeDurationMs = source.closeDurationMs
  if (typeof initialOpenTime !== 'string' || Number.isNaN(Date.parse(initialOpenTime))) return null
  if (typeof openDurationMs !== 'number' || typeof closeDurationMs !== 'number') return null
  if (!Number.isFinite(openDurationMs) || !Number.isFinite(closeDurationMs)) return null
  if (openDurationMs <= 0 || closeDurationMs <= 0) return null
  return { initialOpenTime, openDurationMs, closeDurationMs }
}

export function hangarState(nowMs: number, clock: HangarClock): HangarSnapshot {
  const openAt = Date.parse(clock.initialOpenTime)
  const cycleMs = clock.openDurationMs + clock.closeDurationMs
  const elapsed = nowMs - openAt
  const timeInCycle = ((elapsed % cycleMs) + cycleMs) % cycleMs
  let step = STEPS[0]
  for (const candidate of STEPS) {
    if (timeInCycle >= candidate.at) step = candidate
  }
  const stepIndex = STEPS.indexOf(step)
  const following = STEPS[stepIndex + 1]?.at
  const nextMark = following != null && following < cycleMs ? following : cycleMs
  const cycleStart = nowMs - timeInCycle
  const phase = phaseOf(step.lights)
  const insertOpensAt = phase === 'insert' ? cycleStart : cycleStart + cycleMs
  return {
    lights: step.lights,
    phase,
    nextChangeAt: nowMs + (nextMark - timeInCycle),
    insertOpensAt,
    insertEndsAt: insertOpensAt + INSERT_MS,
  }
}

export async function loadHangarClock(fetchImpl: typeof fetch = fetch): Promise<{ clock: HangarClock; live: boolean }> {
  const fallback = { clock: FALLBACK_CLOCK, live: false }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetchImpl(HANGAR_CLOCK_URL, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) return fallback
    const clock = parseHangarClock(await response.json())
    return clock ? { clock, live: true } : fallback
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
