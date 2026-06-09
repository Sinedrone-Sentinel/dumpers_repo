-- Phase 3b: point fulfill_custom_order at org_resource_inventory
-- Run in Supabase SQL Editor after 013_resource_inventory_v2.sql

CREATE OR REPLACE FUNCTION public.fulfill_custom_order(
  p_order_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fulfill_custom_order$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  item_row record;
  stock_qty numeric;
  fulfillment_id uuid;
  target_org_id uuid;
BEGIN
  IF NOT public.can_access_preview_features() THEN
    RAISE EXCEPTION 'Permission denied: preview access required';
  END IF;

  target_org_id := public.get_default_org_id();
  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'Default organization not found';
  END IF;

  IF NOT public.can_manage_org_inventory(target_org_id) THEN
    RAISE EXCEPTION 'Permission denied: cannot manage org inventory';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Order cannot be fulfilled in status %', order_row.status;
  END IF;

  FOR item_row IN
    SELECT resource_key, quantity
    FROM public.custom_order_items
    WHERE order_id = p_order_id
  LOOP
    SELECT quantity INTO stock_qty
    FROM public.org_resource_inventory
    WHERE org_id = target_org_id
      AND resource_key = item_row.resource_key
    FOR UPDATE;

    IF stock_qty IS NULL OR stock_qty < item_row.quantity THEN
      RAISE EXCEPTION 'Insufficient org stock for %', item_row.resource_key;
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
    UPDATE public.org_resource_inventory
    SET
      quantity = quantity - item_row.quantity,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE org_id = target_org_id
      AND resource_key = item_row.resource_key;

    INSERT INTO public.fulfillment_items (fulfillment_id, resource_key, quantity)
    VALUES (fulfillment_id, item_row.resource_key, item_row.quantity);
  END LOOP;

  UPDATE public.custom_orders
  SET status = 'fulfilled', updated_at = now()
  WHERE id = p_order_id;

  RETURN fulfillment_id;
END;
$fulfill_custom_order$;

GRANT EXECUTE ON FUNCTION public.fulfill_custom_order(uuid, text) TO authenticated;
