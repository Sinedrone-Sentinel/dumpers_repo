-- =============================================================================
-- 189: Smart Cracker advisor rate limit (Edge proxy guard)
-- =============================================================================
-- Members bring their own Gemini key. This table only caps asks against our
-- Edge Function so it is not an open Gemini proxy. No API keys are stored.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mining_advisor_rate_buckets (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  ask_count integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.mining_advisor_rate_buckets IS
  'Per-member hourly counters for mining-loadout-advisor Edge invokes. No API keys.';

ALTER TABLE public.mining_advisor_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mining_advisor_rate_buckets FROM PUBLIC;
REVOKE ALL ON TABLE public.mining_advisor_rate_buckets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.mining_advisor_try_consume(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer := 20;
  v_window interval := interval '1 hour';
  v_row public.mining_advisor_rate_buckets%ROWTYPE;
  v_retry integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'missing_user');
  END IF;

  DELETE FROM public.mining_advisor_rate_buckets
  WHERE window_start < (now() - interval '2 days');

  INSERT INTO public.mining_advisor_rate_buckets (user_id, window_start, ask_count)
  VALUES (p_user_id, now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.mining_advisor_rate_buckets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_row.window_start < (now() - v_window) THEN
    UPDATE public.mining_advisor_rate_buckets
    SET window_start = now(), ask_count = 1
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('allowed', true, 'ask_count', 1, 'retry_after_sec', 0);
  END IF;

  IF v_row.ask_count >= v_max THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_row.window_start + v_window) - now()))));
    RETURN jsonb_build_object(
      'allowed', false,
      'ask_count', v_row.ask_count,
      'retry_after_sec', v_retry
    );
  END IF;

  UPDATE public.mining_advisor_rate_buckets
  SET ask_count = ask_count + 1
  WHERE user_id = p_user_id
  RETURNING ask_count INTO v_row.ask_count;

  RETURN jsonb_build_object(
    'allowed', true,
    'ask_count', v_row.ask_count,
    'retry_after_sec', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mining_advisor_try_consume(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mining_advisor_try_consume(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mining_advisor_try_consume(uuid) TO service_role;
