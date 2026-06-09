-- Phase 3: split personal vs org resource inventory
-- Run in Supabase SQL Editor after 012_org_verification.sql

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.personal_resource_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  resource_key text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (user_id, resource_key)
);

CREATE INDEX IF NOT EXISTS personal_resource_inventory_user_idx
  ON public.personal_resource_inventory (user_id);

CREATE TABLE IF NOT EXISTS public.org_resource_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (org_id, resource_key)
);

CREATE INDEX IF NOT EXISTS org_resource_inventory_org_idx
  ON public.org_resource_inventory (org_id);

-- =============================================================================
-- Migrate legacy org-wide stock into Dumpers org inventory
-- =============================================================================

INSERT INTO public.org_resource_inventory (org_id, resource_key, quantity, updated_at, updated_by)
SELECT
  public.get_default_org_id(),
  ri.resource_key,
  ri.quantity,
  ri.updated_at,
  ri.updated_by
FROM public.resource_inventory ri
WHERE public.get_default_org_id() IS NOT NULL
ON CONFLICT (org_id, resource_key) DO UPDATE
SET
  quantity = EXCLUDED.quantity,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_org_inventory(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_officer_or_above()
    OR COALESCE(public.get_current_org_role(p_org_id), 'member')
      IN ('owner', 'admin', 'officer');
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_memberships m
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
  )
    OR public.is_super_admin();
$$;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.personal_resource_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_resource_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_inventory_own_all" ON public.personal_resource_inventory;
CREATE POLICY "personal_inventory_own_all"
  ON public.personal_resource_inventory
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "org_inventory_read_members" ON public.org_resource_inventory;
CREATE POLICY "org_inventory_read_members"
  ON public.org_resource_inventory
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "org_inventory_write_managers" ON public.org_resource_inventory;
CREATE POLICY "org_inventory_write_managers"
  ON public.org_resource_inventory
  FOR ALL
  TO authenticated
  USING (public.can_manage_org_inventory(org_id))
  WITH CHECK (public.can_manage_org_inventory(org_id));

-- Fulfill RPC update is in 014_fulfill_org_inventory.sql (run that next).
