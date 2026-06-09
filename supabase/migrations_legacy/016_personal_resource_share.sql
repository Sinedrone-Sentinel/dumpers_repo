-- Per-member opt-in: share personal stock with verified org mates (private orgs)
-- Run in Supabase SQL Editor after 015_org_visibility.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_personal_resources boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.share_personal_resources IS
  'When true, verified members of the same org can read this user''s personal resource inventory.';

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
        AND public.is_verified_org_member(viewer.org_id, auth.uid())
        AND public.is_verified_org_member(target.org_id, p_target_user_id)
        AND (
          public.is_dumpers_org(target.org_id)
          OR target.share_personal_resources = true
        )
    );
$$;
