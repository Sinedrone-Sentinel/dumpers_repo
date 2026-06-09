-- 006 access, order RPCs, site settings

CREATE OR REPLACE FUNCTION public.can_access_preview_features()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR (
      COALESCE(public.get_current_user_role(), '') = 'officer'
      AND COALESCE(
        (SELECT preview_features_enabled FROM public.profiles WHERE id = auth.uid()),
        false
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_fulfill_orders()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_preview_features();
$$;

CREATE OR REPLACE FUNCTION public.can_view_personal_resources(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_target_user_id = auth.uid()
    OR public.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_id uuid;
BEGIN
  INSERT INTO public.user_notifications (user_id, type, title, body, payload)
  VALUES (p_user_id, p_type, p_title, p_body, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.format_dfp_auec(p_amount bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_amount IS NULL OR p_amount <= 0 THEN 'DFP not set'
    ELSE to_char(p_amount, 'FM999,999,999,999') || ' aUEC (DFP required)'
  END;
$$;

CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  bp_row record;
  assignee_name text;
  price_label text;
  fulfiller_rep int;
  fulfiller_completed int;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be accepted';
  END IF;

  IF order_row.requester_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot accept your own order';
  END IF;

  IF order_row.min_fulfiller_reputation IS NOT NULL THEN
    SELECT COUNT(*)::int INTO fulfiller_completed
    FROM public.custom_orders
    WHERE assignee_id = auth.uid()
      AND status IN ('completed', 'archived');

    IF fulfiller_completed >= 5 THEN
      fulfiller_rep := public.user_fulfiller_reputation(auth.uid());

      IF fulfiller_rep IS NOT NULL
         AND fulfiller_rep < order_row.min_fulfiller_reputation THEN
        RAISE EXCEPTION
          'Your fulfiller reputation (%) is below the required %',
          fulfiller_rep,
          order_row.min_fulfiller_reputation;
      END IF;
    END IF;
  END IF;

  FOR bp_row IN
    SELECT blueprint_id
    FROM public.custom_order_blueprints
    WHERE order_id = p_order_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.acquired_blueprints ab
      WHERE ab.user_id = auth.uid()
        AND ab.blueprint_id = bp_row.blueprint_id
    ) THEN
      RAISE EXCEPTION 'You must own blueprint % to accept this order', bp_row.blueprint_id;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = p_order_id
  ) AND order_row.blueprint_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.acquired_blueprints ab
      WHERE ab.user_id = auth.uid()
        AND ab.blueprint_id = order_row.blueprint_id
    ) THEN
      RAISE EXCEPTION 'You must own this blueprint to accept the order';
    END IF;
  END IF;

  UPDATE public.custom_orders
  SET
    status = 'accepted',
    assignee_id = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  SELECT COALESCE(rsi_handle, display_name, email, 'A member')
  INTO assignee_name
  FROM public.profiles
  WHERE id = auth.uid();

  price_label := public.format_dfp_auec(order_row.total_dfp_auec);

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'accepted',
    jsonb_build_object(
      'assignee_id', auth.uid(),
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_accepted',
    'Order accepted',
    assignee_name || ' accepted your order: ' || order_row.title || ' · ' || price_label,
    jsonb_build_object(
      'order_id', p_order_id,
      'assignee_id', auth.uid(),
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  PERFORM public.create_user_notification(
    auth.uid(),
    'order_accepted_price',
    'You accepted an order',
    'Customer expects ' || price_label || ' for: ' || order_row.title,
    jsonb_build_object(
      'order_id', p_order_id,
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_custom_order_work(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.assignee_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned fulfiller can start this order';
  END IF;

  IF order_row.status <> 'accepted' THEN
    RAISE EXCEPTION 'Order must be accepted before starting work';
  END IF;

  UPDATE public.custom_orders
  SET status = 'in_progress', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (p_order_id, auth.uid(), 'in_progress', '{}'::jsonb);

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_in_progress',
    'Craft started',
    'Work has started on your order: ' || order_row.title,
    jsonb_build_object('order_id', p_order_id)
  );
END;
$$;

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

  SELECT craft_deduct_inventory
  INTO deduct_inventory
  FROM public.profiles
  WHERE id = auth.uid();

  IF deduct_inventory IS NULL THEN
    deduct_inventory := false;
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.assignee_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned fulfiller can complete this order';
  END IF;

  IF order_row.status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'Order cannot be completed in status %', order_row.status;
  END IF;

  IF deduct_inventory THEN
    FOR item_row IN
      SELECT resource_key, quantity
      FROM public.custom_order_items
      WHERE order_id = p_order_id
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
      SELECT resource_key, quantity
      FROM public.custom_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.deduct_personal_resource_stock(
        auth.uid(),
        item_row.resource_key,
        item_row.quantity
      );

      INSERT INTO public.fulfillment_items (fulfillment_id, resource_key, quantity)
      VALUES (fulfillment_id, item_row.resource_key, item_row.quantity);
    END LOOP;
  END IF;

  UPDATE public.custom_orders
  SET status = 'ready_for_pickup', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    CASE WHEN deduct_inventory THEN 'resources_deducted' ELSE 'craft_completed' END,
    jsonb_build_object(
      'fulfillment_id', fulfillment_id,
      'deducted_inventory', deduct_inventory
    )
  );

  SELECT COALESCE(rsi_handle, display_name, email, 'Your fulfiller')
  INTO fulfiller_name
  FROM public.profiles
  WHERE id = auth.uid();

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
  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can confirm pickup';
  END IF;

  IF order_row.status <> 'ready_for_pickup' THEN
    RAISE EXCEPTION 'Order is not ready for pickup';
  END IF;

  UPDATE public.custom_orders
  SET status = 'completed', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (p_order_id, auth.uid(), 'completed', '{}'::jsonb);

  SELECT COALESCE(rsi_handle, display_name, email, 'Customer')
  INTO requester_name
  FROM public.profiles
  WHERE id = auth.uid();

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

-- Requester edit/delete pending orders; fulfiller abandon accepted work back to pool.

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
  p_items jsonb DEFAULT '[]'::jsonb
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

  IF jsonb_array_length(p_blueprints) = 0 AND jsonb_array_length(p_resources) = 0 THEN
    RAISE EXCEPTION 'Order must include at least one blueprint or resource line';
  END IF;

  UPDATE public.custom_orders
  SET
    title = trim(p_title),
    notes = nullif(trim(p_notes), ''),
    total_dfp_auec = p_total_dfp_auec,
    min_fulfiller_reputation = p_min_fulfiller_reputation,
    blueprint_id = p_blueprint_id,
    min_quality = p_min_quality,
    quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;

  DELETE FROM public.custom_order_blueprints WHERE order_id = p_order_id;
  DELETE FROM public.custom_order_resource_lines WHERE order_id = p_order_id;
  DELETE FROM public.custom_order_items WHERE order_id = p_order_id;

  FOR bp IN SELECT * FROM jsonb_array_elements(p_blueprints)
  LOOP
    INSERT INTO public.custom_order_blueprints (
      order_id,
      blueprint_id,
      blueprint_title,
      min_quality,
      quantity,
      unit_dfp_auec,
      line_dfp_auec,
      sort_order
    )
    VALUES (
      p_order_id,
      bp->>'blueprint_id',
      bp->>'blueprint_title',
      (bp->>'min_quality')::int,
      (bp->>'quantity')::int,
      (bp->>'unit_dfp_auec')::bigint,
      (bp->>'line_dfp_auec')::bigint,
      bp_idx
    );
    bp_idx := bp_idx + 1;
  END LOOP;

  FOR res IN SELECT * FROM jsonb_array_elements(p_resources)
  LOOP
    INSERT INTO public.custom_order_resource_lines (
      order_id,
      resource_key,
      resource_label,
      min_quality,
      quantity_scu,
      unit_dfp_auec,
      line_dfp_auec,
      sort_order
    )
    VALUES (
      p_order_id,
      res->>'resource_key',
      res->>'resource_label',
      (res->>'min_quality')::int,
      (res->>'quantity_scu')::numeric,
      (res->>'unit_dfp_auec')::bigint,
      (res->>'line_dfp_auec')::bigint,
      res_idx
    );
    res_idx := res_idx + 1;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
    VALUES (
      p_order_id,
      item->>'resource_key',
      (item->>'quantity')::numeric
    );
  END LOOP;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (p_order_id, auth.uid(), 'updated', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_custom_order_requester(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
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
    RAISE EXCEPTION 'Only the requester can delete this order';
  END IF;

  IF order_row.status <> 'pending' OR order_row.assignee_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only unaccepted pending orders can be deleted';
  END IF;

  DELETE FROM public.custom_orders WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.abandon_custom_order_fulfillment(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  fulfiller_name text;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.assignee_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned fulfiller can abandon this order';
  END IF;

  IF order_row.status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'Only accepted or in-progress orders can be abandoned';
  END IF;

  SELECT COALESCE(rsi_handle, display_name, email, 'A member')
  INTO fulfiller_name
  FROM public.profiles
  WHERE id = auth.uid();

  UPDATE public.custom_orders
  SET
    status = 'pending',
    assignee_id = NULL,
    accepted_at = NULL,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'abandoned',
    jsonb_build_object('previous_status', order_row.status)
  );

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_abandoned',
    'Fulfiller backed out',
    fulfiller_name || ' released your order back to the pool: ' || order_row.title,
    jsonb_build_object('order_id', p_order_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_custom_order_requester(
  uuid, text, text, bigint, int, text, int, int, jsonb, jsonb, jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_custom_order_requester(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_custom_order_fulfillment(uuid) TO authenticated;


-- Replace custom_order_items with client-computed SCU totals (standardCargoUnits × crafts).

CREATE OR REPLACE FUNCTION public.replace_custom_order_fulfillment_items(
  p_order_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  item jsonb;
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

  IF order_row.status = 'pending' THEN
    IF NOT public.can_fulfill_orders() THEN
      RAISE EXCEPTION 'Permission denied: fulfillment access required';
    END IF;
  ELSIF order_row.status IN ('accepted', 'in_progress') THEN
    IF order_row.assignee_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the assigned fulfiller can update fulfillment items';
    END IF;
  ELSE
    RAISE EXCEPTION 'Order items cannot be updated in status %', order_row.status;
  END IF;

  DELETE FROM public.custom_order_items WHERE order_id = p_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
    VALUES (
      p_order_id,
      item->>'resource_key',
      (item->>'quantity')::numeric
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_custom_order_fulfillment_items(uuid, jsonb)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.archive_custom_order_with_rating(
  p_order_id uuid,
  p_stars smallint,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  ratee_id uuid;
  rater_role text;
BEGIN
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5 stars';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed orders can be archived';
  END IF;

  IF auth.uid() = order_row.requester_id THEN
    IF order_row.requester_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'You have already archived this order';
    END IF;

    ratee_id := order_row.assignee_id;
    rater_role := 'requester';

    IF ratee_id IS NULL THEN
      RAISE EXCEPTION 'This order has no fulfiller to rate';
    END IF;

    INSERT INTO public.custom_order_ratings (order_id, rater_id, ratee_id, rater_role, stars, comment)
    VALUES (p_order_id, auth.uid(), ratee_id, rater_role, p_stars, NULLIF(trim(p_comment), ''));

    UPDATE public.custom_orders
    SET requester_archived_at = now(), updated_at = now()
    WHERE id = p_order_id;

  ELSIF auth.uid() = order_row.assignee_id THEN
    IF order_row.fulfiller_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'You have already archived this order';
    END IF;

    ratee_id := order_row.requester_id;
    rater_role := 'fulfiller';

    INSERT INTO public.custom_order_ratings (order_id, rater_id, ratee_id, rater_role, stars, comment)
    VALUES (p_order_id, auth.uid(), ratee_id, rater_role, p_stars, NULLIF(trim(p_comment), ''));

    UPDATE public.custom_orders
    SET fulfiller_archived_at = now(), updated_at = now()
    WHERE id = p_order_id;

  ELSE
    RAISE EXCEPTION 'Only the requester or fulfiller can archive this order';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id;

  IF order_row.requester_archived_at IS NOT NULL
     AND order_row.fulfiller_archived_at IS NOT NULL THEN
    UPDATE public.custom_orders
    SET status = 'archived', updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      p_order_id,
      auth.uid(),
      'archived',
      jsonb_build_object('stars', p_stars)
    );
  ELSE
    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      p_order_id,
      auth.uid(),
      'party_archived',
      jsonb_build_object('stars', p_stars, 'rater_role', rater_role)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_buyer_reputation(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (
      SELECT COUNT(*)::int
      FROM public.custom_orders
      WHERE requester_id = p_user_id
        AND status IN ('completed', 'archived')
    ) < 5 THEN NULL
    ELSE (
      SELECT ROUND(AVG(r.stars))::int
      FROM public.custom_order_ratings r
      WHERE r.ratee_id = p_user_id
        AND r.rater_role = 'fulfiller'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_fulfiller_reputation(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (
      SELECT COUNT(*)::int
      FROM public.custom_orders
      WHERE assignee_id = p_user_id
        AND status IN ('completed', 'archived')
    ) < 5 THEN NULL
    ELSE (
      SELECT ROUND(AVG(r.stars))::int
      FROM public.custom_order_ratings r
      WHERE r.ratee_id = p_user_id
        AND r.rater_role = 'requester'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_reputations(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  buyer_completed_count int,
  buyer_rating_count int,
  buyer_reputation int,
  buyer_is_pending boolean,
  fulfiller_completed_count int,
  fulfiller_rating_count int,
  fulfiller_reputation int,
  fulfiller_is_pending boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH users AS (
    SELECT DISTINCT uid
    FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS uid
    WHERE uid IS NOT NULL
  ),
  buyer_completed AS (
    SELECT o.requester_id AS user_id, COUNT(*)::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.requester_id
    WHERE o.status IN ('completed', 'archived')
    GROUP BY o.requester_id
  ),
  fulfiller_completed AS (
    SELECT o.assignee_id AS user_id, COUNT(*)::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.assignee_id
    WHERE o.status IN ('completed', 'archived')
    GROUP BY o.assignee_id
  ),
  buyer_ratings AS (
    SELECT r.ratee_id AS user_id, COUNT(*)::int AS cnt, ROUND(AVG(r.stars))::int AS avg_stars
    FROM public.custom_order_ratings r
    INNER JOIN users u ON u.uid = r.ratee_id
    WHERE r.rater_role = 'fulfiller'
    GROUP BY r.ratee_id
  ),
  fulfiller_ratings AS (
    SELECT r.ratee_id AS user_id, COUNT(*)::int AS cnt, ROUND(AVG(r.stars))::int AS avg_stars
    FROM public.custom_order_ratings r
    INNER JOIN users u ON u.uid = r.ratee_id
    WHERE r.rater_role = 'requester'
    GROUP BY r.ratee_id
  )
  SELECT
    u.uid AS user_id,
    COALESCE(bc.cnt, 0) AS buyer_completed_count,
    COALESCE(br.cnt, 0) AS buyer_rating_count,
    CASE
      WHEN COALESCE(bc.cnt, 0) < 5 OR COALESCE(br.cnt, 0) < 1 THEN NULL
      ELSE br.avg_stars
    END AS buyer_reputation,
    (COALESCE(bc.cnt, 0) < 5 OR COALESCE(br.cnt, 0) < 1) AS buyer_is_pending,
    COALESCE(fc.cnt, 0) AS fulfiller_completed_count,
    COALESCE(fr.cnt, 0) AS fulfiller_rating_count,
    CASE
      WHEN COALESCE(fc.cnt, 0) < 5 OR COALESCE(fr.cnt, 0) < 1 THEN NULL
      ELSE fr.avg_stars
    END AS fulfiller_reputation,
    (COALESCE(fc.cnt, 0) < 5 OR COALESCE(fr.cnt, 0) < 1) AS fulfiller_is_pending
  FROM users u
  LEFT JOIN buyer_completed bc ON bc.user_id = u.uid
  LEFT JOIN fulfiller_completed fc ON fc.user_id = u.uid
  LEFT JOIN buyer_ratings br ON br.user_id = u.uid
  LEFT JOIN fulfiller_ratings fr ON fr.user_id = u.uid;
$$;

GRANT EXECUTE ON FUNCTION public.user_buyer_reputation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_fulfiller_reputation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_reputations(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.fulfill_custom_order(
  p_order_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.complete_order_craft(p_order_id, p_notes);
END;
$$;

-- blueprint_resources RLS (032 launch)
DROP POLICY IF EXISTS "blueprint_resources_preview_access_all" ON public.blueprint_resources;
CREATE POLICY "blueprint_resources_preview_access_all"
  ON public.blueprint_resources FOR ALL TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DROP POLICY IF EXISTS "custom_orders_super_admin_all" ON public.custom_orders;
CREATE POLICY "custom_orders_preview_access_all"
  ON public.custom_orders
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

-- site_settings

CREATE TABLE IF NOT EXISTS public.site_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dfp_display_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (id, dfp_display_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_settings_select_authenticated" ON public.site_settings;
CREATE POLICY "site_settings_select_authenticated"
  ON public.site_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "site_settings_update_super_admin" ON public.site_settings;
CREATE POLICY "site_settings_update_super_admin"
  ON public.site_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.update_site_dfp_display(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  INSERT INTO public.site_settings (id, dfp_display_enabled, updated_at)
  VALUES (1, p_enabled, now())
  ON CONFLICT (id) DO UPDATE
  SET dfp_display_enabled = EXCLUDED.dfp_display_enabled,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_site_dfp_display(boolean) TO authenticated;
