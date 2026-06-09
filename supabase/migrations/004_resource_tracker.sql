-- 004 resource tracker (personal inventory + site total)

CREATE TABLE IF NOT EXISTS public.personal_resource_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  quality int NOT NULL DEFAULT 500 CHECK (quality >= 0 AND quality <= 1000),
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (user_id, resource_key, quality)
);

CREATE INDEX IF NOT EXISTS personal_resource_inventory_user_idx
  ON public.personal_resource_inventory (user_id);

ALTER TABLE public.personal_resource_inventory ENABLE ROW LEVEL SECURITY;

-- Launch preview features to all approved members; expand quality range; add salvage resources.

CREATE OR REPLACE FUNCTION public.can_access_preview_features()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role(), 'pending') <> 'pending';
$$;

ALTER TABLE public.personal_resource_inventory
  DROP CONSTRAINT IF EXISTS personal_resource_inventory_quality_check;

ALTER TABLE public.personal_resource_inventory
  ADD CONSTRAINT personal_resource_inventory_quality_check
    CHECK (quality >= 0 AND quality <= 1000);

INSERT INTO public.blueprint_resources (resource_key, label, is_active)
VALUES
  ('rmc', 'RMC (Recycled Material Composite)', true),
  ('construction_material', 'Construction Material', true)
ON CONFLICT (resource_key) DO UPDATE
SET
  label = EXCLUDED.label,
  is_active = true,
  synced_at = now();

CREATE OR REPLACE FUNCTION public.can_view_personal_resources(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_target_user_id = auth.uid()
    OR public.is_super_admin();
$$;

-- =============================================================================
-- Signup: no org attachment
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.banned_users WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'This account has been banned';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.banned_users
    WHERE email IS NOT NULL AND email = NEW.email
  ) THEN
    RAISE EXCEPTION 'This email has been banned';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'pending'
  );

  RETURN NEW;
END;
$$;

-- =============================================================================
-- Accept order: no org_id in audit trail
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  bp_row record;
  assignee_name text;
  price_label text;
  fulfiller_rep int;
  fulfiller_completed int;
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
-- Drop org FK columns before dropping org tables
-- =============================================================================

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS org_id,
  DROP COLUMN IF EXISTS org_only_mode,
  DROP COLUMN IF EXISTS share_personal_resources,
  DROP COLUMN IF EXISTS fulfillment_enabled;

ALTER TABLE public.personal_resource_inventory
  DROP COLUMN IF EXISTS org_id;

-- =============================================================================
-- Drop deprecated inventory and org tables
-- =============================================================================

DROP TABLE IF EXISTS public.org_resource_inventory CASCADE;
DROP TABLE IF EXISTS public.resource_inventory CASCADE;
DROP TABLE IF EXISTS public.org_ownership_transfers CASCADE;
DROP TABLE IF EXISTS public.org_memberships CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

-- =============================================================================
-- Drop org RPCs
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_site_org_id();
DROP FUNCTION IF EXISTS public.get_site_org();
DROP FUNCTION IF EXISTS public.get_default_org_id();
DROP FUNCTION IF EXISTS public.can_view_org_inventory(uuid);
DROP FUNCTION IF EXISTS public.can_manage_org_inventory(uuid);
DROP FUNCTION IF EXISTS public.is_org_member(uuid);
DROP FUNCTION IF EXISTS public.get_current_org_role(uuid);
DROP FUNCTION IF EXISTS public.get_org_role(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_verified_org_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_verified_org_member(uuid);
DROP FUNCTION IF EXISTS public.is_dumpers_org(uuid);
DROP FUNCTION IF EXISTS public.assign_dumpers_org_membership(uuid);
DROP FUNCTION IF EXISTS public.ensure_default_org_membership(uuid);
DROP FUNCTION IF EXISTS public.verify_org_member(uuid);
DROP FUNCTION IF EXISTS public.revoke_org_verification(uuid);
DROP FUNCTION IF EXISTS public.join_organization(uuid);
DROP FUNCTION IF EXISTS public.join_dumpers_organization();
DROP FUNCTION IF EXISTS public.search_joinable_organizations(text);
DROP FUNCTION IF EXISTS public.get_my_org_context();
DROP FUNCTION IF EXISTS public.ensure_dumpers_membership();
DROP FUNCTION IF EXISTS public.set_org_resources_public(boolean);

-- =============================================================================
-- Personal inventory RLS (unchanged semantics: self + super-admin read)
-- =============================================================================

DROP POLICY IF EXISTS "personal_inventory_select" ON public.personal_resource_inventory;
DROP POLICY IF EXISTS "personal_inventory_write_own" ON public.personal_resource_inventory;

CREATE POLICY "personal_inventory_select"
  ON public.personal_resource_inventory
  FOR SELECT
  TO authenticated
  USING (public.can_view_personal_resources(user_id));

CREATE POLICY "personal_inventory_write_own"
  ON public.personal_resource_inventory
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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

-- Site Total: read-only aggregate of approved members' personal_resource_inventory

CREATE OR REPLACE FUNCTION public.get_site_total_inventory()
RETURNS TABLE (
  resource_key text,
  quantity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.get_current_user_role(), 'pending') = 'pending' THEN
    RAISE EXCEPTION 'Approved membership required to view site totals';
  END IF;

  RETURN QUERY
  SELECT
    pri.resource_key,
    ROUND(SUM(pri.quantity)::numeric, 3) AS quantity
  FROM public.personal_resource_inventory pri
  INNER JOIN public.profiles p ON p.id = pri.user_id
  WHERE COALESCE(p.role, 'pending') <> 'pending'
    AND COALESCE(p.ghost_mode, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_users b WHERE b.id = p.id
    )
    AND pri.quantity > 0
  GROUP BY pri.resource_key
  HAVING SUM(pri.quantity) > 0
  ORDER BY pri.resource_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_total_inventory() TO authenticated;

COMMENT ON FUNCTION public.get_site_total_inventory() IS
  'Sum of personal_resource_inventory across approved, non-ghost, non-banned members. Read-only site-wide rollup for Resource Tracker.';

DROP FUNCTION IF EXISTS public.get_org_total_inventory();

-- Super-admin one-time wipe of all personal resource stock

CREATE OR REPLACE FUNCTION public.admin_wipe_resource_tracker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  DELETE FROM public.personal_resource_inventory
  WHERE true;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_wipe_resource_tracker() TO authenticated;

COMMENT ON FUNCTION public.admin_wipe_resource_tracker() IS
  'Deletes all rows from personal_resource_inventory. Super-admin only.';

-- Supabase safe-update blocks DELETE without WHERE; use WHERE true for full wipe.

CREATE OR REPLACE FUNCTION public.admin_wipe_resource_tracker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  DELETE FROM public.personal_resource_inventory
  WHERE true;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
