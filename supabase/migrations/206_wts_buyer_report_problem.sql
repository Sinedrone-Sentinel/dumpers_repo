-- 206: Report problem works for WTS buyers.
--
-- report_order_dispute only accepted the order's requester. On WTS the requester
-- is the seller, so the buyer (assignee) saw the button but was always refused,
-- and the report would have named the wrong members. Buyer / seller now follow
-- the listing type, matching confirm pickup.
--
-- resolve_order_dispute 'cancel' on a deal taken from a listing now returns the
-- items to that listing, like every other cancel / timeout path.

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
  v_buyer_id uuid;
  v_seller_id uuid;
  v_buyer_name text;
  v_seller_name text;
  v_officer_id uuid;
BEGIN
  IF NULLIF(trim(p_description), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Description required');
  END IF;

  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF COALESCE(order_row.listing_type, 'wtb') = 'wts' THEN
    v_buyer_id := order_row.assignee_id;
    v_seller_id := order_row.requester_id;
  ELSE
    v_buyer_id := order_row.requester_id;
    v_seller_id := order_row.assignee_id;
  END IF;

  IF v_buyer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the buyer can report a problem');
  END IF;

  IF order_row.status <> 'ready_for_pickup' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not ready for pickup');
  END IF;

  IF order_row.dispute_opened_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A dispute is already open for this order');
  END IF;

  IF v_seller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order has no seller assigned');
  END IF;

  SELECT COALESCE(rsi_handle, display_name, email, 'Buyer') INTO v_buyer_name
  FROM public.profiles WHERE id = v_buyer_id;

  SELECT COALESCE(rsi_handle, display_name, email, 'Seller') INTO v_seller_name
  FROM public.profiles WHERE id = v_seller_id;

  v_body := 'Order dispute report:' || E'\n\n';
  v_body := v_body || 'Order: ' || order_row.title || E'\n';
  v_body := v_body || 'Order ID: ' || p_order_id || E'\n';
  v_body := v_body || 'Type: ' || upper(COALESCE(order_row.listing_type, 'wtb')) || E'\n';
  v_body := v_body || 'Buyer: ' || v_buyer_name || E'\n';
  v_body := v_body || 'Seller: ' || v_seller_name || E'\n';
  v_body := v_body || E'\nBuyer description:' || E'\n' || trim(p_description);
  v_body := v_body || E'\n\nEvidence is not uploaded on-site. Officers may request screenshots via email or cloud storage links.';

  INSERT INTO public.support_tickets (
    requester_id, category, subject, reported_user_id, status
  )
  VALUES (
    auth.uid(),
    'member_report',
    'Order dispute: ' || order_row.title,
    v_seller_id,
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
    v_seller_id,
    'order_dispute',
    'Order dispute opened',
    v_buyer_name || ' reported a problem with: ' || order_row.title,
    jsonb_build_object('order_id', p_order_id, 'ticket_id', v_ticket_id, 'listing_type', order_row.listing_type)
  );

  PERFORM public.queue_discord_message(
    'my_order_dispute',
    'Dispute opened: ' || order_row.title,
    v_buyer_name || ' reported a problem · ' || public.format_dfp_auec(order_row.total_dfp_auec),
    15548997,
    public.discord_order_embed_fields(p_order_id),
    v_seller_id,
    auth.uid()
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
    IF order_row.source_listing_id IS NOT NULL THEN
      PERFORM public.restore_wts_purchase_to_listing(p_order_id);
    END IF;

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
    VALUES (
      p_order_id, auth.uid(), 'dispute_cancelled',
      jsonb_build_object(
        'outcome', 'cancel',
        'restored_to_listing', order_row.source_listing_id IS NOT NULL
      )
    );
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

GRANT EXECUTE ON FUNCTION public.report_order_dispute(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_order_dispute(uuid, text) TO authenticated;