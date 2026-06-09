-- Phase 2: manual org verification + default org membership on approve
-- Run in Supabase SQL Editor after 011_target_bp_list.sql

CREATE OR REPLACE FUNCTION public.is_officer_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role(), '') IN ('officer', 'super-admin');
$$;

CREATE OR REPLACE FUNCTION public.get_default_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.organizations WHERE slug = 'dumpers' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_org_membership(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seed_org_id uuid;
BEGIN
  IF NOT public.is_officer_or_above() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  seed_org_id := public.get_default_org_id();
  IF seed_org_id IS NULL THEN
    RAISE EXCEPTION 'Default organization not found';
  END IF;

  UPDATE public.profiles
  SET org_id = seed_org_id
  WHERE id = p_user_id
    AND org_id IS NULL;

  INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at)
  VALUES (seed_org_id, p_user_id, 'member', now())
  ON CONFLICT (org_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_org_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_org_id uuid;
BEGIN
  IF NOT public.is_officer_or_above() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT org_id INTO target_org_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  UPDATE public.org_memberships
  SET verified_at = now(),
      verified_by = auth.uid()
  WHERE org_id = target_org_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org membership not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_org_verification(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_org_id uuid;
BEGIN
  IF NOT public.is_officer_or_above() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT org_id INTO target_org_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  UPDATE public.org_memberships
  SET verified_at = NULL,
      verified_by = NULL
  WHERE org_id = target_org_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org membership not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_default_org_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_org_verification(uuid) TO authenticated;
