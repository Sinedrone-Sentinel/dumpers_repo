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
  phaseEndsAt: number
  cycleStart: number
  cycleMs: number
  timeInCycle: number
}

export interface HangarBrief {
  title: string
  where: string
  next: string
  boards: string
}

export interface HangarPhaseTimer {
  id: HangarPhase
  label: string
  /** remaining = this phase is underway. starts = countdown until it begins. */
  kind: 'remaining' | 'starts'
  at: number
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
  const phaseEndsAt = phase === 'insert'
    ? cycleStart + INSERT_MS
    : phase === 'blackout'
      ? cycleStart + 65 * MINUTE
      : cycleStart + cycleMs
  return {
    lights: step.lights,
    phase,
    nextChangeAt: nowMs + (nextMark - timeInCycle),
    insertOpensAt,
    insertEndsAt: insertOpensAt + INSERT_MS,
    phaseEndsAt,
    cycleStart,
    cycleMs,
    timeInCycle,
  }
}

function lightNumbers(lights: HangarLight[], color: HangarLight): number[] {
  const numbers: number[] = []
  lights.forEach((light, index) => {
    if (light === color) numbers.push(index + 1)
  })
  return numbers
}

function lightList(numbers: number[]): string {
  const names = numbers.map((number) => String(number))
  if (names.length <= 1) return names[0] ? `Light ${names[0]}` : ''
  if (names.length === 2) return `Lights ${names[0]} and ${names[1]}`
  return `Lights ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/** Plain-language description of this exact step. */
export function hangarBrief(lights: HangarLight[]): HangarBrief {
  const phase = phaseOf(lights)
  const greens = lightNumbers(lights, 'green')
  const reds = lightNumbers(lights, 'red')
  const offs = lightNumbers(lights, 'off')
  if (phase === 'blackout') {
    return {
      title: 'Powered down',
      where: 'All five lights are dark. This is the gap between cycles.',
      next: 'All five lights turn red',
      boards: 'Compboards do not work.',
    }
  }
  if (phase === 'charging') {
    const nextGreen = reds[0]
    if (greens.length === 0) {
      return {
        title: 'Charging',
        where: 'All five lights are red. Charging just started. None have turned green yet.',
        next: 'Light 1 turns green',
        boards: 'Compboards do not work while any light is red.',
      }
    }
    const lastRed = reds.length === 1
    return {
      title: 'Charging',
      where: `${lightList(greens)} ${greens.length === 1 ? 'is' : 'are'} green. ${lightList(reds)} ${reds.length === 1 ? 'is' : 'are'} still red.`,
      next: `Light ${nextGreen} turns green`,
      boards: lastRed
        ? 'When that last red light turns green, the compboard window opens.'
        : 'Compboards do not work while any light is red.',
    }
  }
  if (offs.length === 0) {
    return {
      title: 'Compboards',
      where: 'All five lights are green. This is the start of the compboard window.',
      next: 'Light 5 goes dark',
      boards: 'Insert all 7 compboards now.',
    }
  }
  const nextDark = greens[greens.length - 1]
  const lastGreen = greens.length === 1
  return {
    title: 'Compboards',
    where: `${lightList(greens)} ${greens.length === 1 ? 'is' : 'are'} still green. ${lightList(offs)} ${offs.length === 1 ? 'has' : 'have'} gone dark.`,
    next: `Light ${nextDark} goes dark`,
    boards: lastGreen
      ? 'Compboards still work. When this last green light goes dark, the hangar powers down.'
      : 'Compboards still work.',
  }
}

/** Charging, then the compboard window, then the powered-down gap. Each row counts down. */
export function hangarPhaseTimers(state: HangarSnapshot): HangarPhaseTimer[] {
  const { cycleStart, cycleMs, timeInCycle } = state
  const insertEnd = 60 * MINUTE
  const blackEnd = 65 * MINUTE
  const charging = timeInCycle >= blackEnd
    ? { id: 'charging' as const, label: 'Charging', kind: 'remaining' as const, at: cycleStart + cycleMs }
    : { id: 'charging' as const, label: 'Charging', kind: 'starts' as const, at: cycleStart + blackEnd }
  const insert = timeInCycle < insertEnd
    ? { id: 'insert' as const, label: 'Compboards', kind: 'remaining' as const, at: cycleStart + insertEnd }
    : { id: 'insert' as const, label: 'Compboards', kind: 'starts' as const, at: cycleStart + cycleMs }
  const blackout = timeInCycle < insertEnd
    ? { id: 'blackout' as const, label: 'Powered down', kind: 'starts' as const, at: cycleStart + insertEnd }
    : timeInCycle < blackEnd
      ? { id: 'blackout' as const, label: 'Powered down', kind: 'remaining' as const, at: cycleStart + blackEnd }
      : { id: 'blackout' as const, label: 'Powered down', kind: 'starts' as const, at: cycleStart + cycleMs + insertEnd }
  return [charging, insert, blackout]
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
