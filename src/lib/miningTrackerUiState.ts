const STORAGE_KEY = 'dumpers_repo_mining_tracker_ui_v1'

export interface MiningTrackerUiState {
  smartCrackerExpanded: boolean
  calculatorDetailsExpanded: boolean
}

const DEFAULT_STATE: MiningTrackerUiState = {
  smartCrackerExpanded: false,
  calculatorDetailsExpanded: false,
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readMiningTrackerUiState(): MiningTrackerUiState {
  if (typeof localStorage === 'undefined') return DEFAULT_STATE

  const parsed = safeParse<Partial<MiningTrackerUiState>>(
    localStorage.getItem(STORAGE_KEY),
    DEFAULT_STATE
  )

  return {
    smartCrackerExpanded: parsed.smartCrackerExpanded === true,
    calculatorDetailsExpanded: parsed.calculatorDetailsExpanded === true,
  }
}

export function writeMiningTrackerUiState(update: Partial<MiningTrackerUiState>): void {
  if (typeof localStorage === 'undefined') return

  const current = readMiningTrackerUiState()
  const next: MiningTrackerUiState = {
    smartCrackerExpanded: update.smartCrackerExpanded ?? current.smartCrackerExpanded,
    calculatorDetailsExpanded:
      update.calculatorDetailsExpanded ?? current.calculatorDetailsExpanded,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}
