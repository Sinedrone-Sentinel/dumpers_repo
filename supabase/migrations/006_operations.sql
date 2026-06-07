-- Resource tracker, custom orders, and fulfillment
-- Super-admin only during preview; widen RLS when launching to members.
-- Run in Supabase SQL Editor

-- =============================================================================
-- Role helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role(), '') = 'super-admin';
$$;

-- =============================================================================
-- Org resource inventory
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.resource_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_key text NOT NULL UNIQUE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS resource_inventory_key_idx
  ON public.resource_inventory (resource_key);

ALTER TABLE public.resource_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_inventory_super_admin_all"
  ON public.resource_inventory
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =============================================================================
-- Custom orders
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.custom_order_status AS ENUM (
    'pending',
    'in_progress',
    'fulfilled',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.custom_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  status public.custom_order_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_orders_status_idx
  ON public.custom_orders (status);

CREATE INDEX IF NOT EXISTS custom_orders_requester_idx
  ON public.custom_orders (requester_id);

CREATE TABLE IF NOT EXISTS public.custom_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS custom_order_items_order_idx
  ON public.custom_order_items (order_id);

ALTER TABLE public.custom_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_orders_super_admin_all"
  ON public.custom_orders
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "custom_order_items_super_admin_all"
  ON public.custom_order_items
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =============================================================================
-- Fulfillments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  fulfilled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_fulfillments_order_idx
  ON public.order_fulfillments (order_id);

CREATE TABLE IF NOT EXISTS public.fulfillment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES public.order_fulfillments(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS fulfillment_items_fulfillment_idx
  ON public.fulfillment_items (fulfillment_id);

ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_fulfillments_super_admin_all"
  ON public.order_fulfillments
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "fulfillment_items_super_admin_all"
  ON public.fulfillment_items
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =============================================================================
-- Fulfill order RPC (atomic inventory deduction)
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
  caller_role text;
  order_row public.custom_orders%ROWTYPE;
  item_row record;
  stock_row public.resource_inventory%ROWTYPE;
  fulfillment_id uuid;
BEGIN
  caller_role := public.get_current_user_role();
  IF caller_role IS DISTINCT FROM 'super-admin' THEN
    RAISE EXCEPTION 'Permission denied: super-admin required';
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

GRANT EXECUTE ON FUNCTION public.fulfill_custom_order(uuid, text) TO authenticated;
