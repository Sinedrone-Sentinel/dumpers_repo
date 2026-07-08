/** Strip trailing parenthetical from desc mineable lines, e.g. "Janalite (Caves only)". */
export function stripMineableLabel(raw: string): string {
  return String(raw || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}
