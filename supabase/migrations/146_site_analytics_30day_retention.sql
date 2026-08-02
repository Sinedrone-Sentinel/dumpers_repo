-- Rolling 30-day retention for site analytics daily tables (same window as BP Dumper stats).
-- Purges once per day via pg_cron; also runs once when this migration is applied.

CREATE OR REPLACE FUNCTION public.cleanup_site_analytics_older_than_30_days()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff date := (timezone('utc', now()))::date - 29;
  v_deleted_tool integer := 0;
  v_deleted_daily integer := 0;
  v_deleted_visitors integer := 0;
BEGIN
  -- Keep today + previous 29 days.
  DELETE FROM public.site_analytics_tool_visitor_daily
  WHERE visit_date < v_cutoff;
  GET DIAGNOSTICS v_deleted_tool = ROW_COUNT;

  DELETE FROM public.site_analytics_daily_visitors
  WHERE visit_date < v_cutoff;
  GET DIAGNOSTICS v_deleted_daily = ROW_COUNT;

  -- Drop visitor master rows with no remaining daily activity and stale last_seen.
  DELETE FROM public.site_analytics_visitors v
  WHERE v.last_seen < (timezone('utc', now()) - interval '30 days')
    AND NOT EXISTS (
      SELECT 1
      FROM public.site_analytics_daily_visitors d
      WHERE d.visitor_id = v.id
    );
  GET DIAGNOSTICS v_deleted_visitors = ROW_COUNT;

  RETURN v_deleted_tool + v_deleted_daily + v_deleted_visitors;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_site_analytics_older_than_30_days() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_site_analytics_older_than_30_days() TO service_role;

-- Purge existing history older than 30 days immediately.
SELECT public.cleanup_site_analytics_older_than_30_days();

-- Same window for BP Dumper invoke rollups (function from migration 145).
SELECT public.cleanup_dumper_invoke_daily();

DO $site_analytics_cron$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup-site-analytics-30d');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'cleanup-site-analytics-30d',
    '30 4 * * *',
    $cmd$SELECT public.cleanup_site_analytics_older_than_30_days()$cmd$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''cleanup-site-analytics-30d'', ''30 4 * * *'', $cmd$SELECT public.cleanup_site_analytics_older_than_30_days()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule site analytics cleanup cron: %', SQLERRM;
END;
$site_analytics_cron$;
