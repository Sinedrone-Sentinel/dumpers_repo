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
