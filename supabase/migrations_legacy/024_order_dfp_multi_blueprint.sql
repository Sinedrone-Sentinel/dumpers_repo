-- Phase 4b: DFP pricing + multi-blueprint orders
-- Run in Supabase SQL Editor after 023_fulfillment_v2.sql

-- =============================================================================
-- Order total DFP (required aUEC price)
-- =============================================================================

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS total_dfp_auec bigint NOT NULL DEFAULT 0
    CHECK (total_dfp_auec >= 0);

-- =============================================================================
-- Multiple blueprints per order
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.custom_order_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  blueprint_id text NOT NULL,
  blueprint_title text,
  min_quality int NOT NULL DEFAULT 500
    CHECK (min_quality >= 0 AND min_quality <= 1000),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_dfp_auec bigint NOT NULL DEFAULT 0 CHECK (unit_dfp_auec >= 0),
  line_dfp_auec bigint NOT NULL DEFAULT 0 CHECK (line_dfp_auec >= 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_order_blueprints_order_idx
  ON public.custom_order_blueprints (order_id, sort_order);

ALTER TABLE public.custom_order_blueprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_order_blueprints_preview_access_all" ON public.custom_order_blueprints;
CREATE POLICY "custom_order_blueprints_preview_access_all"
  ON public.custom_order_blueprints
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

-- Backfill legacy single-blueprint orders
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
SELECT
  o.id,
  o.blueprint_id,
  o.title,
  o.min_quality,
  o.quantity,
  0,
  0,
  0
FROM public.custom_orders o
WHERE o.blueprint_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.custom_order_blueprints cob
    WHERE cob.order_id = o.id
  );

-- =============================================================================
-- Accept: all blueprints + notify assignee of required DFP price
-- =============================================================================

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
  item_row record;
  bp_row record;
  stock_qty numeric;
  assignee_name text;
  site_org_id uuid;
  price_label text;
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

-- =============================================================================
-- Fulfillment completion: carry DFP through ready-for-pickup notification
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

  price_label := public.format_dfp_auec(order_row.total_dfp_auec);

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'resources_deducted',
    jsonb_build_object(
      'fulfillment_id', fulfillment_id,
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  SELECT COALESCE(rsi_handle, display_name, email, 'Your fulfiller')
  INTO fulfiller_name
  FROM public.profiles
  WHERE id = auth.uid();

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_ready',
    'Ready for pickup',
    fulfiller_name || ' finished crafting: ' || order_row.title || ' · ' || price_label,
    jsonb_build_object(
      'order_id', p_order_id,
      'fulfillment_id', fulfillment_id,
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  RETURN fulfillment_id;
END;
$$;
