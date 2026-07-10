import { DUMPER_APPS_DISPLAY_NAME } from '../config/bpDumper'

export const ROCK_SCAN_OFFLINE_MESSAGE = `${DUMPER_APPS_DISPLAY_NAME} is not running on this PC. Open ${DUMPER_APPS_DISPLAY_NAME} from your profile menu, start BP Dumper in watch mode, then try OCR again.`

export const ROCK_SCAN_NOT_CALIBRATED_MESSAGE = `Set up your scan area first: right-click the ${DUMPER_APPS_DISPLAY_NAME} icon in the system tray and choose Calibrate RESULTS panel.`

export const ROCK_SCAN_IN_PROGRESS_MESSAGE =
  'Switched to Star Citizen — confirm the green RESULTS box and press Enter to scan.'

const ERROR_OVERRIDES: Record<string, string> = {
  'Could not find COMP header in OCR text.':
    'Could not read composition from your scan. Keep the full RESULTS panel visible and try again.',
  'Could not find INERT anchor line (bottom of composition list).':
    'Could not read the bottom of the composition list. Check your scan area calibration.',
  'INERT anchor appears above COMP header — check panel crop.':
    'Scan area may be misaligned. Recalibrate the RESULTS panel from the system tray.',
  'Rock scan bridge returned invalid JSON.': 'Scanner response was unreadable. Try OCR again.',
  'Rock scan bridge did not return calculator data.':
    'Scanner did not return rock data. Open the RESULTS panel in-game and try again.',
  'Could not switch to Star Citizen for screen capture.':
    'Could not switch to Star Citizen. Click the game window once, then try OCR again.',
}

const HINT_OVERRIDES: Record<string, string> = {
  'Windows blocked the tray app from bringing the game forward.':
    'Windows did not allow a switch to Star Citizen.',
  'Click the Star Citizen window once, then press OCR again.':
    'Click the Star Citizen window once, then try OCR again.',
  'Right-click the BP Dumper tray icon → Calibrate RESULTS panel.':
    `Right-click the ${DUMPER_APPS_DISPLAY_NAME} tray icon and choose Calibrate RESULTS panel.`,
  'Draw the RESULTS box on the overlay, then press Enter.':
    'Draw a box around the RESULTS panel, then press Enter.',
}

function containsDevLeak(text: string): boolean {
  return /RESTART-TRAY|127\.0\.0\.1|38471|Vite dev|scan bridge offline/i.test(text)
}

export function memberFacingRockScanError(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ROCK_SCAN_OFFLINE_MESSAGE
  if (containsDevLeak(trimmed)) return ROCK_SCAN_OFFLINE_MESSAGE
  if (/Missing calculator-critical fields:/i.test(trimmed)) {
    return 'Could not read all scan fields from the RESULTS panel. Keep the panel fully visible and try again.'
  }
  return ERROR_OVERRIDES[trimmed] ?? trimmed
}

export function memberFacingRockScanHint(raw: string): string {
  const trimmed = raw.trim()
  if (containsDevLeak(trimmed)) return ''
  return HINT_OVERRIDES[trimmed] ?? trimmed
}
