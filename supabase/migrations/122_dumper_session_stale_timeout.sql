-- Widen BP Dumper stale-session window so 30s client pings do not race the 90s cleanup.

CREATE OR REPLACE FUNCTION public.cleanup_stale_dumper_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale_users uuid[];
  v_count integer := 0;
BEGIN
  SELECT array_agg(id) INTO v_stale_users
  FROM public.profiles
  WHERE dumper_watch_active = true
    AND (
      dumper_last_ping_at IS NULL
      OR dumper_last_ping_at < now() - interval '120 seconds'
    );

  IF v_stale_users IS NULL OR array_length(v_stale_users, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.dumper_active_missions
  WHERE user_id = ANY(v_stale_users);

  UPDATE public.profiles
  SET dumper_watch_active = false
  WHERE id = ANY(v_stale_users);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_dumper_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_dumper_sessions() TO service_role;

COMMENT ON COLUMN public.profiles.dumper_last_ping_at IS
  'Last session_start, session_ping, or mission event from BP Dumper. Stale after 120s without ping.';
