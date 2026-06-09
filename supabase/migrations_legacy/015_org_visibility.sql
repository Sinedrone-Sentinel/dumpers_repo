-- Phase 3c: org join picker, verification-gated org stock, org resource visibility
-- Run in Supabase SQL Editor after 014_fulfill_org_inventory.sql

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS resources_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS joinable boolean NOT NULL DEFAULT true;

UPDATE public.organizations
SET resources_public = true,
    joinable = true
WHERE slug = 'dumpers';

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_dumpers_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_org_id AND o.slug = 'dumpers'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_verified_org_member(
  p_org_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
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
      AND m.user_id = p_user_id
      AND m.verified_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_org_inventory(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_verified_org_member(p_org_id, auth.uid())
    OR public.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.can_view_personal_resources(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_target_user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles viewer
      JOIN public.profiles target ON target.id = p_target_user_id
      JOIN public.organizations o ON o.id = target.org_id
      WHERE viewer.id = auth.uid()
        AND viewer.org_id IS NOT NULL
        AND viewer.org_id = target.org_id
        AND o.resources_public = true
        AND public.is_verified_org_member(viewer.org_id, auth.uid())
        AND public.is_verified_org_member(target.org_id, p_target_user_id)
    );
$$;

-- =============================================================================
-- Organizations: searchable join list for approved members
-- =============================================================================

DROP POLICY IF EXISTS "organizations_read_joinable" ON public.organizations;
CREATE POLICY "organizations_read_joinable"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    joinable = true
    OR EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = organizations.id
        AND m.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

-- =============================================================================
-- Inventory RLS: verification + org visibility
-- =============================================================================

DROP POLICY IF EXISTS "personal_inventory_own_all" ON public.personal_resource_inventory;
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

DROP POLICY IF EXISTS "org_inventory_read_members" ON public.org_resource_inventory;
CREATE POLICY "org_inventory_read_verified"
  ON public.org_resource_inventory
  FOR SELECT
  TO authenticated
  USING (public.can_view_org_inventory(org_id));

-- =============================================================================
-- Join org + privacy settings
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_joinable_organizations(p_query text DEFAULT '')
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  resources_public boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, o.resources_public
  FROM public.organizations o
  WHERE o.joinable = true
    AND (
      p_query IS NULL
      OR btrim(p_query) = ''
      OR o.name ILIKE '%' || btrim(p_query) || '%'
      OR o.slug ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY
    CASE WHEN o.slug = 'dumpers' THEN 0 ELSE 1 END,
    o.name;
$$;

CREATE OR REPLACE FUNCTION public.join_organization(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.get_current_user_role(), 'pending') = 'pending' THEN
    RAISE EXCEPTION 'Account must be approved before joining an organization';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND org_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Leave your current organization before joining another';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND joinable = true
  ) THEN
    RAISE EXCEPTION 'Organization is not available to join';
  END IF;

  UPDATE public.profiles
  SET org_id = p_org_id
  WHERE id = auth.uid();

  INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at)
  VALUES (p_org_id, auth.uid(), 'member', now())
  ON CONFLICT (org_id, user_id) DO UPDATE
  SET org_role = EXCLUDED.org_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_dumpers_organization()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dumpers_id uuid;
BEGIN
  dumpers_id := public.get_default_org_id();
  IF dumpers_id IS NULL THEN
    RAISE EXCEPTION 'Dumpers organization not found';
  END IF;

  PERFORM public.join_organization(dumpers_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_resources_public(p_public boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_org_id uuid;
BEGIN
  SELECT org_id INTO user_org_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF user_org_id IS NULL THEN
    RAISE EXCEPTION 'You are not in an organization';
  END IF;

  IF public.is_dumpers_org(user_org_id) THEN
    RAISE EXCEPTION 'Dumpers Repo inventory is always public';
  END IF;

  IF NOT (
    public.get_current_org_role(user_org_id) IN ('owner', 'admin')
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Only org owners or admins can change resource visibility';
  END IF;

  UPDATE public.organizations
  SET resources_public = p_public
  WHERE id = user_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_dumpers_privatize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug = 'dumpers' OR OLD.slug = 'dumpers' THEN
    NEW.resources_public := true;
    NEW.joinable := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_dumpers_always_public ON public.organizations;
CREATE TRIGGER organizations_dumpers_always_public
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_dumpers_privatize();

GRANT EXECUTE ON FUNCTION public.search_joinable_organizations(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_dumpers_organization() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_org_resources_public(boolean) TO authenticated;
