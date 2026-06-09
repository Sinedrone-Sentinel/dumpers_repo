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
