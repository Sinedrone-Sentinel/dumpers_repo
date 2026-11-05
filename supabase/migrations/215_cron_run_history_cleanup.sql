-- pg_cron logs every run to cron.job_run_details and never deletes them.
-- Two jobs run every minute (Discord queue, stale Dumper sessions), so the log
-- had reached ~385k rows / 65 MB -- most of the database. Keep 7 days.

CREATE OR REPLACE FUNCTION public.cleanup_cron_run_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION public.cleanup_cron_run_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_cron_run_history() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_cron_run_history() TO service_role;

DO $cron_history_cleanup$
BEGIN
  PERFORM public.cleanup_cron_run_history();

  BEGIN
    PERFORM cron.unschedule('cleanup-cron-run-history');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'cleanup-cron-run-history',
    '45 4 * * *',
    $cmd$SELECT public.cleanup_cron_run_history()$cmd$
  );
EXCEPTION
  WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''cleanup-cron-run-history'', ''45 4 * * *'', $cmd$SELECT public.cleanup_cron_run_history()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule cron run history cleanup: %', SQLERRM;
END;
$cron_history_cleanup$;
