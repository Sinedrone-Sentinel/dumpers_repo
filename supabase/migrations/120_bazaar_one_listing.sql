-- =============================================================================
-- Migration 120: The Bazaar — one persistent listing per user per type
--
-- * Each user has at most ONE open WTS listing and ONE open WTB listing
--   (a container of lines). Posting items APPENDS lines to the listing.
-- * Pure DFP pricing: unit prices must equal the DFP base (no ± adjustments).
-- * WTS is always partially purchasable; WTB is selectively fulfillable the
--   same way (accept_wtb_partial mirrors accept_wts_partial).
-- * Every checkout/fulfillment is a child transaction order
--   (source_listing_id) flowing through the normal lifecycle, so each
--   individual sale/fulfillment counts toward user stats/ratings/limits.
-- * Lossless: existing pending unaccepted orders are merged into the single
--   listing per user/type; in-flight orders keep running untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lossless merge of existing pending unaccepted root orders
-- -----------------------------------------------------------------------------

-- Avoid Discord "listing cancelled" spam while merging.
ALTER TABLE public.custom_orders DISABLE TRIGGER trigger_discord_delete_custom_order;

DO $$
DECLARE
  v_group record;
  v_container uuid;
  v_order record;
BEGIN
  -- Convert legacy header-only blueprint orders (no line rows) into lines
  -- so their content survives the merge.
  INSERT INTO public.custom_order_blueprints (
    order_id, blueprint_id, blueprint_title, min_quality, quantity,
    unit_dfp_auec, line_dfp_auec, sort_order
  )
  SELECT
    o.id, o.blueprint_id, o.title, COALESCE(o.min_quality, 500),
    GREATEST(COALESCE(o.quantity, 1), 1),
    (COALESCE(o.total_dfp_auec, 0) / GREATEST(COALESCE(o.quantity, 1), 1))::bigint,
    COALESCE(o.total_dfp_auec, 0),
    0
  FROM public.custom_orders o
  WHERE o.status = 'pending'
    AND o.assignee_id IS NULL
    AND o.source_listing_id IS NULL
    AND o.blueprint_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.custom_order_blueprints b WHERE b.order_id = o.id
    );

  FOR v_group IN
    SELECT requester_id, listing_type
    FROM public.custom_orders
    WHERE status = 'pending' AND assignee_id IS NULL AND source_listing_id IS NULL
    GROUP BY requester_id, listing_type
    HAVING COUNT(*) > 1
  LOOP
    -- Oldest order becomes the container listing.
    SELECT id INTO v_container
    FROM public.custom_orders
    WHERE requester_id = v_group.requester_id
      AND listing_type = v_group.listing_type
      AND status = 'pending' AND assignee_id IS NULL AND source_listing_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    FOR v_order IN
      SELECT id
      FROM public.custom_orders
      WHERE requester_id = v_group.requester_id
        AND listing_type = v_group.listing_type
        AND status = 'pending' AND assignee_id IS NULL AND source_listing_id IS NULL
        AND id <> v_container
    LOOP
      UPDATE public.custom_order_blueprints
      SET order_id = v_container,
          sort_order = sort_order + COALESCE((
            SELECT MAX(sort_order) + 1 FROM public.custom_order_blueprints WHERE order_id = v_container
          ), 0)
      WHERE order_id = v_order.id;

      UPDATE public.custom_order_resource_lines
      SET order_id = v_container,
          sort_order = sort_order + COALESCE((
            SELECT MAX(sort_order) + 1 FROM public.custom_order_resource_lines WHERE order_id = v_container
          ), 0)
      WHERE order_id = v_order.id;

      UPDATE public.custom_order_items
      SET order_id = v_container
      WHERE order_id = v_order.id;

      DELETE FROM public.custom_orders WHERE id = v_order.id;
    END LOOP;

    PERFORM public.recalculate_custom_order_total(v_container);
  END LOOP;

  -- Collapse duplicated fulfillment-material rows created by the merge.
  WITH summed AS (
    SELECT order_id, resource_key, SUM(quantity) AS total_qty, MIN(id::text)::uuid AS keep_id
    FROM public.custom_order_items
    GROUP BY order_id, resource_key
    HAVING COUNT(*) > 1
  )
  UPDATE public.custom_order_items i
  SET quantity = s.total_qty
  FROM summed s
  WHERE i.id = s.keep_id;

  WITH summed AS (
    SELECT order_id, resource_key, MIN(id::text)::uuid AS keep_id
    FROM public.custom_order_items
    GROUP BY order_id, resource_key
    HAVING COUNT(*) > 1
  )
  DELETE FROM public.custom_order_items i
  USING summed s
  WHERE i.order_id = s.order_id
    AND i.resource_key = s.resource_key
    AND i.id <> s.keep_id;

  -- Listing containers get canonical titles; WTS listings are always partial.
  UPDATE public.custom_orders
  SET
    title = CASE WHEN listing_type = 'wts' THEN 'Sell listing' ELSE 'Buy listing' END,
    sell_entire_listing = false,
    blueprint_id = NULL,
    updated_at = now()
  WHERE status = 'pending' AND assignee_id IS NULL AND source_listing_id IS NULL;
END $$;

ALTER TABLE public.custom_orders ENABLE TRIGGER trigger_discord_delete_custom_order;

-- -----------------------------------------------------------------------------
-- 2. One open listing per user per type
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS custom_orders_one_open_listing_idx
  ON public.custom_orders (requester_id, listing_type)
  WHERE status = 'pending' AND source_listing_id IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Pure DFP pricing validation (replaces ±% bounds from migration 108)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_listing_dfp_pricing(
  p_blueprints jsonb,
  p_resources jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_line jsonb;
  v_base bigint;
  v_unit bigint;
BEGIN
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_blueprints, '[]'::jsonb))
  LOOP
    v_base := NULLIF(v_line->>'base_unit_dfp_auec', '')::bigint;
    v_unit := COALESCE((v_line->>'unit_dfp_auec')::bigint, 0);
    IF v_base IS NOT NULL AND abs(v_unit - v_base) > 1 THEN
      RAISE EXCEPTION 'Listing prices are fixed at DFP — unit price mismatch for %', v_line->>'blueprint_title';
    END IF;
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_resources, '[]'::jsonb))
  LOOP
    v_base := NULLIF(v_line->>'base_unit_dfp_auec', '')::bigint;
    v_unit := COALESCE((v_line->>'unit_dfp_auec')::bigint, 0);
    IF v_base IS NOT NULL AND abs(v_unit - v_base) > 1 THEN
      RAISE EXCEPTION 'Listing prices are fixed at DFP — unit price mismatch for %', v_line->>'resource_label';
    END IF;
  END LOOP;
END;
$$;

-- Old ±% validator now delegates to the strict check (kept for legacy RPCs).
CREATE OR REPLACE FUNCTION public.validate_wts_list_price_bounds(
  p_listing_type text,
  p_sell_entire_listing boolean,
  p_total_dfp_auec bigint,
  p_blueprints jsonb,
  p_resources jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  PERFORM public.validate_listing_dfp_pricing(p_blueprints, p_resources);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Listings do not count toward buyer transaction caps (children do)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_buyer_order_count(p_user_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.custom_orders
  WHERE status IN ('accepted', 'in_progress', 'ready_for_pickup')
    AND (
      (listing_type = 'wtb' AND requester_id = p_user_id)
      OR (listing_type = 'wts' AND assignee_id = p_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.get_active_buyer_order_total(p_user_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(total_dfp_auec), 0)::bigint
  FROM public.custom_orders
  WHERE status IN ('accepted', 'in_progress', 'ready_for_pickup')
    AND (
      (listing_type = 'wtb' AND requester_id = p_user_id)
      OR (listing_type = 'wts' AND assignee_id = p_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_order_limits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_unrated_count int;
  v_buyer_order_count int;
  v_buyer_order_total bigint;
  v_fulfillment_count int;
  v_has_pending_buyer_rep boolean;
  v_has_pending_fulfiller_rep boolean;
BEGIN
  v_unrated_count := public.get_unrated_order_count(p_user_id);
  v_buyer_order_count := public.get_active_buyer_order_count(p_user_id);
  v_buyer_order_total := public.get_active_buyer_order_total(p_user_id);
  v_fulfillment_count := public.get_active_fulfiller_count(p_user_id);
  v_has_pending_buyer_rep := public.has_pending_buyer_rep(p_user_id);
  v_has_pending_fulfiller_rep := public.has_pending_fulfiller_rep(p_user_id);

  RETURN jsonb_build_object(
    'unrated_count', v_unrated_count,
    'buyer_order_count', v_buyer_order_count,
    'buyer_order_total', v_buyer_order_total,
    'fulfillment_count', v_fulfillment_count,
    'has_pending_buyer_rep', v_has_pending_buyer_rep,
    'has_pending_fulfiller_rep', v_has_pending_fulfiller_rep,
    'buyer_order_limit', 2,
    'buyer_auec_limit', 1000000,
    'fulfiller_order_limit', 1,
    -- Open listings are free to create/extend; caps apply per transaction.
    'can_create_order', (v_unrated_count = 0),
    'can_create_sell_order', (v_unrated_count = 0),
    'can_accept_order', (
      v_unrated_count = 0
      AND (NOT v_has_pending_fulfiller_rep OR v_fulfillment_count < 1)
    ),
    'can_accept_wts_order', (
      v_unrated_count = 0
      AND (NOT v_has_pending_buyer_rep OR (v_buyer_order_count < 2 AND (v_buyer_order_total < 1000000)))
    )
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. append_to_my_listing — create-or-extend the single listing
-- -----------------------------------------------------------------------------

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
        line_dfp_auec = round(unit_dfp_auec * (quantity_scu + v_qty))::bigint
      WHERE id = v_existing_id;
    ELSE
      SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_sort
      FROM public.custom_order_resource_lines WHERE order_id = v_listing.id;

      INSERT INTO public.custom_order_resource_lines (
        order_id, resource_key, resource_label, min_quality, quantity_scu,
        unit_dfp_auec, line_dfp_auec, sort_order
      ) VALUES (
        v_listing.id, v_res->>'resource_key', v_res->>'resource_label',
        COALESCE((v_res->>'min_quality')::int, 500), v_qty,
        v_unit, round(v_unit * v_qty)::bigint, v_sort
      );
    END IF;
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

  -- Queue the marketplace digest with final totals (INSERT trigger skipped
  -- because new listings are created inert, see above).
  PERFORM public.queue_discord_message(
    CASE WHEN v_listing_type = 'wts' THEN 'market_wts_new' ELSE 'market_wtb_new' END,
    CASE
      WHEN v_created AND v_listing_type = 'wts' THEN 'New WTS Listing: '
      WHEN v_created THEN 'New WTB Listing: '
      WHEN v_listing_type = 'wts' THEN 'WTS Listing Updated: '
      ELSE 'WTB Listing Updated: '
    END || v_listing.title,
    public.discord_listing_badge(v_listing_type) || ' · ' || public.format_dfp_auec(v_total),
    5814783,
    public.discord_order_embed_fields(v_listing.id),
    NULL,
    v_user_id
  );

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

GRANT EXECUTE ON FUNCTION public.append_to_my_listing(text, jsonb, jsonb, jsonb, text, int) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Manage listing lines (quantity edit / removal by the owner)
-- -----------------------------------------------------------------------------

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
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF p_kind = 'resource' THEN
    SELECT order_id INTO v_order_id FROM public.custom_order_resource_lines WHERE id = p_line_id;
  ELSE
    SELECT order_id INTO v_order_id FROM public.custom_order_blueprints WHERE id = p_line_id;
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
    UPDATE public.custom_order_resource_lines
    SET quantity_scu = p_quantity,
        line_dfp_auec = round(unit_dfp_auec * p_quantity)::bigint
    WHERE id = p_line_id;
  ELSE
    IF p_quantity <> trunc(p_quantity) THEN
      RAISE EXCEPTION 'Blueprint quantity must be a whole number';
    END IF;
    UPDATE public.custom_order_blueprints
    SET quantity = trunc(p_quantity)::int,
        line_dfp_auec = unit_dfp_auec * trunc(p_quantity)::int
    WHERE id = p_line_id;
  END IF;

  PERFORM public.recalculate_custom_order_total(v_order_id);
  PERFORM public.bump_marketplace_listing_activity(v_order_id);

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_listing_line(uuid, text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_listing_line(
  p_line_id uuid,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_listing public.custom_orders%ROWTYPE;
  v_empty boolean;
BEGIN
  IF p_kind = 'resource' THEN
    SELECT order_id INTO v_order_id FROM public.custom_order_resource_lines WHERE id = p_line_id;
  ELSE
    SELECT order_id INTO v_order_id FROM public.custom_order_blueprints WHERE id = p_line_id;
  END IF;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Line not found'; END IF;

  SELECT * INTO v_listing FROM public.custom_orders WHERE id = v_order_id FOR UPDATE;
  IF v_listing.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can remove lines';
  END IF;
  IF v_listing.status <> 'pending' OR v_listing.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only open listings can be edited';
  END IF;

  IF p_kind = 'resource' THEN
    DELETE FROM public.custom_order_resource_lines WHERE id = p_line_id;
  ELSE
    DELETE FROM public.custom_order_blueprints WHERE id = p_line_id;
  END IF;

  v_empty := NOT EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = v_order_id
    UNION ALL
    SELECT 1 FROM public.custom_order_resource_lines WHERE order_id = v_order_id
  );

  IF v_empty THEN
    DELETE FROM public.custom_orders WHERE id = v_order_id;
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'listing_closed', true);
  END IF;

  PERFORM public.recalculate_custom_order_total(v_order_id);
  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'listing_closed', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_listing_line(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. accept_wtb_partial — fulfiller selects WTB lines to craft
-- -----------------------------------------------------------------------------

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

  -- Validate selections, blueprint ownership, and compute claim total.
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
      IF NOT EXISTS (
        SELECT 1 FROM public.acquired_blueprints ab
        WHERE ab.user_id = auth.uid() AND ab.blueprint_id = v_bp.blueprint_id
      ) THEN
        RAISE EXCEPTION 'You must own blueprint % to fulfill it', v_bp.blueprint_title;
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

-- -----------------------------------------------------------------------------
-- 8. Root listings can no longer be accepted whole — selection is required
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_row.status <> 'pending' THEN RAISE EXCEPTION 'Only pending orders can be accepted'; END IF;

  -- Bazaar model: all open listings are fulfilled/purchased by line selection.
  IF order_row.listing_type = 'wts' THEN
    RAISE EXCEPTION 'Select items and quantities to buy from this listing';
  ELSE
    RAISE EXCEPTION 'Select items and quantities to fulfill from this listing';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Generalized restore alias (WTS + WTB children share the same logic)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_purchase_to_listing(p_purchase_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.restore_wts_purchase_to_listing(p_purchase_order_id);
END;
$$;

COMMENT ON FUNCTION public.restore_wts_purchase_to_listing(uuid) IS
  'Restores child order lines to the parent listing (WTS purchases and WTB fulfillment claims).';

-- -----------------------------------------------------------------------------
-- 10. Fulfiller timeout: child orders restore to their listing, not the pool
-- -----------------------------------------------------------------------------

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
    SELECT id, requester_id, assignee_id, title, source_listing_id
    FROM public.custom_orders
    WHERE status IN ('accepted', 'in_progress')
      AND assignee_id IS NOT NULL
      AND accepted_at IS NOT NULL
      AND accepted_at < NOW() - INTERVAL '72 hours'
      AND dispute_opened_at IS NULL
  LOOP
    IF v_order.source_listing_id IS NOT NULL THEN
      -- Child transaction: return the items to the parent listing and cancel.
      PERFORM public.restore_wts_purchase_to_listing(v_order.id);

      UPDATE public.custom_orders
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_order.id;

      INSERT INTO public.order_events (order_id, actor_id, event_type, details)
      VALUES (
        v_order.id, NULL, 'fulfiller_timeout',
        jsonb_build_object(
          'assignee_id', v_order.assignee_id,
          'source_listing_id', v_order.source_listing_id,
          'restored_to_listing', true
        )
      );

      PERFORM public.create_user_notification(
        v_order.requester_id,
        'order_timeout',
        'Transaction timed out',
        'The other party timed out — items were returned to the listing: ' || v_order.title,
        jsonb_build_object('order_id', v_order.id, 'source_listing_id', v_order.source_listing_id)
      );
    ELSE
      UPDATE public.custom_orders
      SET
        status = 'pending',
        assignee_id = NULL,
        accepted_at = NULL,
        updated_at = now()
      WHERE id = v_order.id;

      INSERT INTO public.order_events (order_id, actor_id, event_type, details)
      VALUES (v_order.id, NULL, 'fulfiller_timeout', jsonb_build_object('assignee_id', v_order.assignee_id));

      PERFORM public.create_user_notification(
        v_order.requester_id,
        'order_timeout',
        'Order released',
        'Fulfiller timed out — your order is back in the pool: ' || v_order.title,
        jsonb_build_object('order_id', v_order.id)
      );
    END IF;

    PERFORM public.record_order_violation(v_order.assignee_id, v_order.id, 'fulfiller_timeout');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
