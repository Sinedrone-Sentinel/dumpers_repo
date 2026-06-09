-- Single-org-per-deployment: remove multi-org / Dumpers-specific behavior
-- Run in Supabase SQL Editor after 020_org_context_rpc.sql

-- =============================================================================
-- Site org helpers (one organizations row per deployment)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_site_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.organizations ORDER BY created_at NULLS LAST, id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_site_org()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug
  )
  FROM public.organizations o
  ORDER BY o.created_at NULLS LAST, o.id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_org() TO authenticated;

-- Back-compat for inventory/fulfillment RPCs that still call get_default_org_id()
CREATE OR REPLACE FUNCTION public.get_default_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_site_org_id();
$$;

-- =============================================================================
-- Signup: attach new users to the site org (no Dumpers slug logic)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  site_org_id uuid;
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

  site_org_id := public.get_site_org_id();

  INSERT INTO public.profiles (id, email, display_name, avatar_url, role, org_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'pending',
    site_org_id
  );

  IF site_org_id IS NOT NULL THEN
    INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at, verified_at)
    VALUES (site_org_id, NEW.id, 'member', now(), now())
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- Visibility: approved members only; personal stock = opt-in per user
-- =============================================================================

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
      WHERE viewer.id = auth.uid()
        AND COALESCE(viewer.role, 'pending') <> 'pending'
        AND COALESCE(target.role, 'pending') <> 'pending'
        AND target.share_personal_resources = true
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_org_inventory(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR COALESCE(public.get_current_user_role(), 'pending') <> 'pending';
$$;

COMMENT ON COLUMN public.profiles.share_personal_resources IS
  'When true, other approved members may read this user''s personal resource inventory.';

-- =============================================================================
-- Drop multi-org RPCs and helpers
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_my_org_context();
DROP FUNCTION IF EXISTS public.ensure_dumpers_membership();
DROP FUNCTION IF EXISTS public.join_dumpers_organization();
DROP FUNCTION IF EXISTS public.join_organization(uuid);
DROP FUNCTION IF EXISTS public.search_joinable_organizations(text);
DROP FUNCTION IF EXISTS public.set_org_resources_public(boolean);

-- =============================================================================
-- Backfill: existing users without org_id get site org
-- =============================================================================

UPDATE public.profiles p
SET org_id = public.get_site_org_id()
WHERE p.org_id IS NULL
  AND public.get_site_org_id() IS NOT NULL;

INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at, verified_at)
SELECT p.org_id, p.id, 'member', COALESCE(p.approved_at, p.created_at, now()), now()
FROM public.profiles p
WHERE p.org_id IS NOT NULL
ON CONFLICT (org_id, user_id) DO NOTHING;
