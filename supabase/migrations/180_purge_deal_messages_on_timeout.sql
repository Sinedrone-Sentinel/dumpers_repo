-- 180: Purge Bazaar deal chat on timeout (including release back to pending)
-- 177 already deletes deal_messages on completed/cancelled/archived/fulfilled.
-- Fulfiller timeout with no source listing sets status to pending, which skipped that.
-- Also call purge_deal_messages explicitly from the timeout jobs (idempotent).

CREATE OR REPLACE FUNCTION public.trg_purge_deal_messages_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $trg$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND (
       NEW.status IN ('completed', 'cancelled', 'archived', 'fulfilled')
       OR (
         NEW.status = 'pending'
         AND OLD.status IN ('accepted', 'in_progress', 'ready_for_pickup')
       )
     )
  THEN
    PERFORM public.purge_deal_messages(NEW.id);
  END IF;
  RETURN NEW;
END;
$trg$;

CREATE OR REPLACE FUNCTION public.check_fulfiller_timeouts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    -- Drop deal chat now (covers pending release; trigger also fires on status change).
    PERFORM public.purge_deal_messages(v_order.id);
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
$fn$;

CREATE OR REPLACE FUNCTION public.check_buyer_noshow()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    -- Drop deal chat now (covers pending release; trigger also fires on status change).
    PERFORM public.purge_deal_messages(v_order.id);
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
        v_order.id, v_seller, v_buyer, 'requester'::text, 1::smallint
      );
      PERFORM public.auto_apply_order_rating(
        v_order.id, v_buyer, v_seller, 'fulfiller'::text, 5::smallint
      );
    ELSE
      PERFORM public.auto_apply_order_rating(
        v_order.id, v_seller, v_buyer, 'fulfiller'::text, 1::smallint
      );
      PERFORM public.auto_apply_order_rating(
        v_order.id, v_buyer, v_seller, 'requester'::text, 5::smallint
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
$fn$;

GRANT EXECUTE ON FUNCTION public.check_fulfiller_timeouts() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_buyer_noshow() TO service_role;
