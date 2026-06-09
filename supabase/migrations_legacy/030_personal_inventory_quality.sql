-- Personal inventory: one row per (user, resource, quality tier)

ALTER TABLE public.personal_resource_inventory
  ADD COLUMN IF NOT EXISTS quality int;

UPDATE public.personal_resource_inventory
SET quality = 500
WHERE quality IS NULL;

ALTER TABLE public.personal_resource_inventory
  ALTER COLUMN quality SET NOT NULL,
  ALTER COLUMN quality SET DEFAULT 500;

ALTER TABLE public.personal_resource_inventory
  DROP CONSTRAINT IF EXISTS personal_resource_inventory_user_id_resource_key_key;

ALTER TABLE public.personal_resource_inventory
  ADD CONSTRAINT personal_resource_inventory_user_resource_quality_key
    UNIQUE (user_id, resource_key, quality);

ALTER TABLE public.personal_resource_inventory
  DROP CONSTRAINT IF EXISTS personal_resource_inventory_quality_check;

ALTER TABLE public.personal_resource_inventory
  ADD CONSTRAINT personal_resource_inventory_quality_check
    CHECK (quality >= 500 AND quality <= 1000);

CREATE OR REPLACE FUNCTION public.personal_resource_stock_total(
  p_user_id uuid,
  p_resource_key text
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
    AND resource_key = p_resource_key;
$$;

CREATE OR REPLACE FUNCTION public.deduct_personal_resource_stock(
  p_user_id uuid,
  p_resource_key text,
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
      AND quantity > 0
    ORDER BY quality ASC
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
    RAISE EXCEPTION 'Insufficient personal stock for %', p_resource_key;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.personal_resource_stock_total(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_personal_resource_stock(uuid, text, numeric) TO authenticated;

-- Accept: total stock across quality tiers
CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  item_row record;
  bp_row record;
  stock_qty numeric;
  assignee_name text;
  site_org_id uuid;
  price_label text;
  fulfiller_rep int;
  fulfiller_completed int;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  site_org_id := public.get_site_org_id();

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
      'org_id', site_org_id,
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

-- Complete craft: deduct lowest quality tiers first
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
    RAISE EXCEPTION 'Only the assigned fulfiller can complete this order';
  END IF;

  IF order_row.status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'Order cannot be completed in status %', order_row.status;
  END IF;

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

  INSERT INTO public.order_fulfillments (order_id, fulfilled_by, notes)
  VALUES (p_order_id, auth.uid(), p_notes)
  RETURNING id INTO fulfillment_id;

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

  UPDATE public.custom_orders
  SET status = 'ready_for_pickup', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'resources_deducted',
    jsonb_build_object('fulfillment_id', fulfillment_id)
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
