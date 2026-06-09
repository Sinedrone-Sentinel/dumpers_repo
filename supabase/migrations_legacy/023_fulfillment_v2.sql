-- Phase 5: Fulfillment v2 — BP + personal resource gate on accept, staged deduct, pickup flow
-- Run in Supabase SQL Editor after 022_blueprint_orders_notifications.sql

-- =============================================================================
-- Who may accept / fulfill orders (preview OR fulfillment_enabled OR officer+)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_fulfill_orders()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_preview_features()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.fulfillment_enabled
          OR p.role IN ('officer', 'super-admin')
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_fulfill_orders() TO authenticated;

-- =============================================================================
-- Accept: blueprint ownership + personal resource gate
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  item_row record;
  stock_qty numeric;
  assignee_name text;
  site_org_id uuid;
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

  IF order_row.blueprint_id IS NOT NULL THEN
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
    SELECT quantity INTO stock_qty
    FROM public.personal_resource_inventory
    WHERE user_id = auth.uid()
      AND resource_key = item_row.resource_key;

    IF stock_qty IS NULL OR stock_qty < item_row.quantity THEN
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

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'accepted',
    jsonb_build_object('assignee_id', auth.uid(), 'org_id', site_org_id)
  );

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_accepted',
    'Order accepted',
    assignee_name || ' accepted your order: ' || order_row.title,
    jsonb_build_object('order_id', p_order_id, 'assignee_id', auth.uid())
  );
END;
$$;

-- =============================================================================
-- Assignee starts work
-- =============================================================================

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

-- =============================================================================
-- Complete craft: deduct personal resources, mark ready for pickup
-- =============================================================================

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
    SELECT quantity INTO stock_qty
    FROM public.personal_resource_inventory
    WHERE user_id = auth.uid()
      AND resource_key = item_row.resource_key
    FOR UPDATE;

    IF stock_qty IS NULL OR stock_qty < item_row.quantity THEN
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
    UPDATE public.personal_resource_inventory
    SET
      quantity = quantity - item_row.quantity,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE user_id = auth.uid()
      AND resource_key = item_row.resource_key;

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

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_ready',
    'Ready for pickup',
    fulfiller_name || ' finished crafting: ' || order_row.title,
    jsonb_build_object('order_id', p_order_id, 'fulfillment_id', fulfillment_id)
  );

  RETURN fulfillment_id;
END;
$$;

-- =============================================================================
-- Requester confirms pickup
-- =============================================================================

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

-- Back-compat: fulfill_custom_order delegates to complete_order_craft
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

GRANT EXECUTE ON FUNCTION public.start_custom_order_work(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_craft(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_pickup(uuid) TO authenticated;
