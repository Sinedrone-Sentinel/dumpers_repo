-- Clarify visibility: personal stock is SAME-ORG only; resources_public = cross-org ORG stock
-- Run in Supabase SQL Editor after 016_personal_resource_share.sql

COMMENT ON COLUMN public.organizations.resources_public IS
  'When true, verified site members from other orgs may read this org''s shared stock (org_resource_inventory). Never exposes personal inventories.';

COMMENT ON COLUMN public.profiles.share_personal_resources IS
  'When true, other verified members of the SAME org may read this user''s personal resource inventory.';

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
        AND target.org_id IS NOT NULL
        AND viewer.org_id = target.org_id
        AND public.is_verified_org_member(viewer.org_id, auth.uid())
        AND public.is_verified_org_member(target.org_id, p_target_user_id)
        AND (
          public.is_dumpers_org(target.org_id)
          OR target.share_personal_resources = true
        )
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
    OR public.is_verified_org_member(p_org_id, auth.uid())
    OR (
      COALESCE(public.get_current_user_role(), 'pending') <> 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.organizations o
        WHERE o.id = p_org_id
          AND o.resources_public = true
      )
    );
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

  IF public.is_dumpers_org(user_org_id) AND p_public = false THEN
    RAISE EXCEPTION 'Dumpers Repo org stock is always public';
  END IF;

  IF NOT (
    public.get_current_org_role(user_org_id) IN ('owner', 'admin')
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Only org owners or admins can change org stock visibility';
  END IF;

  UPDATE public.organizations
  SET resources_public = p_public
  WHERE id = user_org_id;
END;
$$;
