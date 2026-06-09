-- 005 custom orders schema

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

CREATE TABLE IF NOT EXISTS public.-- =============================================================================
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


GRANT EXECUTE ON FUNCTION public.fulfill_custom_order(uuid, text) TO authenticated;
-- Extend order status enum
-- =============================================================================

DO $$ BEGIN
  ALTER TYPE public.custom_order_status ADD VALUE IF NOT EXISTS 'accepted';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.custom_order_status ADD VALUE IF NOT EXISTS 'ready_for_pickup';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.custom_order_status ADD VALUE IF NOT EXISTS 'completed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Blueprint fields on custom_orders
-- =============================================================================

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS blueprint_id text,
  ADD COLUMN IF NOT EXISTS min_quality int NOT NULL DEFAULT 500
    CHECK (min_quality >= 0 AND min_quality <= 1000),
  ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

CREATE INDEX IF NOT EXISTS custom_orders_blueprint_idx
  ON public.custom_orders (blueprint_id)
  WHERE blueprint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS custom_orders_assignee_idx
  ON public.custom_orders (assignee_id)
  WHERE assignee_id IS NOT NULL;

-- =============================================================================
-- Order audit trail
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_idx
  ON public.order_events (order_id, created_at DESC);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_events_preview_read" ON public.order_events;
CREATE POLICY "order_events_preview_read"
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

-- =============================================================================
-- In-app notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx
  ON public.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON public.user_notifications (user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notifications_read_own" ON public.user_notifications;
CREATE POLICY "user_notifications_read_own"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_notifications_update_own" ON public.user_notifications;
CREATE POLICY "user_notifications_update_own"
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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

CREATE TABLE IF NOT EXISTS public.custom_order_resource_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  resource_label text NOT NULL,
  min_quality int NOT NULL DEFAULT 500
    CHECK (min_quality >= 0 AND min_quality <= 1000),
  quantity_scu numeric(12, 3) NOT NULL CHECK (quantity_scu > 0),
  unit_dfp_auec bigint NOT NULL DEFAULT 0 CHECK (unit_dfp_auec >= 0),
  line_dfp_auec bigint NOT NULL DEFAULT 0 CHECK (line_dfp_auec >= 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_order_resource_lines_order_idx
  ON public.custom_order_resource_lines (order_id, sort_order);

ALTER TABLE public.custom_order_resource_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_order_resource_lines_preview_all" ON public.custom_order_resource_lines;
CREATE POLICY "custom_order_resource_lines_preview_all"
  ON public.custom_order_resource_lines
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DO $$ BEGIN
  ALTER TYPE public.custom_order_status ADD VALUE IF NOT EXISTS 'archived';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS requester_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfiller_archived_at timestamptz;

CREATE TABLE IF NOT EXISTS public.custom_order_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rater_role text NOT NULL CHECK (rater_role IN ('requester', 'fulfiller')),
  stars smallint NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rater_id)
);

CREATE INDEX IF NOT EXISTS custom_order_ratings_order_idx
  ON public.custom_order_ratings (order_id);

CREATE INDEX IF NOT EXISTS custom_order_ratings_ratee_idx
  ON public.custom_order_ratings (ratee_id);

ALTER TABLE public.custom_order_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_order_ratings_preview_all" ON public.custom_order_ratings;
CREATE POLICY "custom_order_ratings_preview_all"
  ON public.custom_order_ratings
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS min_fulfiller_reputation smallint
    CHECK (min_fulfiller_reputation IS NULL OR (min_fulfiller_reputation >= 1 AND min_fulfiller_reputation <= 5));
