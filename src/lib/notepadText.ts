/** Keep in sync with the user_notepads CHECK in supabase/migrations/207_user_notepads.sql. */
export const NOTEPAD_MAX_CHARS = 2000

/** Cap to the limit without trimming — blank lines and spacing are kept exactly. */
export function clampNotepad(text: string | null | undefined): string {
  const value = text ?? ''
  return value.length > NOTEPAD_MAX_CHARS ? value.slice(0, NOTEPAD_MAX_CHARS) : value
}
