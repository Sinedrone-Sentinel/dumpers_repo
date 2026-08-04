-- =============================================================================
-- 156: Projected monthly Edge = (avg invokes/active Dumper) × active × 30
-- =============================================================================

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
  v_avg_per_active numeric;
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

  v_avg_per_active := CASE
    WHEN v_active_users > 0 THEN round(v_total_invokes::numeric / v_active_users, 1)
    ELSE 0
  END;

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
    'avg_invokes_per_active_user', v_avg_per_active,
    'avg_invokes_per_day', CASE
      WHEN v_days > 0 THEN round(v_total_invokes::numeric / v_days, 1)
      ELSE 0
    END,
    -- (avg invokes / active Dumper) × Active Dumpers (period) × 30
    'projected_monthly_invokes', CASE
      WHEN v_active_users > 0 THEN round(v_avg_per_active * v_active_users * 30, 0)
      ELSE 0
    END,
    'est_watch_hours', CASE
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

COMMENT ON FUNCTION public.get_dumper_usage_summary(integer) IS
  'Super-admin BP Dumper Edge usage summary. Projected monthly = (avg invokes/active Dumper) × active Dumpers × 30.';
