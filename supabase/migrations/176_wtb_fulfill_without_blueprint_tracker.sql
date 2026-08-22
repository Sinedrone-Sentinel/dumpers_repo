-- 176: Blueprint tracker is optional for fulfilling buy listings.
--
-- accept_wtb_partial used to reject any blueprint line the caller had not
-- marked in the Blueprint tracker. Tracking is opt-in, so members who craft
-- from blueprints they own in-game but never ticked here were locked out of
-- the Bazaar. The client now warns and asks for confirmation instead; the
-- requester still rates the trade, which is the real accountability.
--
-- Recreates 158_scu_resource_full_line_only.sql's accept_wtb_partial verbatim
-- minus the acquired_blueprints EXISTS check.

CREATE OR REPLACE FUNCTION public.accept_wtb_partial(
  p_listing_id uuid,
  p_selections jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.custom_orders%ROWTYPE;
  v_sel jsonb;
  v_line_id uuid;
  v_kind text;
  v_qty numeric;
  v_bp_qty int;
  v_claim_total bigint := 0;
  v_claim_id uuid;
  v_bp public.custom_order_blueprints%ROWTYPE;
  v_res public.custom_order_resource_lines%ROWTYPE;
  v_line_dfp bigint;
  v_fulfiller_rep int;
  v_fulfiller_completed int;
  v_has_pending_rep boolean;
  v_active_count int;
  v_buyer_pending_rep boolean;
  v_buyer_active_count int;
  v_buyer_active_total bigint;
  v_unrated_count int;
  v_rsi_verified boolean;
  v_assignee_name text;
  v_price_label text;
  v_sel_count int := 0;
  v_bp_idx int := 0;
  v_res_idx int := 0;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  SELECT rsi_handle_verified INTO v_rsi_verified FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_rsi_verified, false) THEN
    RAISE EXCEPTION 'RSI Handle verification required';
  END IF;

  v_unrated_count := public.get_unrated_order_count(auth.uid());
  IF v_unrated_count > 0 THEN
    RAISE EXCEPTION 'Rate your completed orders first (%) pending', v_unrated_count;
  END IF;

  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' OR jsonb_array_length(p_selections) = 0 THEN
    RAISE EXCEPTION 'Select at least one item to fulfill';
  END IF;

  SELECT * INTO v_listing FROM public.custom_orders WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_listing.listing_type <> 'wtb' THEN RAISE EXCEPTION 'Not a buy listing'; END IF;
  IF v_listing.status <> 'pending' THEN RAISE EXCEPTION 'Listing is no longer available'; END IF;
  IF v_listing.requester_id = auth.uid() THEN RAISE EXCEPTION 'You cannot fulfill your own listing'; END IF;
  IF v_listing.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot fulfill from a claimed order';
  END IF;

  -- Fulfiller pending-rep cap: 1 active fulfillment at a time.
  v_has_pending_rep := public.has_pending_fulfiller_rep(auth.uid());
  IF v_has_pending_rep THEN
    v_active_count := public.get_active_fulfiller_count(auth.uid());
    IF v_active_count >= 1 THEN
      RAISE EXCEPTION 'Fulfillment limit reached: max 1 active order while reputation is pending';
    END IF;
  END IF;

  -- Listing min fulfiller reputation gate (established fulfillers only).
  IF v_listing.min_fulfiller_reputation IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_fulfiller_completed
    FROM public.custom_orders
    WHERE assignee_id = auth.uid() AND listing_type = 'wtb'
      AND status IN ('completed', 'archived');
    IF v_fulfiller_completed >= 5 THEN
      v_fulfiller_rep := public.user_fulfiller_reputation(auth.uid());
      IF v_fulfiller_rep IS NOT NULL AND v_fulfiller_rep < v_listing.min_fulfiller_reputation THEN
        RAISE EXCEPTION 'Your fulfiller reputation (%) is below the required %', v_fulfiller_rep, v_listing.min_fulfiller_reputation;
      END IF;
    END IF;
  END IF;

  -- Validate selections and compute claim total.
  FOR v_sel IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_line_id := (v_sel->>'line_id')::uuid;
    v_kind := COALESCE(v_sel->>'kind', 'blueprint');
    v_qty := (v_sel->>'quantity')::numeric;

    IF v_line_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_kind = 'resource' THEN
      SELECT * INTO v_res
      FROM public.custom_order_resource_lines
      WHERE id = v_line_id AND order_id = p_listing_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid resource line %', v_line_id; END IF;
      IF v_qty > v_res.quantity_scu THEN
        RAISE EXCEPTION 'Requested quantity exceeds available % for %', v_res.quantity_scu, v_res.resource_label;
      END IF;

      -- SCU commodities (ores/salvage/etc.): full line only — refined cargo cannot be split/merged in-game.
      -- Whole-unit items (gems, harvestables, Wikelo gear): integer partial quantities allowed.
      IF NOT public.is_whole_unit_resource(v_res.resource_key) THEN
        IF v_qty IS DISTINCT FROM v_res.quantity_scu THEN
          RAISE EXCEPTION 'SCU resources must be taken as the full listed amount (%) — refined cargo cannot be split', v_res.resource_label;
        END IF;
      ELSIF v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION 'Quantity for % must be a whole number', v_res.resource_label;
      END IF;

      v_line_dfp := round(v_res.unit_dfp_auec * v_qty)::bigint;
    ELSE
      SELECT * INTO v_bp
      FROM public.custom_order_blueprints
      WHERE id = v_line_id AND order_id = p_listing_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid blueprint line %', v_line_id; END IF;
      IF v_qty > v_bp.quantity THEN
        RAISE EXCEPTION 'Requested quantity exceeds available % for %', v_bp.quantity, v_bp.blueprint_title;
      END IF;
      IF v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION 'Blueprint quantity must be a whole number';
      END IF;
      v_line_dfp := v_bp.unit_dfp_auec * trunc(v_qty)::int;
    END IF;

    v_claim_total := v_claim_total + v_line_dfp;
    v_sel_count := v_sel_count + 1;
  END LOOP;

  IF v_sel_count = 0 THEN
    RAISE EXCEPTION 'Select at least one item with quantity greater than zero';
  END IF;

  IF v_claim_total <= 0 THEN
    RAISE EXCEPTION 'Fulfillment total must be greater than zero';
  END IF;

  -- Buyer pending-rep transaction caps apply to the resulting child order.
  v_buyer_pending_rep := public.has_pending_buyer_rep(v_listing.requester_id);
  IF v_buyer_pending_rep THEN
    v_buyer_active_count := public.get_active_buyer_order_count(v_listing.requester_id);
    IF v_buyer_active_count >= 2 THEN
      RAISE EXCEPTION 'Buyer has reached their active order limit (2) while reputation is pending';
    END IF;
    v_buyer_active_total := public.get_active_buyer_order_total(v_listing.requester_id);
    IF (v_buyer_active_total + v_claim_total) > 1000000 THEN
      RAISE EXCEPTION 'Buyer has reached their 1,000,000 aUEC limit while reputation is pending — select fewer items';
    END IF;
  END IF;

  INSERT INTO public.custom_orders (
    requester_id, title, notes, total_dfp_auec, min_fulfiller_reputation,
    blueprint_id, min_quality, quantity, status, listing_type,
    assignee_id, accepted_at, sell_entire_listing, source_listing_id
  )
  VALUES (
    v_listing.requester_id,
    v_listing.title || ' (partial fulfillment)',
    v_listing.notes,
    v_claim_total,
    v_listing.min_fulfiller_reputation,
    NULL, 500, 1,
    'accepted', 'wtb',
    auth.uid(), now(), true, p_listing_id
  )
  RETURNING id INTO v_claim_id;

  FOR v_sel IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_line_id := (v_sel->>'line_id')::uuid;
    v_kind := COALESCE(v_sel->>'kind', 'blueprint');
    v_qty := (v_sel->>'quantity')::numeric;
    IF v_line_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    IF v_kind = 'resource' THEN
      SELECT * INTO v_res FROM public.custom_order_resource_lines WHERE id = v_line_id;
      v_line_dfp := round(v_res.unit_dfp_auec * v_qty)::bigint;

      INSERT INTO public.custom_order_resource_lines (
        order_id, resource_key, resource_label, min_quality, quantity_scu,
        unit_dfp_auec, line_dfp_auec, sort_order, source_line_id
      )
      VALUES (
        v_claim_id, v_res.resource_key, v_res.resource_label, v_res.min_quality,
        v_qty, v_res.unit_dfp_auec, v_line_dfp, v_res_idx, v_line_id
      );
      v_res_idx := v_res_idx + 1;

      IF v_res.quantity_scu <= v_qty THEN
        DELETE FROM public.custom_order_resource_lines WHERE id = v_line_id;
      ELSE
        UPDATE public.custom_order_resource_lines
        SET
          quantity_scu = quantity_scu - v_qty,
          line_dfp_auec = unit_dfp_auec * (quantity_scu - v_qty)
        WHERE id = v_line_id;
      END IF;
    ELSE
      SELECT * INTO v_bp FROM public.custom_order_blueprints WHERE id = v_line_id;
      v_bp_qty := trunc(v_qty)::int;
      v_line_dfp := v_bp.unit_dfp_auec * v_bp_qty;

      INSERT INTO public.custom_order_blueprints (
        order_id, blueprint_id, blueprint_title, min_quality, slot_qualities,
        line_snapshot, quantity, unit_dfp_auec, line_dfp_auec, sort_order, source_line_id
      )
      VALUES (
        v_claim_id, v_bp.blueprint_id, v_bp.blueprint_title, v_bp.min_quality,
        v_bp.slot_qualities, v_bp.line_snapshot, v_bp_qty,
        v_bp.unit_dfp_auec, v_line_dfp, v_bp_idx, v_line_id
      );
      v_bp_idx := v_bp_idx + 1;

      IF v_bp.quantity <= v_bp_qty THEN
        DELETE FROM public.custom_order_blueprints WHERE id = v_line_id;
      ELSE
        UPDATE public.custom_order_blueprints
        SET
          quantity = quantity - v_bp_qty,
          line_dfp_auec = unit_dfp_auec * (quantity - v_bp_qty)
        WHERE id = v_line_id;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.recalculate_custom_order_total(v_claim_id);
  PERFORM public.recalculate_custom_order_total(p_listing_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = p_listing_id
    UNION ALL
    SELECT 1 FROM public.custom_order_resource_lines WHERE order_id = p_listing_id
  ) THEN
    UPDATE public.custom_orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_listing_id;

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      p_listing_id, auth.uid(), 'listing_depleted',
      jsonb_build_object('purchase_order_id', v_claim_id)
    );
  END IF;

  SELECT COALESCE(rsi_handle, display_name, email, 'A member') INTO v_assignee_name
  FROM public.profiles WHERE id = auth.uid();
  v_price_label := public.format_dfp_auec(v_claim_total);

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    v_claim_id, auth.uid(), 'accepted',
    jsonb_build_object(
      'assignee_id', auth.uid(),
      'listing_type', 'wtb',
      'partial', true,
      'source_listing_id', p_listing_id
    )
  );

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_listing_id, auth.uid(), 'partial_claimed',
    jsonb_build_object('purchase_order_id', v_claim_id, 'total_dfp_auec', v_claim_total)
  );

  PERFORM public.create_user_notification(
    v_listing.requester_id, 'order_accepted', 'Order claimed',
    v_assignee_name || ' is crafting part of your buy listing: ' || v_listing.title || ' · ' || v_price_label,
    jsonb_build_object('order_id', v_claim_id, 'listing_id', p_listing_id, 'listing_type', 'wtb', 'partial', true)
  );

  PERFORM public.create_user_notification(
    auth.uid(), 'order_accepted_price', 'Fulfillment started',
    'Customer expects ' || v_price_label || ' for: ' || v_listing.title,
    jsonb_build_object('order_id', v_claim_id, 'listing_id', p_listing_id)
  );

  PERFORM public.bump_marketplace_listing_activity(p_listing_id);

  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', v_claim_id,
    'listing_id', p_listing_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_wtb_partial(uuid, jsonb) TO authenticated;
