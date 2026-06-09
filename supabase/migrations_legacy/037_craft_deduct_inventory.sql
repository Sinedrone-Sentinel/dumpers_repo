-- Opt-in: deduct My Resources stock when completing a fulfillment craft.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS craft_deduct_inventory boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.craft_deduct_inventory IS
  'When true, complete_order_craft requires sufficient personal stock and deducts materials. Off by default.';

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
