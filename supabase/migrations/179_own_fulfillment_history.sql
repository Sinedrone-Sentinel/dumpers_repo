-- 179: Fulfillment history is own rows only (including super-admin), last 30 days.
-- Monthly cron on the 1st deletes order_fulfillments older than 30 days (items cascade).

DROP POLICY IF EXISTS "order_fulfillments_select_approved" ON public.order_fulfillments;
DROP POLICY IF EXISTS "order_fulfillments_select_own" ON public.order_fulfillments;

CREATE POLICY "order_fulfillments_select_own"
  ON public.order_fulfillments
  FOR SELECT
  TO authenticated
  USING (
    fulfilled_by = auth.uid()
    AND created_at >= now() - interval '30 days'
  );

DROP POLICY IF EXISTS "fulfillment_items_select_approved" ON public.fulfillment_items;
DROP POLICY IF EXISTS "fulfillment_items_select_own" ON public.fulfillment_items;

CREATE POLICY "fulfillment_items_select_own"
  ON public.fulfillment_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.order_fulfillments f
      WHERE f.id = fulfillment_id
        AND f.fulfilled_by = auth.uid()
        AND f.created_at >= now() - interval '30 days'
    )
  );

CREATE INDEX IF NOT EXISTS order_fulfillments_created_at_idx
  ON public.order_fulfillments (created_at);

CREATE OR REPLACE FUNCTION public.cleanup_old_order_fulfillments()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted int := 0;
BEGIN
  DELETE FROM public.order_fulfillments
  WHERE created_at < now() - interval '30 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cleanup_old_order_fulfillments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_order_fulfillments() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_order_fulfillments() TO service_role;

-- First of the month at 04:00 UTC.
DO $fulfillment_cleanup_cron$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup-old-order-fulfillments');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'cleanup-old-order-fulfillments',
    '0 4 1 * *',
    $cmd$SELECT public.cleanup_old_order_fulfillments()$cmd$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''cleanup-old-order-fulfillments'', ''0 4 1 * *'', $cmd$SELECT public.cleanup_old_order_fulfillments()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule fulfillment history cleanup cron: %', SQLERRM;
END;
$fulfillment_cleanup_cron$;
