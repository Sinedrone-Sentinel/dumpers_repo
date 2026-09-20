-- =============================================================================
-- 195: Shared per-feature AI chat rate limiter + member-facing usage meter
-- =============================================================================
-- 189 capped Smart Cracker advisor asks with one counter per member. A second
-- AI chat (site help) would have shared that counter, so heavy help use would
-- lock a member out of the loadout advisor mid-session.
--
-- This rekeys the limiter on (user_id, feature) and adds a read-only usage RPC
-- so each chat can show a live "x/20 this hour" meter. Members bring their own
-- Gemini key; these tables only stop our Edge Functions being an open proxy.
-- No API keys are stored here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_chat_rate_buckets (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature ~ '^[a-z][a-z0-9_]{2,31}$'),
  window_start timestamptz NOT NULL DEFAULT now(),
  ask_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature)
);

COMMENT ON TABLE public.ai_chat_rate_buckets IS
  'Per-member, per-feature hourly counters for AI chat Edge invokes (mining_advisor, site_help). No API keys.';

ALTER TABLE public.ai_chat_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_chat_rate_buckets FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_chat_rate_buckets FROM anon, authenticated;

-- Single source of truth for the cap. Enforcement and the member-facing meter
-- read the same number so they can never disagree.
CREATE OR REPLACE FUNCTION public.ai_chat_feature_max(p_feature text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_feature, ''))
    WHEN 'mining_advisor' THEN 20
    WHEN 'site_help' THEN 20
    ELSE 20
  END;
$$;

-- -----------------------------------------------------------------------------
-- Consume one ask (service_role only; called from Edge Functions)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_chat_try_consume(p_user_id uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature text := lower(nullif(trim(p_feature), ''));
  v_window interval := interval '1 hour';
  v_max integer;
  v_row public.ai_chat_rate_buckets%ROWTYPE;
  v_retry integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'missing_user');
  END IF;

  IF v_feature IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'missing_feature');
  END IF;

  v_max := public.ai_chat_feature_max(v_feature);

  DELETE FROM public.ai_chat_rate_buckets
  WHERE window_start < (now() - interval '2 days');

  INSERT INTO public.ai_chat_rate_buckets (user_id, feature, window_start, ask_count)
  VALUES (p_user_id, v_feature, now(), 0)
  ON CONFLICT (user_id, feature) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.ai_chat_rate_buckets
  WHERE user_id = p_user_id
    AND feature = v_feature
  FOR UPDATE;

  -- Window expired: start a fresh hour with this ask as the first.
  IF v_row.window_start < (now() - v_window) THEN
    UPDATE public.ai_chat_rate_buckets
    SET window_start = now(), ask_count = 1
    WHERE user_id = p_user_id
      AND feature = v_feature;

    RETURN jsonb_build_object(
      'allowed', true,
      'ask_count', 1,
      'max', v_max,
      'resets_in_sec', CEIL(EXTRACT(EPOCH FROM v_window))::int,
      'retry_after_sec', 0
    );
  END IF;

  IF v_row.ask_count >= v_max THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_row.window_start + v_window) - now()))))::int;
    RETURN jsonb_build_object(
      'allowed', false,
      'ask_count', v_row.ask_count,
      'max', v_max,
      'resets_in_sec', v_retry,
      'retry_after_sec', v_retry
    );
  END IF;

  UPDATE public.ai_chat_rate_buckets
  SET ask_count = ask_count + 1
  WHERE user_id = p_user_id
    AND feature = v_feature
  RETURNING ask_count INTO v_row.ask_count;

  RETURN jsonb_build_object(
    'allowed', true,
    'ask_count', v_row.ask_count,
    'max', v_max,
    'resets_in_sec', GREATEST(0, CEIL(EXTRACT(EPOCH FROM ((v_row.window_start + v_window) - now()))))::int,
    'retry_after_sec', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_chat_try_consume(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_chat_try_consume(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_chat_try_consume(uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- Read the caller's own usage (member-callable; never consumes)
-- -----------------------------------------------------------------------------
-- Powers the live "x/20 this hour" meter in each chat. Read-only by design, so
-- polling it can never burn a member's allowance.
CREATE OR REPLACE FUNCTION public.ai_chat_usage(p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_feature text := lower(nullif(trim(p_feature), ''));
  v_window interval := interval '1 hour';
  v_max integer;
  v_row public.ai_chat_rate_buckets%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_feature IS NULL THEN
    RAISE EXCEPTION 'missing_feature';
  END IF;

  v_max := public.ai_chat_feature_max(v_feature);

  SELECT *
  INTO v_row
  FROM public.ai_chat_rate_buckets
  WHERE user_id = v_user
    AND feature = v_feature;

  IF NOT FOUND OR v_row.window_start < (now() - v_window) THEN
    RETURN jsonb_build_object('used', 0, 'max', v_max, 'resets_in_sec', 0);
  END IF;

  RETURN jsonb_build_object(
    'used', v_row.ask_count,
    'max', v_max,
    'resets_in_sec', GREATEST(0, CEIL(EXTRACT(EPOCH FROM ((v_row.window_start + v_window) - now()))))::int
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_chat_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_chat_usage(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Carry 189's counters over, then point the old RPC at the new table
-- -----------------------------------------------------------------------------
-- The wrapper keeps the already-deployed mining-loadout-advisor working until it
-- is redeployed against ai_chat_try_consume.
DO $$
BEGIN
  IF to_regclass('public.mining_advisor_rate_buckets') IS NOT NULL THEN
    INSERT INTO public.ai_chat_rate_buckets (user_id, feature, window_start, ask_count)
    SELECT user_id, 'mining_advisor', window_start, ask_count
    FROM public.mining_advisor_rate_buckets
    ON CONFLICT (user_id, feature) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mining_advisor_try_consume(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ai_chat_try_consume(p_user_id, 'mining_advisor');
$$;

REVOKE ALL ON FUNCTION public.mining_advisor_try_consume(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mining_advisor_try_consume(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mining_advisor_try_consume(uuid) TO service_role;

DROP TABLE IF EXISTS public.mining_advisor_rate_buckets;
