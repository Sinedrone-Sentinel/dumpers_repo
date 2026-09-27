-- WTB SCU lines store a minimum (quantity_scu) and a maximum the buyer will accept.
-- A fractional minimum cannot be split out of a larger box, so the max floor is the next whole SCU.
-- Open buy listings are backfilled. One in-range offer closes that line.

ALTER TABLE public.custom_order_resource_lines
  ADD COLUMN IF NOT EXISTS max_quantity_scu numeric;

COMMENT ON COLUMN public.custom_order_resource_lines.max_quantity_scu IS
  'WTB SCU only. Highest amount the buyer will accept. Null on WTS and whole-unit lines.';

ALTER TABLE public.custom_order_resource_lines
  ADD COLUMN IF NOT EXISTS restore_quantity_scu numeric,
  ADD COLUMN IF NOT EXISTS restore_max_quantity_scu numeric;

COMMENT ON COLUMN public.custom_order_resource_lines.restore_quantity_scu IS
  'On a fulfillment child line: the open listing minimum to put back if the deal is cancelled after the parent line was removed.';

COMMENT ON COLUMN public.custom_order_resource_lines.restore_max_quantity_scu IS
  'On a fulfillment child line: the open listing maximum to put back with restore_quantity_scu.';

CREATE OR REPLACE FUNCTION public.wtb_scu_max_floor(p_qty numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_qty IS NULL OR p_qty <= 0 THEN NULL
    ELSE (
      WITH milli AS (
        SELECT trunc(p_qty * 1000)::bigint AS m
      )
      SELECT CASE
        WHEN (SELECT m FROM milli) % 1000 = 0 THEN (SELECT m FROM milli)::numeric / 1000
        ELSE ceil((SELECT m FROM milli) / 1000.0)
      END
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_wtb_scu_max()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_order public.custom_orders%ROWTYPE;
  v_floor numeric;
  v_max numeric;
BEGIN
  SELECT * INTO v_order FROM public.custom_orders WHERE id = NEW.order_id;
  IF NOT (
    FOUND
    AND v_order.listing_type = 'wtb'
    AND v_order.status = 'pending'
    AND v_order.source_listing_id IS NULL
    AND NOT public.is_whole_unit_resource(NEW.resource_key)
  ) THEN
    NEW.max_quantity_scu := NULL;
    RETURN NEW;
  END IF;

  v_floor := public.wtb_scu_max_floor(NEW.quantity_scu);
  v_max := NEW.max_quantity_scu;
  IF v_max IS NULL THEN
    NEW.max_quantity_scu := v_floor;
    RETURN NEW;
  END IF;

  v_max := trunc(v_max * 1000) / 1000;
  -- Raising the minimum (listing stepper) lifts the floor. Never store a max under that floor.
  IF v_max < v_floor THEN
    v_max := v_floor;
  END IF;
  NEW.max_quantity_scu := v_max;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS custom_order_resource_lines_wtb_scu_max ON public.custom_order_resource_lines;
CREATE TRIGGER custom_order_resource_lines_wtb_scu_max
  BEFORE INSERT OR UPDATE OF quantity_scu, max_quantity_scu, resource_key
  ON public.custom_order_resource_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_wtb_scu_max();

UPDATE public.custom_order_resource_lines AS line
SET max_quantity_scu = public.wtb_scu_max_floor(line.quantity_scu)
FROM public.custom_orders AS listing
WHERE line.order_id = listing.id
  AND listing.listing_type = 'wtb'
  AND listing.status = 'pending'
  AND listing.source_listing_id IS NULL
  AND NOT public.is_whole_unit_resource(line.resource_key)
  AND line.max_quantity_scu IS NULL;

CREATE OR REPLACE FUNCTION public.create_custom_order(
  p_title text,
  p_notes text DEFAULT NULL,
  p_total_dfp_auec bigint DEFAULT 0,
  p_min_fulfiller_reputation int DEFAULT NULL,
  p_blueprints jsonb DEFAULT '[]'::jsonb,
  p_resources jsonb DEFAULT '[]'::jsonb,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_listing_type text DEFAULT 'wtb',
  p_sell_entire_listing boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rsi_verified boolean;
  v_unrated_count int;
  v_has_pending_rep boolean;
  v_active_count int;
  v_active_total bigint;
  v_order_id uuid;
  v_bp jsonb;
  v_res jsonb;
  v_item jsonb;
  v_bp_idx int := 0;
  v_res_idx int := 0;
  v_first_bp_id text;
  v_is_single_bp boolean;
  v_dupe_check jsonb;
  v_abuse_track jsonb;
  v_listing_type text;
  v_sell_entire boolean;
BEGIN
  v_user_id := auth.uid();
  v_listing_type := COALESCE(NULLIF(trim(p_listing_type), ''), 'wtb');
  v_sell_entire := CASE WHEN v_listing_type = 'wts' THEN COALESCE(p_sell_entire_listing, true) ELSE true END;

  IF v_listing_type NOT IN ('wtb', 'wts') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid listing type');
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT public.can_access_preview_features() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Feature access required');
  END IF;

  SELECT rsi_handle_verified INTO v_rsi_verified FROM public.profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_rsi_verified, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle verification required');
  END IF;

  v_unrated_count := public.get_unrated_order_count(v_user_id);
  IF v_unrated_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Rate your completed orders first',
      'error_type', 'unrated', 'unrated_count', v_unrated_count
    );
  END IF;

  IF jsonb_array_length(p_blueprints) = 0 AND jsonb_array_length(p_resources) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Add at least one blueprint or resource');
  END IF;

  BEGIN
    PERFORM public.validate_wts_list_price_bounds(
      v_listing_type,
      v_sell_entire,
      p_total_dfp_auec,
      p_blueprints,
      p_resources
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  v_is_single_bp := jsonb_array_length(p_blueprints) = 1 AND jsonb_array_length(p_resources) = 0;
  IF v_is_single_bp THEN
    v_first_bp_id := p_blueprints->0->>'blueprint_id';
  END IF;

  IF v_listing_type = 'wtb' THEN
    v_has_pending_rep := public.has_pending_buyer_rep(v_user_id);
    IF v_has_pending_rep THEN
      IF COALESCE(p_total_dfp_auec, 0) < 10000 THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'Minimum order value is 10,000 aUEC while reputation is pending',
          'error_type', 'min_value', 'min_value', 10000
        );
      END IF;

      IF v_is_single_bp THEN
        v_dupe_check := public.check_duplicate_single_bp_order(v_user_id, v_first_bp_id);
        IF (v_dupe_check->>'has_duplicate')::boolean THEN
          IF v_dupe_check->>'duplicate_type' = 'pending' THEN
            RETURN jsonb_build_object(
              'success', false,
              'error', 'Pending order found with same Blueprint. Pulling your existing order back for editing.',
              'error_type', 'duplicate_pending',
              'existing_order_id', v_dupe_check->>'existing_order_id'
            );
          ELSE
            v_abuse_track := public.track_abuse_attempt(v_user_id, v_first_bp_id);
            IF (v_abuse_track->>'should_report')::boolean THEN
              PERFORM public.create_abuse_report(v_user_id, v_first_bp_id, (v_abuse_track->>'attempt_count')::int);
            END IF;
            RETURN jsonb_build_object(
              'success', false,
              'error', 'You already have an active order for this blueprint being fulfilled. Please wait for it to complete.',
              'error_type', 'duplicate_active',
              'existing_order_id', v_dupe_check->>'existing_order_id',
              'attempt_count', v_abuse_track->>'attempt_count'
            );
          END IF;
        END IF;
      END IF;

      v_active_count := public.get_active_buyer_order_count(v_user_id);
      IF v_active_count >= 2 THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'Order limit reached', 'error_type', 'order_limit',
          'detail', 'Max 2 active orders while reputation is pending'
        );
      END IF;

      v_active_total := public.get_active_buyer_order_total(v_user_id);
      IF (v_active_total + COALESCE(p_total_dfp_auec, 0)) > 1000000 THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'Order limit reached', 'error_type', 'auec_limit',
          'detail', 'Max 1,000,000 aUEC total while reputation is pending'
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.custom_orders (
    requester_id, title, notes, total_dfp_auec, min_fulfiller_reputation,
    blueprint_id, min_quality, quantity, status, listing_type, sell_entire_listing
  )
  VALUES (
    v_user_id, trim(p_title), nullif(trim(p_notes), ''), COALESCE(p_total_dfp_auec, 0),
    p_min_fulfiller_reputation, v_first_bp_id,
    COALESCE((p_blueprints->0->>'min_quality')::int, 500),
    COALESCE((p_blueprints->0->>'quantity')::int, 1),
    'pending', v_listing_type, v_sell_entire
  )
  RETURNING id INTO v_order_id;

  FOR v_bp IN SELECT * FROM jsonb_array_elements(p_blueprints) LOOP
    INSERT INTO public.custom_order_blueprints (
      order_id, blueprint_id, blueprint_title, min_quality, slot_qualities,
      line_snapshot, quantity, unit_dfp_auec, line_dfp_auec, sort_order
    ) VALUES (
      v_order_id, v_bp->>'blueprint_id', v_bp->>'blueprint_title',
      COALESCE((v_bp->>'min_quality')::int, 500), v_bp->'slot_qualities',
      v_bp->'line_snapshot',
      COALESCE((v_bp->>'quantity')::int, 1),
      COALESCE((v_bp->>'unit_dfp_auec')::bigint, 0),
      COALESCE((v_bp->>'line_dfp_auec')::bigint, 0), v_bp_idx
    );
    v_bp_idx := v_bp_idx + 1;
  END LOOP;

  FOR v_res IN SELECT * FROM jsonb_array_elements(p_resources) LOOP
    INSERT INTO public.custom_order_resource_lines (
      order_id, resource_key, resource_label, min_quality, quantity_scu,
      unit_dfp_auec, line_dfp_auec, sort_order, max_quantity_scu
    ) VALUES (
      v_order_id, v_res->>'resource_key', v_res->>'resource_label',
      COALESCE((v_res->>'min_quality')::int, 500),
      COALESCE((v_res->>'quantity_scu')::numeric, 1),
      COALESCE((v_res->>'unit_dfp_auec')::bigint, 0),
      COALESCE((v_res->>'line_dfp_auec')::bigint, 0), v_res_idx,
      NULLIF(v_res->>'max_quantity_scu', '')::numeric
    );
    v_res_idx := v_res_idx + 1;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
    VALUES (v_order_id, v_item->>'resource_key', COALESCE((v_item->>'quantity')::numeric, 1));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'listing_type', v_listing_type,
    'sell_entire_listing', v_sell_entire
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_custom_order_requester(
  p_order_id uuid,
  p_title text,
  p_notes text,
  p_total_dfp_auec bigint,
  p_min_fulfiller_reputation int,
  p_blueprint_id text,
  p_min_quality int,
  p_quantity int,
  p_blueprints jsonb DEFAULT '[]'::jsonb,
  p_resources jsonb DEFAULT '[]'::jsonb,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_sell_entire_listing boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  bp jsonb;
  res jsonb;
  item jsonb;
  bp_idx int := 0;
  res_idx int := 0;
  v_sell_entire boolean;
BEGIN
  IF NOT public.can_access_preview_features() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can edit this order';
  END IF;

  IF order_row.status <> 'pending' OR order_row.assignee_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only unaccepted pending orders can be edited';
  END IF;

  IF order_row.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Partial purchase orders cannot be edited';
  END IF;

  IF jsonb_array_length(p_blueprints) = 0 AND jsonb_array_length(p_resources) = 0 THEN
    RAISE EXCEPTION 'Order must include at least one blueprint or resource line';
  END IF;

  v_sell_entire := CASE
    WHEN order_row.listing_type = 'wts' THEN COALESCE(p_sell_entire_listing, true)
    ELSE true
  END;

  PERFORM public.validate_wts_list_price_bounds(
    order_row.listing_type,
    v_sell_entire,
    p_total_dfp_auec,
    p_blueprints,
    p_resources
  );

  UPDATE public.custom_orders
  SET
    title = trim(p_title),
    notes = nullif(trim(p_notes), ''),
    total_dfp_auec = p_total_dfp_auec,
    min_fulfiller_reputation = p_min_fulfiller_reputation,
    blueprint_id = p_blueprint_id,
    min_quality = p_min_quality,
    quantity = p_quantity,
    sell_entire_listing = v_sell_entire,
    updated_at = now()
  WHERE id = p_order_id;

  DELETE FROM public.custom_order_blueprints WHERE order_id = p_order_id;
  DELETE FROM public.custom_order_resource_lines WHERE order_id = p_order_id;
  DELETE FROM public.custom_order_items WHERE order_id = p_order_id;

  FOR bp IN SELECT * FROM jsonb_array_elements(p_blueprints)
  LOOP
    INSERT INTO public.custom_order_blueprints (
      order_id, blueprint_id, blueprint_title, min_quality, slot_qualities,
      line_snapshot, quantity, unit_dfp_auec, line_dfp_auec, sort_order
    )
    VALUES (
      p_order_id, bp->>'blueprint_id', bp->>'blueprint_title',
      (bp->>'min_quality')::int, bp->'slot_qualities', bp->'line_snapshot',
      (bp->>'quantity')::int, (bp->>'unit_dfp_auec')::bigint,
      (bp->>'line_dfp_auec')::bigint, bp_idx
    );
    bp_idx := bp_idx + 1;
  END LOOP;

  FOR res IN SELECT * FROM jsonb_array_elements(p_resources)
  LOOP
    INSERT INTO public.custom_order_resource_lines (
      order_id, resource_key, resource_label, min_quality, quantity_scu,
      unit_dfp_auec, line_dfp_auec, sort_order, max_quantity_scu
    )
    VALUES (
      p_order_id, res->>'resource_key', res->>'resource_label',
      (res->>'min_quality')::int, (res->>'quantity_scu')::numeric,
      (res->>'unit_dfp_auec')::bigint, (res->>'line_dfp_auec')::bigint, res_idx,
      NULLIF(res->>'max_quantity_scu', '')::numeric
    );
    res_idx := res_idx + 1;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
    VALUES (p_order_id, item->>'resource_key', (item->>'quantity')::numeric);
  END LOOP;

  PERFORM public.bump_marketplace_listing_activity(p_order_id);
END;
$$;

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
      IF public.is_whole_unit_resource(v_res.resource_key) AND v_qty > v_res.quantity_scu THEN
        RAISE EXCEPTION 'Requested quantity exceeds available % for %', v_res.quantity_scu, v_res.resource_label;
      END IF;

      -- SCU commodities: fulfiller offers any amount from the buyer's minimum through their max.
      -- Whole-unit items (gems, harvestables, Wikelo gear): integer partial quantities allowed.
      IF NOT public.is_whole_unit_resource(v_res.resource_key) THEN
        IF v_qty <> round(v_qty, 3) THEN
          RAISE EXCEPTION 'Quantity for % must use at most 3 decimal places', v_res.resource_label;
        END IF;
        IF v_qty < v_res.quantity_scu
           OR v_qty > COALESCE(v_res.max_quantity_scu, public.wtb_scu_max_floor(v_res.quantity_scu)) THEN
          RAISE EXCEPTION 'Offer for % must be between % and % SCU',
            v_res.resource_label,
            v_res.quantity_scu,
            COALESCE(v_res.max_quantity_scu, public.wtb_scu_max_floor(v_res.quantity_scu));
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
        deduct_from_stock, deduct_plan,
        restore_quantity_scu, restore_max_quantity_scu
      )
      VALUES (
        v_claim_id, v_res.resource_key, v_res.resource_label, v_res.min_quality,
        v_qty, v_res.unit_dfp_auec, v_line_dfp, v_res_idx, v_line_id,
        v_deduct, v_plan,
        CASE
          WHEN NOT public.is_whole_unit_resource(v_res.resource_key) THEN v_res.quantity_scu
          ELSE NULL
        END,
        CASE
          WHEN NOT public.is_whole_unit_resource(v_res.resource_key)
            THEN COALESCE(v_res.max_quantity_scu, public.wtb_scu_max_floor(v_res.quantity_scu))
          ELSE NULL
        END
      );
      v_res_idx := v_res_idx + 1;

      -- An in-range SCU offer fills the buy line. Whole-unit lines can still be split.
      IF NOT public.is_whole_unit_resource(v_res.resource_key) OR v_res.quantity_scu <= v_qty THEN
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

CREATE OR REPLACE FUNCTION public.append_to_my_listing(
  p_listing_type text,
  p_blueprints jsonb DEFAULT '[]'::jsonb,
  p_resources jsonb DEFAULT '[]'::jsonb,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_notes text DEFAULT NULL,
  p_min_fulfiller_reputation int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rsi_verified boolean;
  v_unrated_count int;
  v_listing public.custom_orders%ROWTYPE;
  v_listing_type text;
  v_created boolean := false;
  v_bp jsonb;
  v_res jsonb;
  v_item jsonb;
  v_qty numeric;
  v_unit bigint;
  v_existing_id uuid;
  v_sort int;
  v_added int := 0;
  v_total bigint;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  v_user_id := auth.uid();
  v_listing_type := COALESCE(NULLIF(trim(p_listing_type), ''), 'wtb');

  IF v_listing_type NOT IN ('wtb', 'wts') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid listing type');
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT public.can_access_preview_features() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Feature access required');
  END IF;

  SELECT rsi_handle_verified INTO v_rsi_verified FROM public.profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_rsi_verified, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle verification required');
  END IF;

  v_unrated_count := public.get_unrated_order_count(v_user_id);
  IF v_unrated_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Rate your completed orders first',
      'error_type', 'unrated', 'unrated_count', v_unrated_count
    );
  END IF;

  IF jsonb_array_length(COALESCE(p_blueprints, '[]'::jsonb)) = 0
     AND jsonb_array_length(COALESCE(p_resources, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Add at least one blueprint or resource');
  END IF;

  BEGIN
    PERFORM public.validate_listing_dfp_pricing(p_blueprints, p_resources);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  SELECT * INTO v_listing
  FROM public.custom_orders
  WHERE requester_id = v_user_id
    AND listing_type = v_listing_type
    AND status = 'pending'
    AND source_listing_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Created inert ('cancelled') so the Discord INSERT digest (which would show
    -- 0 aUEC) does not fire; flipped to 'pending' after lines are in.
    INSERT INTO public.custom_orders (
      requester_id, title, notes, total_dfp_auec, min_fulfiller_reputation,
      status, listing_type, sell_entire_listing
    )
    VALUES (
      v_user_id,
      CASE WHEN v_listing_type = 'wts' THEN 'Sell listing' ELSE 'Buy listing' END,
      nullif(trim(COALESCE(p_notes, '')), ''),
      0,
      p_min_fulfiller_reputation,
      'cancelled', v_listing_type, false
    )
    RETURNING * INTO v_listing;
    v_created := true;
  ELSE
    UPDATE public.custom_orders
    SET
      notes = COALESCE(nullif(trim(COALESCE(p_notes, '')), ''), notes),
      min_fulfiller_reputation = COALESCE(p_min_fulfiller_reputation, min_fulfiller_reputation),
      updated_at = now()
    WHERE id = v_listing.id;
  END IF;

  -- Blueprint lines: identical blueprint + slot qualities merge into one line.
  FOR v_bp IN SELECT * FROM jsonb_array_elements(COALESCE(p_blueprints, '[]'::jsonb))
  LOOP
    v_qty := GREATEST(COALESCE((v_bp->>'quantity')::int, 1), 1);
    v_unit := COALESCE((v_bp->>'unit_dfp_auec')::bigint, 0);

    SELECT id INTO v_existing_id
    FROM public.custom_order_blueprints
    WHERE order_id = v_listing.id
      AND blueprint_id = v_bp->>'blueprint_id'
      AND COALESCE(slot_qualities, 'null'::jsonb) = COALESCE(v_bp->'slot_qualities', 'null'::jsonb)
      AND unit_dfp_auec = v_unit
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.custom_order_blueprints
      SET
        quantity = quantity + v_qty::int,
        line_dfp_auec = unit_dfp_auec * (quantity + v_qty::int)
      WHERE id = v_existing_id;
    ELSE
      SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_sort
      FROM public.custom_order_blueprints WHERE order_id = v_listing.id;

      INSERT INTO public.custom_order_blueprints (
        order_id, blueprint_id, blueprint_title, min_quality, slot_qualities,
        line_snapshot, quantity, unit_dfp_auec, line_dfp_auec, sort_order
      ) VALUES (
        v_listing.id, v_bp->>'blueprint_id', v_bp->>'blueprint_title',
        COALESCE((v_bp->>'min_quality')::int, 500), v_bp->'slot_qualities',
        v_bp->'line_snapshot',
        v_qty::int, v_unit, v_unit * v_qty::int, v_sort
      );
    END IF;

    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'key', 'bp:' || (v_bp->>'blueprint_id')
             || ':' || COALESCE(v_bp->'slot_qualities', 'null'::jsonb)::text
             || ':' || v_unit::text,
      'label', COALESCE(v_bp->>'blueprint_title', v_bp->>'blueprint_id'),
      'kind', 'blueprint',
      'unit_label', '',
      'delta', v_qty
    ));
    v_added := v_added + 1;
  END LOOP;

  -- Resource lines: same resource + quality + unit price merge into one line.
  FOR v_res IN SELECT * FROM jsonb_array_elements(COALESCE(p_resources, '[]'::jsonb))
  LOOP
    v_qty := GREATEST(COALESCE((v_res->>'quantity_scu')::numeric, 1), 0.001);
    v_unit := COALESCE((v_res->>'unit_dfp_auec')::bigint, 0);

    SELECT id INTO v_existing_id
    FROM public.custom_order_resource_lines
    WHERE order_id = v_listing.id
      AND resource_key = v_res->>'resource_key'
      AND min_quality = COALESCE((v_res->>'min_quality')::int, 500)
      AND unit_dfp_auec = v_unit
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.custom_order_resource_lines
      SET
        quantity_scu = quantity_scu + v_qty,
        line_dfp_auec = round(unit_dfp_auec * (quantity_scu + v_qty))::bigint,
        max_quantity_scu = CASE
          WHEN v_listing.listing_type IS DISTINCT FROM 'wtb'
            OR public.is_whole_unit_resource(resource_key) THEN NULL
          ELSE GREATEST(
            COALESCE(max_quantity_scu, public.wtb_scu_max_floor(quantity_scu)),
            COALESCE(NULLIF(v_res->>'max_quantity_scu', '')::numeric, public.wtb_scu_max_floor(v_qty)),
            public.wtb_scu_max_floor(quantity_scu + v_qty)
          )
        END
      WHERE id = v_existing_id;
    ELSE
      SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_sort
      FROM public.custom_order_resource_lines WHERE order_id = v_listing.id;

      INSERT INTO public.custom_order_resource_lines (
        order_id, resource_key, resource_label, min_quality, quantity_scu,
        unit_dfp_auec, line_dfp_auec, sort_order, max_quantity_scu
      ) VALUES (
        v_listing.id, v_res->>'resource_key', v_res->>'resource_label',
        COALESCE((v_res->>'min_quality')::int, 500), v_qty,
        v_unit, round(v_unit * v_qty)::bigint, v_sort,
        NULLIF(v_res->>'max_quantity_scu', '')::numeric
      );
    END IF;

    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'key', 'res:' || (v_res->>'resource_key')
             || ':' || COALESCE((v_res->>'min_quality')::int, 500)::text
             || ':' || v_unit::text,
      'label', COALESCE(v_res->>'resource_label', v_res->>'resource_key'),
      'kind', 'resource',
      'unit_label', 'SCU',
      'delta', v_qty
    ));
    v_added := v_added + 1;
  END LOOP;

  -- Fulfillment materials: additive by resource_key.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    UPDATE public.custom_order_items
    SET quantity = quantity + COALESCE((v_item->>'quantity')::numeric, 1)
    WHERE order_id = v_listing.id AND resource_key = v_item->>'resource_key';

    IF NOT FOUND THEN
      INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
      VALUES (v_listing.id, v_item->>'resource_key', COALESCE((v_item->>'quantity')::numeric, 1));
    END IF;
  END LOOP;

  v_total := public.recalculate_custom_order_total(v_listing.id);

  IF v_created THEN
    UPDATE public.custom_orders SET status = 'pending', updated_at = now()
    WHERE id = v_listing.id;

    -- In-app member notification (INSERT trigger skipped by inert creation).
    DECLARE
      v_requester_name text;
      v_member_id uuid;
    BEGIN
      SELECT COALESCE(rsi_handle, display_name, email, 'Someone')
      INTO v_requester_name FROM public.profiles WHERE id = v_user_id;

      FOR v_member_id IN
        SELECT id FROM public.profiles
        WHERE role IN ('member', 'officer', 'super-admin') AND id != v_user_id
      LOOP
        PERFORM public.create_user_notification(
          v_member_id,
          'order_new',
          'New Listing Available',
          v_requester_name || ' posted: ' || v_listing.title || ' · ' || public.format_dfp_auec(v_total),
          jsonb_build_object('order_id', v_listing.id, 'total_dfp_auec', v_total)
        );
      END LOOP;
    END;
  END IF;

  PERFORM public.bump_marketplace_listing_activity(v_listing.id);

  IF v_created THEN
    -- Brand-new listing: one full-embed announcement (INSERT trigger skipped
    -- because the row was created inert, see above).
    PERFORM public.queue_discord_message(
      CASE WHEN v_listing_type = 'wts' THEN 'market_wts_new' ELSE 'market_wtb_new' END,
      CASE WHEN v_listing_type = 'wts' THEN 'New WTS Listing: ' ELSE 'New WTB Listing: ' END || v_listing.title,
      public.discord_listing_badge(v_listing_type) || ' · ' || public.format_dfp_auec(v_total),
      5814783,
      public.discord_order_embed_fields(v_listing.id),
      NULL,
      v_user_id
    );
  ELSE
    -- Editing an existing listing: coalesce into one held, diff-only digest so
    -- we never post mid-edit and never re-dump the whole listing.
    PERFORM public.queue_listing_edit_digest(v_listing.id, v_changes);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_listing.id,
    'listing_type', v_listing_type,
    'created', v_created,
    'lines_added', v_added,
    'total_dfp_auec', v_total
  );
END;
$$;

-- Cancelled SCU fulfillment put the offer back as a new minimum. Restore the buyer's range instead.
CREATE OR REPLACE FUNCTION public.restore_wts_purchase_to_listing(p_purchase_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.custom_orders%ROWTYPE;
  v_listing public.custom_orders%ROWTYPE;
  v_bp record;
  v_res record;
  v_qty numeric;
  v_max numeric;
BEGIN
  SELECT * INTO v_purchase FROM public.custom_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_purchase.source_listing_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_listing FROM public.custom_orders WHERE id = v_purchase.source_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source listing not found'; END IF;

  FOR v_bp IN
    SELECT * FROM public.custom_order_blueprints WHERE order_id = p_purchase_order_id
  LOOP
    IF v_bp.source_line_id IS NOT NULL THEN
      UPDATE public.custom_order_blueprints
      SET
        quantity = quantity + v_bp.quantity,
        line_dfp_auec = unit_dfp_auec * (quantity + v_bp.quantity)
      WHERE id = v_bp.source_line_id;
    ELSE
      INSERT INTO public.custom_order_blueprints (
        order_id, blueprint_id, blueprint_title, min_quality, slot_qualities,
        line_snapshot, quantity, unit_dfp_auec, line_dfp_auec, sort_order
      )
      VALUES (
        v_listing.id, v_bp.blueprint_id, v_bp.blueprint_title, v_bp.min_quality,
        v_bp.slot_qualities, v_bp.line_snapshot, v_bp.quantity,
        v_bp.unit_dfp_auec, v_bp.line_dfp_auec,
        COALESCE((SELECT MAX(sort_order) + 1 FROM public.custom_order_blueprints WHERE order_id = v_listing.id), 0)
      );
    END IF;
  END LOOP;

  FOR v_res IN
    SELECT * FROM public.custom_order_resource_lines WHERE order_id = p_purchase_order_id
  LOOP
    IF v_res.source_line_id IS NOT NULL THEN
      UPDATE public.custom_order_resource_lines
      SET
        quantity_scu = quantity_scu + v_res.quantity_scu,
        line_dfp_auec = unit_dfp_auec * (quantity_scu + v_res.quantity_scu)
      WHERE id = v_res.source_line_id;
    ELSE
      v_qty := COALESCE(v_res.restore_quantity_scu, v_res.quantity_scu);
      v_max := v_res.restore_max_quantity_scu;
      INSERT INTO public.custom_order_resource_lines (
        order_id, resource_key, resource_label, min_quality, quantity_scu,
        max_quantity_scu, unit_dfp_auec, line_dfp_auec, sort_order
      )
      VALUES (
        v_listing.id, v_res.resource_key, v_res.resource_label, v_res.min_quality,
        v_qty, v_max, v_res.unit_dfp_auec, round(v_res.unit_dfp_auec * v_qty)::bigint,
        COALESCE((SELECT MAX(sort_order) + 1 FROM public.custom_order_resource_lines WHERE order_id = v_listing.id), 0)
      );
    END IF;
  END LOOP;

  PERFORM public.recalculate_custom_order_total(v_listing.id);

  IF v_listing.status = 'cancelled' THEN
    UPDATE public.custom_orders
    SET status = 'pending', updated_at = now()
    WHERE id = v_listing.id;
  END IF;

  PERFORM public.bump_marketplace_listing_activity(v_listing.id);
END;
$$;
