-- Feature Preview access (super-admin always; officers opt-in via Settings)
-- Run in Supabase SQL Editor after 007_blueprint_resources.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preview_features_enabled boolean NOT NULL DEFAULT false;

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

-- =============================================================================
-- Widen preview table RLS: super-admin OR officer with toggle ON
-- =============================================================================

DROP POLICY IF EXISTS "resource_inventory_super_admin_all" ON public.resource_inventory;
CREATE POLICY "resource_inventory_preview_access_all"
  ON public.resource_inventory
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DROP POLICY IF EXISTS "custom_orders_super_admin_all" ON public.custom_orders;
CREATE POLICY "custom_orders_preview_access_all"
  ON public.custom_orders
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DROP POLICY IF EXISTS "custom_order_items_super_admin_all" ON public.custom_order_items;
CREATE POLICY "custom_order_items_preview_access_all"
  ON public.custom_order_items
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DROP POLICY IF EXISTS "order_fulfillments_super_admin_all" ON public.order_fulfillments;
CREATE POLICY "order_fulfillments_preview_access_all"
  ON public.order_fulfillments
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DROP POLICY IF EXISTS "fulfillment_items_super_admin_all" ON public.fulfillment_items;
CREATE POLICY "fulfillment_items_preview_access_all"
  ON public.fulfillment_items
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DROP POLICY IF EXISTS "blueprint_resources_super_admin_all" ON public.blueprint_resources;
CREATE POLICY "blueprint_resources_preview_access_all"
  ON public.blueprint_resources
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

-- =============================================================================
-- Fulfill RPC — preview access (not super-admin only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fulfill_custom_order(
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
  stock_row public.resource_inventory%ROWTYPE;
  fulfillment_id uuid;
BEGIN
  IF NOT public.can_access_preview_features() THEN
    RAISE EXCEPTION 'Permission denied: preview access required';
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
    SELECT * INTO stock_row
    FROM public.resource_inventory
    WHERE resource_key = item_row.resource_key
    FOR UPDATE;

    IF NOT FOUND OR stock_row.quantity < item_row.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %', item_row.resource_key;
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
    UPDATE public.resource_inventory
    SET
      quantity = quantity - item_row.quantity,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE resource_key = item_row.resource_key;

    INSERT INTO public.fulfillment_items (fulfillment_id, resource_key, quantity)
    VALUES (fulfillment_id, item_row.resource_key, item_row.quantity);
  END LOOP;

  UPDATE public.custom_orders
  SET status = 'fulfilled', updated_at = now()
  WHERE id = p_order_id;

  RETURN fulfillment_id;
END;
$$;
