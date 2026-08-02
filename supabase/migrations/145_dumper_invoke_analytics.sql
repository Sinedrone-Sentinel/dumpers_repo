-- BP Dumper Edge usage tracking for super-admin Site Analytics.
-- Rolling 30-day window (FIFO): older daily rows purged once/day via pg_cron.

-- Drop unbounded lifetime counter if an earlier draft of this migration added it.
ALTER TABLE public.user_api_keys
  DROP COLUMN IF EXISTS invoke_count;

CREATE TABLE IF NOT EXISTS public.dumper_invoke_daily (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day date NOT NULL,
  invoke_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_dumper_invoke_daily_day
  ON public.dumper_invoke_daily (day);

ALTER TABLE public.dumper_invoke_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dumper_invoke_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.dumper_invoke_daily FROM anon, authenticated;

COMMENT ON TABLE public.dumper_invoke_daily IS
  'Per-user daily BP Dumper webhook (Edge) invocation counts; rolling 30 days (daily cron prune).';

-- Bump daily counter + last_used_at only (no prune on hot path).
CREATE OR REPLACE FUNCTION public.record_dumper_api_invoke(p_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_day date := (timezone('utc', now()))::date;
BEGIN
  IF p_api_key IS NULL OR length(trim(p_api_key)) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.user_api_keys
  SET last_used_at = now()
  WHERE api_key = trim(p_api_key)
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.dumper_invoke_daily (user_id, day, invoke_count)
  VALUES (v_user_id, v_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE
  SET invoke_count = public.dumper_invoke_daily.invoke_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_dumper_api_invoke(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_dumper_api_invoke(text) TO service_role;

-- Keep today + previous 29 days (30-day FIFO window).
CREATE OR REPLACE FUNCTION public.cleanup_dumper_invoke_daily()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_cutoff date := (timezone('utc', now()))::date - 29;
BEGIN
  DELETE FROM public.dumper_invoke_daily
  WHERE day < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_dumper_invoke_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_dumper_invoke_daily() TO service_role;

DO $dumper_invoke_cron$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup-dumper-invoke-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'cleanup-dumper-invoke-daily',
    '25 4 * * *',
    $cmd$SELECT public.cleanup_dumper_invoke_daily()$cmd$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''cleanup-dumper-invoke-daily'', ''25 4 * * *'', $cmd$SELECT public.cleanup_dumper_invoke_daily()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule dumper invoke cleanup cron: %', SQLERRM;
END;
$dumper_invoke_cron$;

CREATE OR REPLACE FUNCTION public.get_dumper_usage_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Hard-capped at 30 days to match retained data.
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 30));
  v_today date := (timezone('utc', now()))::date;
  v_start date := v_today - (v_days - 1);
  v_active_users bigint;
  v_total_invokes bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT
    COUNT(DISTINCT user_id),
    COALESCE(SUM(invoke_count), 0)
  INTO v_active_users, v_total_invokes
  FROM public.dumper_invoke_daily
  WHERE day >= v_start AND day <= v_today;

  RETURN jsonb_build_object(
    'period_days', v_days,
    'keys_issued', (
      SELECT COUNT(*)::bigint FROM public.user_api_keys
    ),
    'keys_ever_used', (
      SELECT COUNT(*)::bigint
      FROM public.user_api_keys
      WHERE last_used_at IS NOT NULL
    ),
    'active_users', v_active_users,
    'watch_active_now', (
      SELECT COUNT(*)::bigint
      FROM public.profiles
      WHERE dumper_watch_active = true
    ),
    'total_invokes', v_total_invokes,
    'avg_invokes_per_active_user', CASE
      WHEN v_active_users > 0 THEN round(v_total_invokes::numeric / v_active_users, 1)
      ELSE 0
    END,
    'avg_invokes_per_day', CASE
      WHEN v_days > 0 THEN round(v_total_invokes::numeric / v_days, 1)
      ELSE 0
    END,
    'projected_monthly_invokes', CASE
      WHEN v_days > 0 THEN round((v_total_invokes::numeric / v_days) * 30, 0)
      ELSE 0
    END,
    'est_watch_hours', CASE
      -- session_ping every 30s ≈ 120 invokes / hour of watch mode
      WHEN v_total_invokes > 0 THEN round(v_total_invokes::numeric / 120.0, 1)
      ELSE 0
    END,
    'top_users', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.invokes DESC)
      FROM (
        SELECT
          d.user_id,
          coalesce(nullif(trim(p.rsi_handle), ''), nullif(trim(p.display_name), ''), 'Unknown') AS label,
          SUM(d.invoke_count)::bigint AS invokes
        FROM public.dumper_invoke_daily d
        LEFT JOIN public.profiles p ON p.id = d.user_id
        WHERE d.day >= v_start AND d.day <= v_today
        GROUP BY d.user_id, p.rsi_handle, p.display_name
        ORDER BY SUM(d.invoke_count) DESC
        LIMIT 15
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dumper_usage_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dumper_usage_summary(integer) TO authenticated;
