/** Shared ore constants (no imports — avoids circular deps between parsers). */

export const HAND_MINEABLE_ORES = new Set([
  'Aphorite',
  'Dolivine',
  'Hadanite',
  'Janalite',
  'Glacosite',
  'Feynmaline',
  'Sadaryx',
])

export const GROUND_VEHICLE_GEMS = new Set(['Beradom', 'Glacosite', 'Feynmaline'])

/** Strip trailing parenthetical from desc mineable lines, e.g. "Janalite (Caves only)". */
export function stripMineableLabel(raw) {
  return String(raw || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}
