-- 178: Hourly order timeout cron, correct WTS/WTB attribution, ghosting warning ack
-- Seller/fulfiller: 72h after accept to mark ready.
-- Buyer: 72h after ready to confirm pickup.
-- Offending member sees a one-time warning on next login.

ALTER TABLE public.order_violations
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

COMMENT ON COLUMN public.order_violations.acknowledged_at IS
  'Set when the member dismisses the one-time ghosting warning for this timeout/noshow.';

CREATE INDEX IF NOT EXISTS order_violations_user_unacked_idx
  ON public.order_violations (user_id, created_at DESC)
  WHERE acknowledged_at IS NULL
    AND violation_type IN ('fulfiller_timeout', 'buyer_noshow');

-- -----------------------------------------------------------------------------
-- Fulfiller / seller timeout: strike the party who should have marked ready
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_fulfiller_timeouts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
DECLARE
  v_order record;
  v_count int := 0;
  v_listing_type text;
  v_offender uuid;
  v_other uuid;
BEGIN
  FOR v_order IN
    SELECT id, requester_id, assignee_id, title, source_listing_id, listing_type
    FROM public.custom_orders
    WHERE status IN ('accepted', 'in_progress')
      AND assignee_id IS NOT NULL
      AND requester_id IS NOT NULL
      AND accepted_at IS NOT NULL
      AND accepted_at < NOW() - INTERVAL '72 hours'
      AND dispute_opened_at IS NULL
  LOOP
    v_listing_type := COALESCE(v_order.listing_type, 'wtb');
    IF v_listing_type = 'wts' THEN
      v_offender := v_order.requester_id;
      v_other := v_order.assignee_id;
    ELSE
      v_offender := v_order.assignee_id;
      v_other := v_order.requester_id;
    END IF;

    IF v_order.source_listing_id IS NOT NULL THEN
      PERFORM public.restore_wts_purchase_to_listing(v_order.id);

      UPDATE public.custom_orders
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_order.id;

      INSERT INTO public.order_events (order_id, actor_id, event_type, details)
      VALUES (
        v_order.id, NULL, 'fulfiller_timeout',
        jsonb_build_object(
          'offender_id', v_offender,
          'source_listing_id', v_order.source_listing_id,
          'restored_to_listing', true,
          'listing_type', v_listing_type
        )
      );

      IF v_other IS NOT NULL THEN
        PERFORM public.create_user_notification(
          v_other,
          'order_timeout',
          'Transaction timed out',
          'The other party timed out — items were returned to the listing: ' || v_order.title,
          jsonb_build_object('order_id', v_order.id, 'source_listing_id', v_order.source_listing_id)
        );
      END IF;
    ELSE
      UPDATE public.custom_orders
      SET
        status = 'pending',
        assignee_id = NULL,
        accepted_at = NULL,
        updated_at = now()
      WHERE id = v_order.id;

      INSERT INTO public.order_events (order_id, actor_id, event_type, details)
      VALUES (
        v_order.id, NULL, 'fulfiller_timeout',
        jsonb_build_object('offender_id', v_offender, 'listing_type', v_listing_type)
      );

      IF v_other IS NOT NULL THEN
        PERFORM public.create_user_notification(
          v_other,
          'order_timeout',
          'Order released',
          'Fulfiller timed out — your order is back in the pool: ' || v_order.title,
          jsonb_build_object('order_id', v_order.id)
        );
      END IF;
    END IF;

    IF v_offender IS NOT NULL THEN
      PERFORM public.record_order_violation(v_offender, v_order.id, 'fulfiller_timeout');
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
;

-- -----------------------------------------------------------------------------
-- Buyer no-show: strike the semantic buyer (WTB requester / WTS assignee)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_buyer_noshow()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
DECLARE
  v_order record;
  v_count int := 0;
  v_listing_type text;
  v_buyer uuid;
  v_seller uuid;
BEGIN
  FOR v_order IN
    SELECT id, requester_id, assignee_id, title, listing_type
    FROM public.custom_orders
    WHERE status = 'ready_for_pickup'
      AND ready_at IS NOT NULL
      AND ready_at < NOW() - INTERVAL '72 hours'
      AND dispute_opened_at IS NULL
  LOOP
    v_listing_type := COALESCE(v_order.listing_type, 'wtb');
    IF v_listing_type = 'wts' THEN
      v_buyer := v_order.assignee_id;
      v_seller := v_order.requester_id;
    ELSE
      v_buyer := v_order.requester_id;
      v_seller := v_order.assignee_id;
    END IF;

    UPDATE public.custom_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_order.id;

    IF v_listing_type = 'wts' THEN
      PERFORM public.auto_apply_order_rating(
        v_order.id, v_seller, v_buyer, 'requester', 1
      );
      PERFORM public.auto_apply_order_rating(
        v_order.id, v_buyer, v_seller, 'fulfiller', 5
      );
    ELSE
      PERFORM public.auto_apply_order_rating(
        v_order.id, v_seller, v_buyer, 'fulfiller', 1
      );
      PERFORM public.auto_apply_order_rating(
        v_order.id, v_buyer, v_seller, 'requester', 5
      );
    END IF;

    PERFORM public.maybe_archive_order(v_order.id);

    IF v_buyer IS NOT NULL THEN
      PERFORM public.record_order_violation(v_buyer, v_order.id, 'buyer_noshow');
    END IF;

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      v_order.id, NULL, 'buyer_noshow',
      jsonb_build_object('buyer_id', v_buyer, 'listing_type', v_listing_type)
    );

    IF v_buyer IS NOT NULL THEN
      PERFORM public.create_user_notification(
        v_buyer,
        'order_noshow',
        'Pickup deadline missed',
        'Order auto-completed due to missed pickup: ' || v_order.title,
        jsonb_build_object('order_id', v_order.id)
      );
    END IF;

    IF v_seller IS NOT NULL THEN
      PERFORM public.create_user_notification(
        v_seller,
        'order_noshow',
        'Buyer no-show',
        'Buyer did not confirm pickup in time: ' || v_order.title,
        jsonb_build_object('order_id', v_order.id)
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
;

-- -----------------------------------------------------------------------------
-- Member warning RPCs (no client writes on order_violations)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_pending_timeout_warning()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS 
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_role text;
  v_listing_type text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    v.id,
    v.violation_type,
    v.created_at,
    COALESCE(o.listing_type, 'wtb') AS listing_type
  INTO v_row
  FROM public.order_violations v
  LEFT JOIN public.custom_orders o ON o.id = v.order_id
  WHERE v.user_id = v_uid
    AND v.acknowledged_at IS NULL
    AND v.violation_type IN ('fulfiller_timeout', 'buyer_noshow')
  ORDER BY v.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_listing_type := v_row.listing_type;
  IF v_row.violation_type = 'buyer_noshow' THEN
    v_role := 'buyer';
  ELSIF v_listing_type = 'wts' THEN
    v_role := 'seller';
  ELSE
    v_role := 'fulfiller';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'violation_type', v_row.violation_type,
    'role_label', v_role,
    'created_at', v_row.created_at
  );
END;
;

CREATE OR REPLACE FUNCTION public.acknowledge_timeout_warning()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not signed in');
  END IF;

  UPDATE public.order_violations
  SET acknowledged_at = now()
  WHERE user_id = v_uid
    AND acknowledged_at IS NULL
    AND violation_type IN ('fulfiller_timeout', 'buyer_noshow');

  RETURN jsonb_build_object('success', true);
END;
;

REVOKE ALL ON FUNCTION public.get_my_pending_timeout_warning() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_timeout_warning() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_timeout_warning() TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_timeout_warning() TO authenticated;

REVOKE ALL ON FUNCTION public.check_fulfiller_timeouts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_buyer_noshow() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rating_deadlines() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_order_timeout_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_fulfiller_timeouts() FROM authenticated;
REVOKE ALL ON FUNCTION public.check_buyer_noshow() FROM authenticated;
REVOKE ALL ON FUNCTION public.check_rating_deadlines() FROM authenticated;
REVOKE ALL ON FUNCTION public.run_order_timeout_jobs() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_fulfiller_timeouts() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_buyer_noshow() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rating_deadlines() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_order_timeout_jobs() TO service_role;

-- Hourly sweep (pg_cron). Safe to re-run; skips if extension missing.
DO $
BEGIN
  BEGIN
    PERFORM cron.unschedule('order-timeout-checks');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'order-timeout-checks',
    '0 * * * *',
     public.run_order_timeout_jobs()$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''order-timeout-checks'', ''0 * * * *'',  public.run_order_timeout_jobs()$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule order timeout cron: %', SQLERRM;
END;
$;
