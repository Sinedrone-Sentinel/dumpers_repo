import { supabase } from './supabase'
import { clampNotepad } from './notepadText'

/** Saved member note, or null when the account has never saved one. */
export async function fetchMemberNotepad(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_notepads')
    .select('content')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? (data.content ?? '') : null
}

export async function saveMemberNotepad(content: string): Promise<void> {
  const { error } = await supabase.rpc('save_my_notepad', { p_content: clampNotepad(content) })
  if (error) throw error
}
