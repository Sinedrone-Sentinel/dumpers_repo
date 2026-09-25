-- =============================================================================
-- 200: Give back one AI chat ask when Gemini was never called
-- =============================================================================
-- ai_chat_try_consume (195) spends a question before the model responds.
-- Help calls this only when the Gemini request throws before any response,
-- so a prompt that never left the server does not count toward the hour.
-- Apply 195_ai_chat_rate_buckets.sql first.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ai_chat_release(p_user_id uuid, p_feature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature text := lower(nullif(trim(p_feature), ''));
BEGIN
  IF p_user_id IS NULL OR v_feature IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ai_chat_rate_buckets
  SET ask_count = GREATEST(0, ask_count - 1)
  WHERE user_id = p_user_id
    AND feature = v_feature
    AND window_start >= (now() - interval '1 hour')
    AND ask_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_chat_release(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_chat_release(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_chat_release(uuid, text) TO service_role;
