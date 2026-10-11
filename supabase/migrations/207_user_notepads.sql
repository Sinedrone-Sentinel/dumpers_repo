-- =============================================================================
-- 207: Notepad (header pen-and-pad)
-- =============================================================================
-- One private note per member. Members may SELECT their own row only; saving
-- goes through save_my_notepad (SECURITY DEFINER). Content is stored exactly
-- as typed (no trimming) and capped at 2000 characters — keep in sync with
-- NOTEPAD_MAX_CHARS in src/lib/notepadText.ts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_notepads (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notepads_content_len CHECK (char_length(content) <= 2000)
);

COMMENT ON TABLE public.user_notepads IS
  'Header notepad, one row per member. Writes via save_my_notepad only.';

ALTER TABLE public.user_notepads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_notepads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_notepads TO authenticated;

DROP POLICY IF EXISTS user_notepads_select_own ON public.user_notepads;
CREATE POLICY user_notepads_select_own
  ON public.user_notepads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.save_my_notepad(p_content text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_content text := COALESCE(p_content, '');
  v_saved_at timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to save your notepad';
  END IF;
  IF char_length(v_content) > 2000 THEN
    RAISE EXCEPTION 'Notepad is limited to 2000 characters';
  END IF;

  INSERT INTO public.user_notepads (user_id, content, updated_at)
  VALUES (v_uid, v_content, v_saved_at)
  ON CONFLICT (user_id) DO UPDATE
    SET content = EXCLUDED.content,
        updated_at = EXCLUDED.updated_at;

  RETURN v_saved_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_notepad(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_notepad(text) TO authenticated;
