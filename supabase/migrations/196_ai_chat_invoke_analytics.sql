-- =============================================================================
-- 196: AI chat Edge usage for super-admin Site Analytics
-- =============================================================================
-- Both AI chats already consume an hourly limiter (195). That table is ephemeral
-- (2-day windows) and cannot answer how many Edge invokes, questions, or unique
-- keys ran this month. This adds a Dumper-style 30-day daily rollup.
--
-- Never stored: question text, answers, raw Gemini keys, lock phrases.
-- Identity rows exist only so COUNT(DISTINCT user_id / key_sha256) works — the
-- summary RPC never returns those columns.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_chat_invoke_daily (
  day date NOT NULL,
  feature text NOT NULL CHECK (feature IN ('mining_advisor', 'site_help')),
  invoke_count bigint NOT NULL DEFAULT 0,
  ask_count bigint NOT NULL DEFAULT 0,
  blocked_count bigint NOT NULL DEFAULT 0,
  gemini_ok bigint NOT NULL DEFAULT 0,
  gemini_fail bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, feature)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_invoke_daily_day
  ON public.ai_chat_invoke_daily (day);

COMMENT ON TABLE public.ai_chat_invoke_daily IS
  'Per-feature daily AI chat Edge counters (invokes, asks, rate-limits, Gemini outcomes). Rolling 30 days. No question text, no keys.';

ALTER TABLE public.ai_chat_invoke_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_chat_invoke_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_chat_invoke_daily FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.ai_chat_identity_daily (
  day date NOT NULL,
  feature text NOT NULL CHECK (feature IN ('mining_advisor', 'site_help')),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key_sha256 text NOT NULL CHECK (key_sha256 ~ '^[0-9a-f]{64}$'),
  ask_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, feature, user_id, key_sha256)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_identity_daily_day
  ON public.ai_chat_identity_daily (day);

COMMENT ON TABLE public.ai_chat_identity_daily IS
  'Private daily fingerprints for unique-user / unique-key counts. SHA-256 of the trimmed Gemini key only — never the key. Not exposed to the client.';

ALTER TABLE public.ai_chat_identity_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_chat_identity_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_chat_identity_daily FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Record one event (service_role only; called from AI Edge Functions)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ai_chat_event(
  p_user_id uuid,
  p_feature text,
  p_key_sha256 text,
  p_event text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature text := lower(nullif(trim(p_feature), ''));
  v_event text := lower(nullif(trim(p_event), ''));
  v_hash text := lower(nullif(trim(p_key_sha256), ''));
  v_day date := (timezone('utc', now()))::date;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_feature IS NULL OR v_feature NOT IN ('mining_advisor', 'site_help') THEN
    RETURN;
  END IF;

  IF v_event IS NULL OR v_event NOT IN ('invoke', 'asked', 'blocked', 'gemini_ok', 'gemini_fail') THEN
    RETURN;
  END IF;

  IF v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  INSERT INTO public.ai_chat_invoke_daily (
    day, feature, invoke_count, ask_count, blocked_count, gemini_ok, gemini_fail
  )
  VALUES (
    v_day,
    v_feature,
    CASE WHEN v_event = 'invoke' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'asked' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'blocked' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'gemini_ok' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'gemini_fail' THEN 1 ELSE 0 END
  )
  ON CONFLICT (day, feature) DO UPDATE
  SET
    invoke_count = public.ai_chat_invoke_daily.invoke_count
      + CASE WHEN v_event = 'invoke' THEN 1 ELSE 0 END,
    ask_count = public.ai_chat_invoke_daily.ask_count
      + CASE WHEN v_event = 'asked' THEN 1 ELSE 0 END,
    blocked_count = public.ai_chat_invoke_daily.blocked_count
      + CASE WHEN v_event = 'blocked' THEN 1 ELSE 0 END,
    gemini_ok = public.ai_chat_invoke_daily.gemini_ok
      + CASE WHEN v_event = 'gemini_ok' THEN 1 ELSE 0 END,
    gemini_fail = public.ai_chat_invoke_daily.gemini_fail
      + CASE WHEN v_event = 'gemini_fail' THEN 1 ELSE 0 END;

  IF v_event = 'asked' THEN
    INSERT INTO public.ai_chat_identity_daily (day, feature, user_id, key_sha256, ask_count)
    VALUES (v_day, v_feature, p_user_id, v_hash, 1)
    ON CONFLICT (day, feature, user_id, key_sha256) DO UPDATE
    SET ask_count = public.ai_chat_identity_daily.ask_count + 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_chat_event(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ai_chat_event(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_chat_event(uuid, text, text, text) TO service_role;

-- Keep today + previous 29 days (30-day FIFO window).
CREATE OR REPLACE FUNCTION public.cleanup_ai_chat_invoke_daily()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
  v_extra integer := 0;
  v_cutoff date := (timezone('utc', now()))::date - 29;
BEGIN
  DELETE FROM public.ai_chat_invoke_daily
  WHERE day < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.ai_chat_identity_daily
  WHERE day < v_cutoff;
  GET DIAGNOSTICS v_extra = ROW_COUNT;

  RETURN v_deleted + v_extra;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ai_chat_invoke_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_ai_chat_invoke_daily() TO service_role;

DO $ai_chat_invoke_cron$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup-ai-chat-invoke-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'cleanup-ai-chat-invoke-daily',
    '27 4 * * *',
    $cmd$SELECT public.cleanup_ai_chat_invoke_daily()$cmd$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''cleanup-ai-chat-invoke-daily'', ''27 4 * * *'', $cmd$SELECT public.cleanup_ai_chat_invoke_daily()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule AI chat invoke cleanup cron: %', SQLERRM;
END;
$ai_chat_invoke_cron$;

-- -----------------------------------------------------------------------------
-- Super-admin summary — aggregates only (no user ids, no hashes)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_chat_feature_summary(
  p_feature text,
  p_start date,
  p_end date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'invokes', COALESCE((
      SELECT SUM(invoke_count)::bigint
      FROM public.ai_chat_invoke_daily
      WHERE feature = p_feature AND day >= p_start AND day <= p_end
    ), 0),
    'asks', COALESCE((
      SELECT SUM(ask_count)::bigint
      FROM public.ai_chat_invoke_daily
      WHERE feature = p_feature AND day >= p_start AND day <= p_end
    ), 0),
    'blocked', COALESCE((
      SELECT SUM(blocked_count)::bigint
      FROM public.ai_chat_invoke_daily
      WHERE feature = p_feature AND day >= p_start AND day <= p_end
    ), 0),
    'unique_users', COALESCE((
      SELECT COUNT(DISTINCT user_id)::bigint
      FROM public.ai_chat_identity_daily
      WHERE feature = p_feature AND day >= p_start AND day <= p_end
    ), 0),
    'unique_keys', COALESCE((
      SELECT COUNT(DISTINCT key_sha256)::bigint
      FROM public.ai_chat_identity_daily
      WHERE feature = p_feature AND day >= p_start AND day <= p_end
    ), 0)
  );
$$;

REVOKE ALL ON FUNCTION public.ai_chat_feature_summary(text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_chat_feature_summary(text, date, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_chat_feature_summary(text, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_ai_chat_usage_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 30));
  v_today date := (timezone('utc', now()))::date;
  v_start date := v_today - (v_days - 1);
  v_pace_start date := v_today - 6;
  v_pace_days integer := 7;
  v_total_invokes bigint;
  v_total_asks bigint;
  v_blocked bigint;
  v_gemini_fail bigint;
  v_unique_users bigint;
  v_unique_keys bigint;
  v_pace_invokes bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT
    COALESCE(SUM(invoke_count), 0),
    COALESCE(SUM(ask_count), 0),
    COALESCE(SUM(blocked_count), 0),
    COALESCE(SUM(gemini_fail), 0)
  INTO v_total_invokes, v_total_asks, v_blocked, v_gemini_fail
  FROM public.ai_chat_invoke_daily
  WHERE day >= v_start AND day <= v_today;

  SELECT COUNT(DISTINCT user_id), COUNT(DISTINCT key_sha256)
  INTO v_unique_users, v_unique_keys
  FROM public.ai_chat_identity_daily
  WHERE day >= v_start AND day <= v_today;

  SELECT COALESCE(SUM(invoke_count), 0)
  INTO v_pace_invokes
  FROM public.ai_chat_invoke_daily
  WHERE day >= v_pace_start AND day <= v_today;

  RETURN jsonb_build_object(
    'period_days', v_days,
    'total_invokes', v_total_invokes,
    'total_asks', v_total_asks,
    'blocked', v_blocked,
    'gemini_fail', v_gemini_fail,
    'unique_users', v_unique_users,
    'unique_keys', v_unique_keys,
    'saved_keys', (
      SELECT COUNT(*)::bigint FROM public.mining_advisor_secrets
    ),
    'avg_asks_per_day', CASE
      WHEN v_days > 0 THEN round(v_total_asks::numeric / v_days, 1)
      ELSE 0
    END,
    'avg_invokes_per_day', CASE
      WHEN v_days > 0 THEN round(v_total_invokes::numeric / v_days, 1)
      ELSE 0
    END,
    'pace_invokes_7d', v_pace_invokes,
    'avg_invokes_per_day_7d', round(v_pace_invokes::numeric / v_pace_days, 1),
    'projected_monthly_invokes', round((v_pace_invokes::numeric / v_pace_days) * 30, 0),
    'features', jsonb_build_object(
      'mining_advisor', public.ai_chat_feature_summary('mining_advisor', v_start, v_today),
      'site_help', public.ai_chat_feature_summary('site_help', v_start, v_today)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_chat_usage_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_chat_usage_summary(integer) TO authenticated;

COMMENT ON FUNCTION public.get_ai_chat_usage_summary(integer) IS
  'Super-admin AI chat Edge usage. Period cards use p_days (max 30). Projected monthly = (trailing 7d / 7) x 30. Aggregates only — no user ids or key hashes.';
