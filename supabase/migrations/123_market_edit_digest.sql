-- =============================================================================
-- Migration 123: Marketplace edit digest — quiet, diff-only "Listing Updated"
--
-- Problem (reported): editing an open listing (e.g. "Add items", or changing a
-- line quantity) fired an immediate Discord "WTB/WTS Listing Updated" that
-- dumped the ENTIRE listing, every time — so a member fixing a mistake
-- (accidentally added 9 rifles, then removed them) spammed the channel with
-- full-listing snapshots mid-edit.
--
-- Fix:
--  * Edits no longer post immediately. They accumulate into ONE held, per-listing
--    digest (dedupe_key market:edit:<listing_id>) that only sends after the
--    coalesce window elapses — i.e. after the member is done editing.
--  * The digest shows ONLY the net change per line (e.g. "Parallax Rifle +9",
--    "Iron -5 SCU"), not the whole listing.
--  * Net-zero editing (add then remove the same thing) cancels out and sends
--    NOTHING.
--  * Brand-new listings are unchanged: one full-embed "New Listing" announcement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Edit digest: accumulate net line changes into one held, per-listing message
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_listing_edit_digest(
  p_listing_id uuid,
  p_changes jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.discord_settings%ROWTYPE;
  v_listing public.custom_orders%ROWTYPE;
  v_event_type text;
  v_dedupe_key text;
  v_existing_id uuid;
  v_meta jsonb;
  v_lines jsonb;
  v_change jsonb;
  v_key text;
  v_prev numeric;
  v_next numeric;
  v_minutes int;
  v_held_until timestamptz;
  v_handle text;
  v_title text;
  v_desc text;
  v_fields jsonb;
  v_entry record;
  v_delta numeric;
  v_amount text;
  v_nonzero int := 0;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_listing FROM public.custom_orders WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Only open listing containers get edit digests.
  IF v_listing.status <> 'pending' OR v_listing.source_listing_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings FROM public.discord_settings WHERE id = 1;
  IF NOT FOUND
     OR NOT v_settings.enabled
     OR NOT v_settings.orders_enabled
     OR NOT v_settings.order_new_enabled THEN
    RETURN NULL;
  END IF;

  v_event_type := CASE WHEN v_listing.listing_type = 'wts' THEN 'market_wts_new' ELSE 'market_wtb_new' END;
  v_dedupe_key := 'market:edit:' || p_listing_id::text;
  v_handle := public.discord_profile_label(v_listing.requester_id);
  v_desc := public.discord_listing_badge(v_listing.listing_type)
    || ' · ' || public.format_dfp_auec(v_listing.total_dfp_auec);

  -- Hold the digest for the coalesce window so a burst of edits collapses into
  -- one message that lands after the member finishes.
  IF COALESCE(v_settings.market_coalesce_enabled, true) THEN
    v_minutes := GREATEST(COALESCE(v_settings.market_coalesce_minutes, 15), 1);
  ELSE
    v_minutes := 0;
  END IF;
  v_held_until := now() + (v_minutes || ' minutes')::interval;

  -- Serialize concurrent edits to the same listing so the digest merges cleanly.
  PERFORM pg_advisory_xact_lock(hashtext(v_dedupe_key));

  SELECT id, coalesce_meta
  INTO v_existing_id, v_meta
  FROM public.discord_message_queue
  WHERE dedupe_key = v_dedupe_key
    AND processed_at IS NULL;

  v_lines := COALESCE(v_meta->'lines', '{}'::jsonb);

  -- Merge incoming net deltas keyed by line identity.
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_key := v_change->>'key';
    IF v_key IS NULL OR v_key = '' THEN
      CONTINUE;
    END IF;
    v_prev := COALESCE((v_lines->v_key->>'delta')::numeric, 0);
    v_next := v_prev + COALESCE((v_change->>'delta')::numeric, 0);
    v_lines := jsonb_set(
      v_lines,
      ARRAY[v_key],
      jsonb_build_object(
        'label', COALESCE(v_change->>'label', v_lines->v_key->>'label', v_key),
        'kind', COALESCE(v_change->>'kind', v_lines->v_key->>'kind', 'blueprint'),
        'unit_label', COALESCE(v_change->>'unit_label', v_lines->v_key->>'unit_label', ''),
        'delta', to_jsonb(v_next)
      ),
      true
    );
  END LOOP;

  -- Header mirrors the normal embed but the body carries only what changed.
  v_fields := jsonb_build_array(
    jsonb_build_object('name', 'Type', 'value', public.discord_listing_badge(v_listing.listing_type), 'inline', true),
    jsonb_build_object('name', 'New Total', 'value', public.format_dfp_auec(v_listing.total_dfp_auec), 'inline', true),
    jsonb_build_object('name', 'Posted by', 'value', left(v_handle, 256), 'inline', true)
  );

  FOR v_entry IN SELECT key, value FROM jsonb_each(v_lines)
  LOOP
    v_delta := COALESCE((v_entry.value->>'delta')::numeric, 0);
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;
    v_nonzero := v_nonzero + 1;

    IF (v_entry.value->>'kind') = 'resource' THEN
      v_amount := rtrim(rtrim(to_char(abs(v_delta), 'FM999999990.999'), '0'), '.');
    ELSE
      v_amount := trunc(abs(v_delta))::text;
    END IF;

    v_fields := v_fields || jsonb_build_array(
      jsonb_build_object(
        'name', left(COALESCE(v_entry.value->>'label', v_entry.key), 256),
        'value', left(
          CASE WHEN v_delta > 0 THEN 'Added +' ELSE 'Removed -' END
          || v_amount
          || CASE WHEN COALESCE(v_entry.value->>'unit_label', '') <> ''
               THEN ' ' || (v_entry.value->>'unit_label') ELSE '' END,
          1024
        ),
        'inline', false
      )
    );
  END LOOP;

  -- Every change cancelled out (e.g. added then removed) — announce nothing.
  IF v_nonzero = 0 THEN
    IF v_existing_id IS NOT NULL THEN
      DELETE FROM public.discord_message_queue WHERE id = v_existing_id;
    END IF;
    RETURN NULL;
  END IF;

  v_title := CASE WHEN v_listing.listing_type = 'wts' THEN 'WTS Listing Updated: ' ELSE 'WTB Listing Updated: ' END
    || v_listing.title;
  v_meta := jsonb_build_object('lines', v_lines, 'listing_id', p_listing_id);

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.discord_message_queue
    SET
      event_type = v_event_type,
      title = v_title,
      description = v_desc,
      fields = v_fields,
      coalesce_meta = v_meta,
      held_until = v_held_until,
      actor_user_id = v_listing.requester_id
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.discord_message_queue (
    event_type, title, description, color, fields,
    dedupe_key, held_until, coalesce_meta, actor_user_id
  )
  VALUES (
    v_event_type, v_title, v_desc, 5814783, v_fields,
    v_dedupe_key, v_held_until, v_meta, v_listing.requester_id
  )
  RETURNING id INTO v_existing_id;

  RETURN v_existing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_listing_edit_digest(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_listing_edit_digest(uuid, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. append_to_my_listing — new listing = full announcement; edit = held digest
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

GRANT EXECUTE ON FUNCTION public.append_to_my_listing(text, jsonb, jsonb, jsonb, text, int) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. update_listing_line — feed the net quantity change into the edit digest
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
  v_res public.custom_order_resource_lines%ROWTYPE;
  v_bp public.custom_order_blueprints%ROWTYPE;
  v_new numeric;
  v_delta numeric := 0;
  v_change jsonb;
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

-- -----------------------------------------------------------------------------
-- 4. remove_listing_line — record the removal in the digest (or clear it on close)
-- -----------------------------------------------------------------------------

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
  v_res public.custom_order_resource_lines%ROWTYPE;
  v_bp public.custom_order_blueprints%ROWTYPE;
  v_change jsonb;
BEGIN
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
    RAISE EXCEPTION 'Only the listing owner can remove lines';
  END IF;
  IF v_listing.status <> 'pending' OR v_listing.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only open listings can be edited';
  END IF;

  IF p_kind = 'resource' THEN
    v_change := jsonb_build_object(
      'key', 'res:' || v_res.resource_key || ':' || v_res.min_quality::text || ':' || v_res.unit_dfp_auec::text,
      'label', COALESCE(v_res.resource_label, v_res.resource_key),
      'kind', 'resource',
      'unit_label', 'SCU',
      'delta', -v_res.quantity_scu
    );
    DELETE FROM public.custom_order_resource_lines WHERE id = p_line_id;
  ELSE
    v_change := jsonb_build_object(
      'key', 'bp:' || v_bp.blueprint_id
             || ':' || COALESCE(v_bp.slot_qualities, 'null'::jsonb)::text
             || ':' || v_bp.unit_dfp_auec::text,
      'label', COALESCE(v_bp.blueprint_title, v_bp.blueprint_id),
      'kind', 'blueprint',
      'unit_label', '',
      'delta', -v_bp.quantity
    );
    DELETE FROM public.custom_order_blueprints WHERE id = p_line_id;
  END IF;

  v_empty := NOT EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = v_order_id
    UNION ALL
    SELECT 1 FROM public.custom_order_resource_lines WHERE order_id = v_order_id
  );

  IF v_empty THEN
    -- Removing the last line closes the listing; the delete trigger emits the
    -- "cancelled" churn and clears any pending edit digest — don't queue one.
    DELETE FROM public.custom_orders WHERE id = v_order_id;
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'listing_closed', true);
  END IF;

  PERFORM public.recalculate_custom_order_total(v_order_id);
  PERFORM public.bump_marketplace_listing_activity(v_order_id);
  PERFORM public.queue_listing_edit_digest(v_order_id, jsonb_build_array(v_change));

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'listing_closed', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_listing_line(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Clear a pending edit digest when its listing is deleted/closed
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_discord_delete_custom_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Drop any held edit digest so a closed listing never posts a late "Updated".
  DELETE FROM public.discord_message_queue
  WHERE dedupe_key = 'market:edit:' || OLD.id::text
    AND processed_at IS NULL;

  IF OLD.status = 'pending' AND OLD.assignee_id IS NULL THEN
    PERFORM public.queue_market_listing_churn(
      'cancelled',
      OLD.requester_id,
      OLD.id,
      OLD.title,
      OLD.listing_type,
      OLD.total_dfp_auec
    );
  END IF;

  RETURN OLD;
END;
$$;
