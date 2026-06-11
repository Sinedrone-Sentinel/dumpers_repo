-- 055 Order Timeouts & Fulfillment Abuse Prevention
-- 72h fulfiller timeout, 72h buyer no-show, 24h rating deadline, dispute reports, strike tracking

-- =============================================================================
-- Schema additions
-- =============================================================================

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL;

ALTER TABLE public.custom_order_ratings
  ADD COLUMN IF NOT EXISTS is_auto boolean NOT NULL DEFAULT false;

-- Backfill timestamps for orders already in timed states
UPDATE public.custom_orders
SET accepted_at = COALESCE(accepted_at, updated_at)
WHERE status IN ('accepted', 'in_progress', 'ready_for_pickup', 'completed', 'archived')
  AND assignee_id IS NOT NULL
  AND accepted_at IS NULL;

UPDATE public.custom_orders
SET ready_at = COALESCE(ready_at, updated_at)
WHERE status IN ('ready_for_pickup', 'completed', 'archived')
  AND ready_at IS NULL;

UPDATE public.custom_orders
SET completed_at = COALESCE(completed_at, updated_at)
WHERE status IN ('completed', 'archived')
  AND completed_at IS NULL;

-- Allow system-generated ticket messages without an author
ALTER TABLE public.ticket_messages
  ALTER COLUMN author_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  violation_type text NOT NULL CHECK (
    violation_type IN ('fulfiller_timeout', 'buyer_noshow', 'rating_timeout')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_violations_user_idx
  ON public.order_violations (user_id, created_at);

ALTER TABLE public.order_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_violations_officer_read" ON public.order_violations;
CREATE POLICY "order_violations_officer_read"
  ON public.order_violations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('officer', 'super-admin')
    )
  );

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_order_violation(
  p_user_id uuid,
  p_order_id uuid,
  p_violation_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_strike_count int;
  v_user_name text;
BEGIN
  INSERT INTO public.order_violations (user_id, order_id, violation_type)
  VALUES (p_user_id, p_order_id, p_violation_type);

  SELECT COUNT(*)::int INTO v_strike_count
  FROM public.order_violations
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days';

  IF v_strike_count = 3 THEN
    SELECT COALESCE(rsi_handle, display_name, email, 'Unknown')
    INTO v_user_name
    FROM public.profiles
    WHERE id = p_user_id;

    PERFORM public.create_abuse_report(
      p_user_id,
      'order-violation',
      v_strike_count,
      NULL
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_apply_order_rating(
  p_order_id uuid,
  p_rater_id uuid,
  p_ratee_id uuid,
  p_rater_role text,
  p_stars smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.custom_order_ratings (
    order_id, rater_id, ratee_id, rater_role, stars, is_auto
  )
  VALUES (p_order_id, p_rater_id, p_ratee_id, p_rater_role, p_stars, true)
  ON CONFLICT (order_id, rater_id) DO NOTHING;

  IF p_rater_role = 'requester' THEN
    UPDATE public.custom_orders
    SET requester_archived_at = COALESCE(requester_archived_at, now()), updated_at = now()
    WHERE id = p_order_id;
  ELSE
    UPDATE public.custom_orders
    SET fulfiller_archived_at = COALESCE(fulfiller_archived_at, now()), updated_at = now()
    WHERE id = p_order_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.maybe_archive_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
BEGIN
  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id;

  IF order_row.requester_archived_at IS NOT NULL
     AND order_row.fulfiller_archived_at IS NOT NULL
     AND order_row.status = 'completed' THEN
    UPDATE public.custom_orders
    SET status = 'archived', updated_at = now()
    WHERE id = p_order_id;
  END IF;
END;
$$;

-- =============================================================================
-- Fix create_abuse_report (correct ticket_messages columns)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_abuse_report(
  p_user_id uuid,
  p_blueprint_id text,
  p_attempt_count int,
  p_fulfiller_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_user_name text;
  v_fulfiller_name text;
  v_body text;
BEGIN
  SELECT COALESCE(rsi_handle, display_name, email, 'Unknown user')
  INTO v_user_name
  FROM public.profiles
  WHERE id = p_user_id;

  v_body := 'Automated suspicious activity detection:' || E'\n\n';
  v_body := v_body || 'User: ' || v_user_name || E'\n';
  v_body := v_body || 'Blueprint: ' || p_blueprint_id || E'\n';
  v_body := v_body || 'Blocked attempts today: ' || p_attempt_count || E'\n';

  IF p_fulfiller_id IS NOT NULL THEN
    SELECT COALESCE(rsi_handle, display_name, email, 'Unknown')
    INTO v_fulfiller_name
    FROM public.profiles
    WHERE id = p_fulfiller_id;

    v_body := v_body || E'\nSuspicious pair detected - same fulfiller for multiple orders: ' || v_fulfiller_name;
  END IF;

  IF p_blueprint_id = 'order-violation' THEN
    v_body := v_body || E'\n\nThis user has accumulated 3+ order violations (timeouts/no-shows) within 30 days.';
  ELSE
    v_body := v_body || E'\n\nThis user has repeatedly attempted to create duplicate orders for the same blueprint while another order is being fulfilled. This may indicate an attempt to game the reputation system.';
  END IF;

  INSERT INTO public.support_tickets (
    requester_id,
    category,
    subject,
    status
  )
  VALUES (
    p_user_id,
    'member_report',
    '[System] Suspicious order activity: ' || v_user_name,
    'open'
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (
    ticket_id,
    author_id,
    content,
    is_staff
  )
  VALUES (
    v_ticket_id,
    NULL,
    v_body,
    true
  );

  UPDATE public.order_abuse_attempts
  SET reported_at = now()
  WHERE user_id = p_user_id
    AND blueprint_id = p_blueprint_id
    AND attempt_date = CURRENT_DATE
    AND reported_at IS NULL;

  RETURN v_ticket_id;
END;
$$;

-- =============================================================================
-- Update order lifecycle functions to set timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION public.complete_order_craft(
  p_order_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  item_row record;
  stock_qty numeric;
  fulfillment_id uuid;
  fulfiller_name text;
  price_label text;
  deduct_inventory boolean;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  SELECT craft_deduct_inventory INTO deduct_inventory
  FROM public.profiles WHERE id = auth.uid();
  IF deduct_inventory IS NULL THEN deduct_inventory := false; END IF;

  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_row.assignee_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned fulfiller can complete this order';
  END IF;
  IF order_row.status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'Order cannot be completed in status %', order_row.status;
  END IF;

  IF deduct_inventory THEN
    FOR item_row IN
      SELECT resource_key, quantity FROM public.custom_order_items WHERE order_id = p_order_id
    LOOP
      stock_qty := public.personal_resource_stock_total(auth.uid(), item_row.resource_key);
      IF stock_qty < item_row.quantity THEN
        RAISE EXCEPTION 'Insufficient personal stock for %', item_row.resource_key;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.order_fulfillments (order_id, fulfilled_by, notes)
  VALUES (p_order_id, auth.uid(), p_notes)
  RETURNING id INTO fulfillment_id;

  IF deduct_inventory THEN
    FOR item_row IN
      SELECT resource_key, quantity FROM public.custom_order_items WHERE order_id = p_order_id
    LOOP
      PERFORM public.deduct_personal_resource_stock(auth.uid(), item_row.resource_key, item_row.quantity);
      INSERT INTO public.fulfillment_items (fulfillment_id, resource_key, quantity)
      VALUES (fulfillment_id, item_row.resource_key, item_row.quantity);
    END LOOP;
  END IF;

  UPDATE public.custom_orders
  SET status = 'ready_for_pickup', ready_at = now(), updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id, auth.uid(),
    CASE WHEN deduct_inventory THEN 'resources_deducted' ELSE 'craft_completed' END,
    jsonb_build_object('fulfillment_id', fulfillment_id, 'deducted_inventory', deduct_inventory)
  );

  SELECT COALESCE(rsi_handle, display_name, email, 'Your fulfiller') INTO fulfiller_name
  FROM public.profiles WHERE id = auth.uid();
  price_label := public.format_dfp_auec(order_row.total_dfp_auec);

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_ready',
    'Ready for pickup',
    fulfiller_name || ' finished crafting: ' || order_row.title || ' · ' || price_label,
    jsonb_build_object('order_id', p_order_id, 'fulfillment_id', fulfillment_id)
  );

  RETURN fulfillment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_order_pickup(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  requester_name text;
BEGIN
  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_row.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can confirm pickup';
  END IF;
  IF order_row.status <> 'ready_for_pickup' THEN
    RAISE EXCEPTION 'Order is not ready for pickup';
  END IF;
  IF order_row.dispute_opened_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order is under dispute review';
  END IF;

  UPDATE public.custom_orders
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (p_order_id, auth.uid(), 'completed', '{}'::jsonb);

  SELECT COALESCE(rsi_handle, display_name, email, 'Customer') INTO requester_name
  FROM public.profiles WHERE id = auth.uid();

  IF order_row.assignee_id IS NOT NULL THEN
    PERFORM public.create_user_notification(
      order_row.assignee_id,
      'order_completed',
      'Pickup confirmed',
      requester_name || ' picked up: ' || order_row.title,
      jsonb_build_object('order_id', p_order_id)
    );
  END IF;
END;
$$;

-- =============================================================================
-- Dispute reporting (text only, no file uploads)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.report_order_dispute(
  p_order_id uuid,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  v_ticket_id uuid;
  v_body text;
  v_buyer_name text;
  v_fulfiller_name text;
  v_officer_id uuid;
BEGIN
  IF NULLIF(trim(p_description), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Description required');
  END IF;

  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF order_row.requester_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the buyer can report a problem');
  END IF;

  IF order_row.status <> 'ready_for_pickup' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not ready for pickup');
  END IF;

  IF order_row.dispute_opened_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A dispute is already open for this order');
  END IF;

  IF order_row.assignee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order has no fulfiller assigned');
  END IF;

  SELECT COALESCE(rsi_handle, display_name, email, 'Buyer') INTO v_buyer_name
  FROM public.profiles WHERE id = order_row.requester_id;

  SELECT COALESCE(rsi_handle, display_name, email, 'Fulfiller') INTO v_fulfiller_name
  FROM public.profiles WHERE id = order_row.assignee_id;

  v_body := 'Order dispute report:' || E'\n\n';
  v_body := v_body || 'Order: ' || order_row.title || E'\n';
  v_body := v_body || 'Order ID: ' || p_order_id || E'\n';
  v_body := v_body || 'Buyer: ' || v_buyer_name || E'\n';
  v_body := v_body || 'Fulfiller: ' || v_fulfiller_name || E'\n';
  v_body := v_body || E'\nBuyer description:' || E'\n' || trim(p_description);
  v_body := v_body || E'\n\nEvidence is not uploaded on-site. Officers may request screenshots via email or cloud storage links.';

  INSERT INTO public.support_tickets (
    requester_id, category, subject, reported_user_id, status
  )
  VALUES (
    auth.uid(),
    'member_report',
    'Order dispute: ' || order_row.title,
    order_row.assignee_id,
    'open'
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, author_id, content, is_staff)
  VALUES (v_ticket_id, auth.uid(), v_body, false);

  UPDATE public.custom_orders
  SET dispute_opened_at = now(), dispute_ticket_id = v_ticket_id, updated_at = now()
  WHERE id = p_order_id;

  FOR v_officer_id IN
    SELECT id FROM public.profiles
    WHERE role IN ('officer', 'super-admin') AND id != auth.uid()
  LOOP
    PERFORM public.create_user_notification(
      v_officer_id,
      'support_ticket_new',
      'Order Dispute',
      'Order dispute: ' || order_row.title,
      jsonb_build_object('ticket_id', v_ticket_id, 'order_id', p_order_id)
    );
  END LOOP;

  PERFORM public.create_user_notification(
    order_row.assignee_id,
    'order_dispute',
    'Order dispute opened',
    v_buyer_name || ' reported a problem with: ' || order_row.title,
    jsonb_build_object('order_id', p_order_id, 'ticket_id', v_ticket_id)
  );

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_order_dispute(
  p_order_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  IF p_outcome NOT IN ('cancel', 'release') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid outcome');
  END IF;

  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF order_row.dispute_opened_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No open dispute on this order');
  END IF;

  IF p_outcome = 'cancel' THEN
    UPDATE public.custom_orders
    SET
      status = 'cancelled',
      assignee_id = NULL,
      accepted_at = NULL,
      ready_at = NULL,
      dispute_opened_at = NULL,
      dispute_ticket_id = NULL,
      updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (p_order_id, auth.uid(), 'dispute_cancelled', jsonb_build_object('outcome', 'cancel'));
  ELSE
    UPDATE public.custom_orders
    SET
      status = 'in_progress',
      ready_at = NULL,
      dispute_opened_at = NULL,
      dispute_ticket_id = NULL,
      accepted_at = now(),
      updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (p_order_id, auth.uid(), 'dispute_released', jsonb_build_object('outcome', 'release'));
  END IF;

  RETURN jsonb_build_object('success', true, 'outcome', p_outcome);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dispute_order_id(p_ticket_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.custom_orders
  WHERE dispute_ticket_id = p_ticket_id
    AND dispute_opened_at IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.report_order_dispute(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_order_dispute(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dispute_order_id(uuid) TO authenticated;

-- =============================================================================
-- Scheduled enforcement (pg_cron)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_fulfiller_timeouts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_count int := 0;
BEGIN
  FOR v_order IN
    SELECT id, requester_id, assignee_id, title
    FROM public.custom_orders
    WHERE status IN ('accepted', 'in_progress')
      AND assignee_id IS NOT NULL
      AND accepted_at IS NOT NULL
      AND accepted_at < NOW() - INTERVAL '72 hours'
      AND dispute_opened_at IS NULL
  LOOP
    UPDATE public.custom_orders
    SET
      status = 'pending',
      assignee_id = NULL,
      accepted_at = NULL,
      updated_at = now()
    WHERE id = v_order.id;

    PERFORM public.record_order_violation(v_order.assignee_id, v_order.id, 'fulfiller_timeout');

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (v_order.id, NULL, 'fulfiller_timeout', jsonb_build_object('assignee_id', v_order.assignee_id));

    PERFORM public.create_user_notification(
      v_order.requester_id,
      'order_timeout',
      'Order released',
      'Fulfiller timed out — your order is back in the pool: ' || v_order.title,
      jsonb_build_object('order_id', v_order.id)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_buyer_noshow()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_count int := 0;
BEGIN
  FOR v_order IN
    SELECT id, requester_id, assignee_id, title
    FROM public.custom_orders
    WHERE status = 'ready_for_pickup'
      AND ready_at IS NOT NULL
      AND ready_at < NOW() - INTERVAL '72 hours'
      AND dispute_opened_at IS NULL
  LOOP
    UPDATE public.custom_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_order.id;

    -- Fulfiller rates buyer 1 star
    PERFORM public.auto_apply_order_rating(
      v_order.id, v_order.assignee_id, v_order.requester_id, 'fulfiller', 1
    );
    -- Buyer auto-gives fulfiller 5 stars
    PERFORM public.auto_apply_order_rating(
      v_order.id, v_order.requester_id, v_order.assignee_id, 'requester', 5
    );

    PERFORM public.maybe_archive_order(v_order.id);
    PERFORM public.record_order_violation(v_order.requester_id, v_order.id, 'buyer_noshow');

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (v_order.id, NULL, 'buyer_noshow', jsonb_build_object('requester_id', v_order.requester_id));

    PERFORM public.create_user_notification(
      v_order.requester_id,
      'order_noshow',
      'Pickup deadline missed',
      'Order auto-completed due to missed pickup: ' || v_order.title,
      jsonb_build_object('order_id', v_order.id)
    );

    PERFORM public.create_user_notification(
      v_order.assignee_id,
      'order_noshow',
      'Buyer no-show',
      'Buyer did not confirm pickup in time: ' || v_order.title,
      jsonb_build_object('order_id', v_order.id)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rating_deadlines()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_count int := 0;
BEGIN
  -- Buyer rated first; fulfiller has 24h to rate or auto-gives buyer 5 stars
  FOR v_order IN
    SELECT id, requester_id, assignee_id
    FROM public.custom_orders
    WHERE status = 'completed'
      AND requester_archived_at IS NOT NULL
      AND fulfiller_archived_at IS NULL
      AND assignee_id IS NOT NULL
      AND requester_archived_at < NOW() - INTERVAL '24 hours'
  LOOP
    PERFORM public.auto_apply_order_rating(
      v_order.id, v_order.assignee_id, v_order.requester_id, 'fulfiller', 5
    );
    PERFORM public.maybe_archive_order(v_order.id);

    PERFORM public.create_user_notification(
      v_order.assignee_id,
      'rating_auto',
      'Auto-rating applied',
      'You did not rate within 24 hours — a 5-star rating was applied on your behalf.',
      jsonb_build_object('order_id', v_order.id)
    );

    v_count := v_count + 1;
  END LOOP;

  -- Fulfiller rated first; buyer has 24h to rate or auto-gives fulfiller 5 stars
  FOR v_order IN
    SELECT id, requester_id, assignee_id
    FROM public.custom_orders
    WHERE status = 'completed'
      AND fulfiller_archived_at IS NOT NULL
      AND requester_archived_at IS NULL
      AND assignee_id IS NOT NULL
      AND fulfiller_archived_at < NOW() - INTERVAL '24 hours'
  LOOP
    PERFORM public.auto_apply_order_rating(
      v_order.id, v_order.requester_id, v_order.assignee_id, 'requester', 5
    );
    PERFORM public.maybe_archive_order(v_order.id);

    PERFORM public.create_user_notification(
      v_order.requester_id,
      'rating_auto',
      'Auto-rating applied',
      'You did not rate within 24 hours — a 5-star rating was applied on your behalf.',
      jsonb_build_object('order_id', v_order.id)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_order_timeout_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'fulfiller_timeouts', public.check_fulfiller_timeouts(),
    'buyer_noshow', public.check_buyer_noshow(),
    'rating_deadlines', public.check_rating_deadlines()
  );
END;
$$;

/*
-- After enabling pg_cron, schedule hourly order timeout checks:
SELECT cron.schedule(
  'order-timeout-checks',
  '0 * * * *',
  $$SELECT public.run_order_timeout_jobs()$$
);
*/
