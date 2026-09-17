-- 192: Per-line Bazaar stock deduct at listed qualities.
--
-- Replaces profiles.craft_deduct_inventory (unused by the app after this).
-- WTB fulfill selections and WTS listing resource lines store deduct_from_stock
-- plus a quality-aware deduct_plan. complete_order_craft deducts only those
-- plans (never lowest-Q-first totals).

ALTER TABLE public.custom_order_blueprints
  ADD COLUMN IF NOT EXISTS deduct_from_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deduct_plan jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.custom_order_resource_lines
  ADD COLUMN IF NOT EXISTS deduct_from_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deduct_plan jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.custom_order_blueprints.deduct_from_stock IS
  'When true, complete_order_craft deducts deduct_plan from the seller/fulfiller My Resources.';
COMMENT ON COLUMN public.custom_order_resource_lines.deduct_from_stock IS
  'When true, complete_order_craft deducts this commodity at min_quality from My Resources.';

CREATE OR REPLACE FUNCTION public.personal_resource_stock_at_quality(
  p_user_id uuid,
  p_resource_key text,
  p_quality integer
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ROUND(SUM(quantity)::numeric, 3), 0)
  FROM public.personal_resource_inventory
  WHERE user_id = p_user_id
    AND resource_key = p_resource_key
    AND quality = p_quality;
$$;

CREATE OR REPLACE FUNCTION public.validate_stock_deduct_plan(p_plan jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_el jsonb;
  v_n int := 0;
BEGIN
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'array' THEN
    RAISE EXCEPTION 'Deduct plan must be an array';
  END IF;
  IF jsonb_array_length(p_plan) = 0 THEN
    RAISE EXCEPTION 'Deduct plan is empty';
  END IF;
  IF jsonb_array_length(p_plan) > 32 THEN
    RAISE EXCEPTION 'Deduct plan is too large';
  END IF;
  FOR v_el IN SELECT * FROM jsonb_array_elements(p_plan)
  LOOP
    v_n := v_n + 1;
    IF COALESCE(btrim(v_el->>'resource_key'), '') = '' THEN
      RAISE EXCEPTION 'Deduct plan entry % is missing a resource', v_n;
    END IF;
    IF (v_el->>'quality') IS NULL OR (v_el->>'quality')::int < 0 OR (v_el->>'quality')::int > 10000 THEN
      RAISE EXCEPTION 'Deduct plan entry % has an invalid quality', v_n;
    END IF;
    IF COALESCE((v_el->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Deduct plan entry % has an invalid quantity', v_n;
    END IF;
  END LOOP;
END;
$$;


CREATE OR REPLACE FUNCTION public.merge_stock_deduct_plan(p_plan jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'resource_key', resource_key,
        'quality', quality,
        'quantity', quantity
      )
      ORDER BY resource_key, quality
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      e->>'resource_key' AS resource_key,
      (e->>'quality')::int AS quality,
      ROUND(SUM((e->>'quantity')::numeric), 3) AS quantity
    FROM jsonb_array_elements(COALESCE(p_plan, '[]'::jsonb)) e
    WHERE COALESCE(btrim(e->>'resource_key'), '') <> ''
    GROUP BY 1, 2
  ) s
  WHERE quantity > 0;
$$;

REVOKE ALL ON FUNCTION public.merge_stock_deduct_plan(jsonb) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.assert_personal_stock_covers_plan(
  p_user_id uuid,
  p_plan jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_el jsonb;
  v_key text;
  v_quality int;
  v_need numeric;
  v_have numeric;
BEGIN
  PERFORM public.validate_stock_deduct_plan(p_plan);
  FOR v_el IN SELECT * FROM jsonb_array_elements(p_plan)
  LOOP
    v_key := v_el->>'resource_key';
    v_quality := (v_el->>'quality')::int;
    v_need := ROUND((v_el->>'quantity')::numeric, 3);
    v_have := public.personal_resource_stock_at_quality(p_user_id, v_key, v_quality);
    IF v_have < v_need THEN
      RAISE EXCEPTION 'Insufficient My Resources for % at Q% (need %, have %)',
        v_key, v_quality, v_need, v_have;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_personal_resource_stock_at_quality(
  p_user_id uuid,
  p_resource_key text,
  p_quality integer,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row record;
  remaining numeric;
  take numeric;
BEGIN
  remaining := ROUND(p_quantity::numeric, 3);
  IF remaining <= 0 THEN
    RETURN;
  END IF;

  FOR row IN
    SELECT id, quantity
    FROM public.personal_resource_inventory
    WHERE user_id = p_user_id
      AND resource_key = p_resource_key
      AND quality = p_quality
      AND quantity > 0
    ORDER BY quantity ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(row.quantity, remaining);
    IF row.quantity - take <= 0 THEN
      DELETE FROM public.personal_resource_inventory WHERE id = row.id;
    ELSE
      UPDATE public.personal_resource_inventory
      SET
        quantity = ROUND(quantity - take, 3),
        updated_at = now(),
        updated_by = p_user_id
      WHERE id = row.id;
    END IF;
    remaining := ROUND(remaining - take, 3);
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient My Resources for % at Q%', p_resource_key, p_quality;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_personal_stock_deduct_plan(
  p_user_id uuid,
  p_plan jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_el jsonb;
BEGIN
  PERFORM public.assert_personal_stock_covers_plan(p_user_id, p_plan);
  FOR v_el IN SELECT * FROM jsonb_array_elements(p_plan)
  LOOP
    PERFORM public.deduct_personal_resource_stock_at_quality(
      p_user_id,
      v_el->>'resource_key',
      (v_el->>'quality')::int,
      (v_el->>'quantity')::numeric
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.personal_resource_stock_at_quality(uuid, text, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.validate_stock_deduct_plan(jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.assert_personal_stock_covers_plan(uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.deduct_personal_resource_stock_at_quality(uuid, text, integer, numeric) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.apply_personal_stock_deduct_plan(uuid, jsonb) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.resource_line_deduct_plan(
  p_resource_key text,
  p_quality integer,
  p_quantity numeric
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_resource_key, '') = '' OR COALESCE(p_quantity, 0) <= 0 THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object(
      'resource_key', p_resource_key,
      'quality', p_quality,
      'quantity', p_quantity
    ))
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_listing_line_stock_deduct(
  p_line_id uuid,
  p_kind text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.custom_orders%ROWTYPE;
  v_res public.custom_order_resource_lines%ROWTYPE;
  v_plan jsonb;
  v_combined jsonb := '[]'::jsonb;
  v_sib public.custom_order_resource_lines%ROWTYPE;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_kind IS DISTINCT FROM 'resource' THEN
    RAISE EXCEPTION 'Only commodity lines can deduct from My Resources';
  END IF;

  SELECT * INTO v_res FROM public.custom_order_resource_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing line not found'; END IF;

  SELECT * INTO v_listing FROM public.custom_orders WHERE id = v_res.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_listing.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can change stock deduct';
  END IF;
  IF v_listing.listing_type IS DISTINCT FROM 'wts' THEN
    RAISE EXCEPTION 'Stock deduct on listing lines is only for WTS commodities';
  END IF;
  IF v_listing.status IS DISTINCT FROM 'pending' OR v_listing.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Stock deduct can only be set on an open sell listing';
  END IF;

  IF COALESCE(p_enabled, false) THEN
    v_plan := public.resource_line_deduct_plan(v_res.resource_key, v_res.min_quality, v_res.quantity_scu);
    v_combined := v_plan;
    FOR v_sib IN
      SELECT *
      FROM public.custom_order_resource_lines
      WHERE order_id = v_listing.id
        AND id IS DISTINCT FROM p_line_id
        AND deduct_from_stock
    LOOP
      v_combined := v_combined || COALESCE(v_sib.deduct_plan, '[]'::jsonb);
    END LOOP;
    PERFORM public.assert_personal_stock_covers_plan(
      auth.uid(),
      public.merge_stock_deduct_plan(v_combined)
    );
    UPDATE public.custom_order_resource_lines
    SET deduct_from_stock = true, deduct_plan = v_plan
    WHERE id = p_line_id;
  ELSE
    UPDATE public.custom_order_resource_lines
    SET deduct_from_stock = false, deduct_plan = '[]'::jsonb
    WHERE id = p_line_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_listing_line_stock_deduct(uuid, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.resource_line_deduct_plan(text, integer, numeric) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.complete_order_craft(p_order_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  bp_row public.custom_order_blueprints%ROWTYPE;
  res_row public.custom_order_resource_lines%ROWTYPE;
  plan_el jsonb;
  fulfillment_id uuid;
  seller_name text;
  price_label text;
  seller_id uuid;
  notify_user uuid;
  did_deduct boolean := false;
  v_combined jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.can_fulfill_orders() THEN RAISE EXCEPTION 'Permission denied'; END IF;

  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF order_row.listing_type = 'wts' THEN
    seller_id := order_row.requester_id;
    notify_user := order_row.assignee_id;
    IF seller_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the seller can mark this listing ready';
    END IF;
  ELSE
    seller_id := auth.uid();
    notify_user := order_row.requester_id;
    IF order_row.assignee_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the assigned fulfiller can complete this order';
    END IF;
  END IF;

  IF order_row.status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'Order cannot be completed in status %', order_row.status;
  END IF;

  INSERT INTO public.order_fulfillments (order_id, fulfilled_by, notes)
  VALUES (p_order_id, seller_id, p_notes)
  RETURNING id INTO fulfillment_id;

  v_combined := '[]'::jsonb;

  FOR bp_row IN
    SELECT * FROM public.custom_order_blueprints
    WHERE order_id = p_order_id AND deduct_from_stock
  LOOP
    IF jsonb_typeof(bp_row.deduct_plan) = 'array' AND jsonb_array_length(bp_row.deduct_plan) > 0 THEN
      v_combined := v_combined || bp_row.deduct_plan;
      did_deduct := true;
    END IF;
  END LOOP;

  FOR res_row IN
    SELECT * FROM public.custom_order_resource_lines
    WHERE order_id = p_order_id AND deduct_from_stock
  LOOP
    v_combined := v_combined || public.resource_line_deduct_plan(
      res_row.resource_key, res_row.min_quality, res_row.quantity_scu
    );
    did_deduct := true;
  END LOOP;

  IF did_deduct THEN
    v_combined := public.merge_stock_deduct_plan(v_combined);
    IF jsonb_typeof(v_combined) = 'array' AND jsonb_array_length(v_combined) > 0 THEN
      PERFORM public.apply_personal_stock_deduct_plan(seller_id, v_combined);
      FOR plan_el IN SELECT * FROM jsonb_array_elements(v_combined)
      LOOP
        INSERT INTO public.fulfillment_items (fulfillment_id, resource_key, quantity)
        VALUES (
          fulfillment_id,
          plan_el->>'resource_key',
          ROUND((plan_el->>'quantity')::numeric, 3)
        );
      END LOOP;
    END IF;
  END IF;

  UPDATE public.custom_orders SET status = 'ready_for_pickup', ready_at = now(), updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    CASE WHEN did_deduct THEN 'resources_deducted' ELSE 'craft_completed' END,
    jsonb_build_object('fulfillment_id', fulfillment_id, 'listing_type', order_row.listing_type)
  );

  SELECT COALESCE(rsi_handle, display_name, email, 'Seller') INTO seller_name FROM public.profiles WHERE id = seller_id;
  price_label := public.format_dfp_auec(order_row.total_dfp_auec);

  IF notify_user IS NOT NULL THEN
    PERFORM public.create_user_notification(
      notify_user, 'order_ready', 'Ready for pickup',
      seller_name || ' marked ready: ' || order_row.title || ' · ' || price_label,
      jsonb_build_object('order_id', p_order_id, 'fulfillment_id', fulfillment_id)
    );
  END IF;

  RETURN fulfillment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_order_craft(uuid, text) TO authenticated;

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
  v_deduct boolean;
  v_plan jsonb;
  v_combined jsonb := '[]'::jsonb;
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

  v_combined := '[]'::jsonb;
  FOR v_sel IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_line_id := (v_sel->>'line_id')::uuid;
    v_kind := COALESCE(v_sel->>'kind', 'blueprint');
    v_qty := (v_sel->>'quantity')::numeric;
    v_deduct := COALESCE((v_sel->>'deduct_from_stock')::boolean, false);
    IF v_line_id IS NULL OR v_qty IS NULL OR v_qty <= 0 OR NOT v_deduct THEN CONTINUE; END IF;

    IF v_kind = 'resource' THEN
      SELECT * INTO v_res FROM public.custom_order_resource_lines WHERE id = v_line_id;
      v_combined := v_combined || public.resource_line_deduct_plan(v_res.resource_key, v_res.min_quality, v_qty);
    ELSE
      v_plan := COALESCE(v_sel->'deduct_plan', '[]'::jsonb);
      PERFORM public.validate_stock_deduct_plan(v_plan);
      v_combined := v_combined || v_plan;
    END IF;
  END LOOP;
  IF jsonb_typeof(v_combined) = 'array' AND jsonb_array_length(v_combined) > 0 THEN
    PERFORM public.assert_personal_stock_covers_plan(
      auth.uid(),
      public.merge_stock_deduct_plan(v_combined)
    );
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

      v_deduct := COALESCE((v_sel->>'deduct_from_stock')::boolean, false);
      IF v_deduct THEN
        v_plan := public.resource_line_deduct_plan(v_res.resource_key, v_res.min_quality, v_qty);
      ELSE
        v_plan := '[]'::jsonb;
      END IF;

      INSERT INTO public.custom_order_resource_lines (
        order_id, resource_key, resource_label, min_quality, quantity_scu,
        unit_dfp_auec, line_dfp_auec, sort_order, source_line_id,
        deduct_from_stock, deduct_plan
      )
      VALUES (
        v_claim_id, v_res.resource_key, v_res.resource_label, v_res.min_quality,
        v_qty, v_res.unit_dfp_auec, v_line_dfp, v_res_idx, v_line_id,
        v_deduct, v_plan
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

      v_deduct := COALESCE((v_sel->>'deduct_from_stock')::boolean, false);
      IF v_deduct THEN
        v_plan := COALESCE(v_sel->'deduct_plan', '[]'::jsonb);
        PERFORM public.validate_stock_deduct_plan(v_plan);
      ELSE
        v_plan := '[]'::jsonb;
      END IF;

      INSERT INTO public.custom_order_blueprints (
        order_id, blueprint_id, blueprint_title, min_quality, slot_qualities,
        line_snapshot, quantity, unit_dfp_auec, line_dfp_auec, sort_order, source_line_id,
        deduct_from_stock, deduct_plan
      )
      VALUES (
        v_claim_id, v_bp.blueprint_id, v_bp.blueprint_title, v_bp.min_quality,
        v_bp.slot_qualities, v_bp.line_snapshot, v_bp_qty,
        v_bp.unit_dfp_auec, v_line_dfp, v_bp_idx, v_line_id,
        v_deduct, v_plan
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

CREATE OR REPLACE FUNCTION public.accept_wts_partial(
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
  v_purchase_total bigint := 0;
  v_purchase_id uuid;
  v_bp public.custom_order_blueprints%ROWTYPE;
  v_res public.custom_order_resource_lines%ROWTYPE;
  v_line_dfp bigint;
  v_buyer_rep int;
  v_buyer_completed int;
  v_has_pending_rep boolean;
  v_active_count int;
  v_active_total bigint;
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
    RAISE EXCEPTION 'Select at least one item to purchase';
  END IF;

  SELECT * INTO v_listing FROM public.custom_orders WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_listing.listing_type <> 'wts' THEN RAISE EXCEPTION 'Not a sell listing'; END IF;
  IF v_listing.status <> 'pending' THEN RAISE EXCEPTION 'Listing is no longer available'; END IF;
  IF COALESCE(v_listing.sell_entire_listing, true) THEN
    RAISE EXCEPTION 'This listing must be purchased in full';
  END IF;
  IF v_listing.requester_id = auth.uid() THEN RAISE EXCEPTION 'You cannot buy your own listing'; END IF;
  IF v_listing.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot purchase from a purchase order';
  END IF;

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

    v_purchase_total := v_purchase_total + v_line_dfp;
    v_sel_count := v_sel_count + 1;
  END LOOP;

  IF v_sel_count = 0 THEN
    RAISE EXCEPTION 'Select at least one item with quantity greater than zero';
  END IF;

  IF v_purchase_total <= 0 THEN
    RAISE EXCEPTION 'Purchase total must be greater than zero';
  END IF;

  v_has_pending_rep := public.has_pending_buyer_rep(auth.uid());
  IF v_has_pending_rep THEN
    v_active_count := public.get_active_buyer_order_count(auth.uid());
    IF v_active_count >= 2 THEN
      RAISE EXCEPTION 'Order limit reached: max 2 active purchases while reputation is pending';
    END IF;
    v_active_total := public.get_active_buyer_order_total(auth.uid());
    IF (v_active_total + v_purchase_total) > 1000000 THEN
      RAISE EXCEPTION 'Order limit reached: max 1,000,000 aUEC total while reputation is pending';
    END IF;
  END IF;

  IF v_listing.min_fulfiller_reputation IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_buyer_completed
    FROM public.custom_orders
    WHERE assignee_id = auth.uid() AND listing_type = 'wts'
      AND status IN ('completed', 'archived');
    IF v_buyer_completed >= 5 THEN
      v_buyer_rep := public.user_buyer_reputation(auth.uid());
      IF v_buyer_rep IS NOT NULL AND v_buyer_rep < v_listing.min_fulfiller_reputation THEN
        RAISE EXCEPTION 'Your buyer reputation (%) is below the required %', v_buyer_rep, v_listing.min_fulfiller_reputation;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.custom_orders (
    requester_id, title, notes, total_dfp_auec, min_fulfiller_reputation,
    blueprint_id, min_quality, quantity, status, listing_type,
    assignee_id, accepted_at, sell_entire_listing, source_listing_id
  )
  VALUES (
    v_listing.requester_id,
    v_listing.title || ' (partial purchase)',
    v_listing.notes,
    v_purchase_total,
    v_listing.min_fulfiller_reputation,
    NULL, 500, 1,
    'accepted', 'wts',
    auth.uid(), now(), true, p_listing_id
  )
  RETURNING id INTO v_purchase_id;

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
        unit_dfp_auec, line_dfp_auec, sort_order, source_line_id,
        deduct_from_stock, deduct_plan
      )
      VALUES (
        v_purchase_id, v_res.resource_key, v_res.resource_label, v_res.min_quality,
        v_qty, v_res.unit_dfp_auec, v_line_dfp, v_res_idx, v_line_id,
        COALESCE(v_res.deduct_from_stock, false),
        CASE
          WHEN COALESCE(v_res.deduct_from_stock, false) THEN
            public.resource_line_deduct_plan(v_res.resource_key, v_res.min_quality, v_qty)
          ELSE '[]'::jsonb
        END
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
        line_snapshot, quantity, unit_dfp_auec, line_dfp_auec, sort_order, source_line_id,
        deduct_from_stock, deduct_plan
      )
      VALUES (
        v_purchase_id, v_bp.blueprint_id, v_bp.blueprint_title, v_bp.min_quality,
        v_bp.slot_qualities, v_bp.line_snapshot, v_bp_qty,
        v_bp.unit_dfp_auec, v_line_dfp, v_bp_idx, v_line_id,
        false, '[]'::jsonb
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

  PERFORM public.recalculate_custom_order_total(v_purchase_id);
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
      jsonb_build_object('purchase_order_id', v_purchase_id)
    );
  END IF;

  SELECT COALESCE(rsi_handle, display_name, email, 'A member') INTO v_assignee_name
  FROM public.profiles WHERE id = auth.uid();
  v_price_label := public.format_dfp_auec(v_purchase_total);

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    v_purchase_id, auth.uid(), 'accepted',
    jsonb_build_object(
      'assignee_id', auth.uid(),
      'listing_type', 'wts',
      'partial', true,
      'source_listing_id', p_listing_id
    )
  );

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_listing_id, auth.uid(), 'partial_sold',
    jsonb_build_object('purchase_order_id', v_purchase_id, 'total_dfp_auec', v_purchase_total)
  );

  PERFORM public.create_user_notification(
    v_listing.requester_id, 'order_accepted', 'Partial sale',
    v_assignee_name || ' purchased part of your listing: ' || v_listing.title || ' · ' || v_price_label,
    jsonb_build_object('order_id', v_purchase_id, 'listing_id', p_listing_id, 'listing_type', 'wts', 'partial', true)
  );

  PERFORM public.create_user_notification(
    auth.uid(), 'order_accepted_price', 'Purchase started',
    'You purchased ' || v_price_label || ' from: ' || v_listing.title,
    jsonb_build_object('order_id', v_purchase_id, 'listing_id', p_listing_id)
  );

  PERFORM public.bump_marketplace_listing_activity(p_listing_id);
  PERFORM public.insert_marketplace_purchase_feed(v_purchase_id);

  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', v_purchase_id,
    'listing_id', p_listing_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_wts_partial(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_listing_line(
  p_line_id uuid,
  p_kind text,
  p_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_listing public.custom_orders%ROWTYPE;
  v_res public.custom_order_resource_lines%ROWTYPE;
  v_bp public.custom_order_blueprints%ROWTYPE;
  v_new numeric;
  v_delta numeric := 0;
  v_change jsonb;
  v_plan jsonb;
  v_combined jsonb := '[]'::jsonb;
  v_sib public.custom_order_resource_lines%ROWTYPE;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF p_kind = 'resource' THEN
    SELECT * INTO v_res FROM public.custom_order_resource_lines WHERE id = p_line_id;
    v_order_id := v_res.order_id;
  ELSE
    SELECT * INTO v_bp FROM public.custom_order_blueprints WHERE id = p_line_id;
    v_order_id := v_bp.order_id;
  END IF;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Line not found'; END IF;

  SELECT * INTO v_listing FROM public.custom_orders WHERE id = v_order_id FOR UPDATE;
  IF v_listing.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can edit lines';
  END IF;
  IF v_listing.status <> 'pending' OR v_listing.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only open listings can be edited';
  END IF;

  IF p_kind = 'resource' THEN
    v_delta := p_quantity - v_res.quantity_scu;
    UPDATE public.custom_order_resource_lines
    SET quantity_scu = p_quantity,
        line_dfp_auec = round(unit_dfp_auec * p_quantity)::bigint
    WHERE id = p_line_id;

    IF COALESCE(v_res.deduct_from_stock, false) THEN
      v_plan := public.resource_line_deduct_plan(v_res.resource_key, v_res.min_quality, p_quantity);
      v_combined := v_plan;
      FOR v_sib IN
        SELECT *
        FROM public.custom_order_resource_lines
        WHERE order_id = v_order_id
          AND id IS DISTINCT FROM p_line_id
          AND deduct_from_stock
      LOOP
        v_combined := v_combined || COALESCE(v_sib.deduct_plan, '[]'::jsonb);
      END LOOP;
      PERFORM public.assert_personal_stock_covers_plan(
        auth.uid(),
        public.merge_stock_deduct_plan(v_combined)
      );
      UPDATE public.custom_order_resource_lines
      SET deduct_plan = v_plan
      WHERE id = p_line_id;
    END IF;

    v_change := jsonb_build_object(
      'key', 'res:' || v_res.resource_key || ':' || v_res.min_quality::text || ':' || v_res.unit_dfp_auec::text,
      'label', COALESCE(v_res.resource_label, v_res.resource_key),
      'kind', 'resource',
      'unit_label', 'SCU',
      'delta', v_delta
    );
  ELSE
    IF p_quantity <> trunc(p_quantity) THEN
      RAISE EXCEPTION 'Blueprint quantity must be a whole number';
    END IF;
    v_new := trunc(p_quantity);
    v_delta := v_new - v_bp.quantity;
    UPDATE public.custom_order_blueprints
    SET quantity = v_new::int,
        line_dfp_auec = unit_dfp_auec * v_new::int
    WHERE id = p_line_id;

    v_change := jsonb_build_object(
      'key', 'bp:' || v_bp.blueprint_id
             || ':' || COALESCE(v_bp.slot_qualities, 'null'::jsonb)::text
             || ':' || v_bp.unit_dfp_auec::text,
      'label', COALESCE(v_bp.blueprint_title, v_bp.blueprint_id),
      'kind', 'blueprint',
      'unit_label', '',
      'delta', v_delta
    );
  END IF;

  PERFORM public.recalculate_custom_order_total(v_order_id);
  PERFORM public.bump_marketplace_listing_activity(v_order_id);

  IF v_delta <> 0 THEN
    PERFORM public.queue_listing_edit_digest(v_order_id, jsonb_build_array(v_change));
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_listing_line(uuid, text, numeric) TO authenticated;

