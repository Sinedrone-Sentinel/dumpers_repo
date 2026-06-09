-- Default org: every user starts in Dumpers (verified, public org stock)
-- Run in Supabase SQL Editor after 017_inventory_visibility_rules.sql

-- =============================================================================
-- Ensure Dumpers org exists and stays public + joinable
-- =============================================================================

INSERT INTO public.organizations (name, slug, resources_public, joinable)
SELECT 'Dumpers', 'dumpers', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations WHERE slug = 'dumpers'
);

UPDATE public.organizations
SET
  name = 'Dumpers',
  resources_public = true,
  joinable = true
WHERE slug = 'dumpers';

-- =============================================================================
-- Assign Dumpers membership (auto-verified for default org)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assign_dumpers_org_membership(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dumpers_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
    AND auth.uid() IS DISTINCT FROM p_user_id
    AND NOT public.is_officer_or_above()
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  dumpers_id := public.get_default_org_id();
  IF dumpers_id IS NULL THEN
    RAISE EXCEPTION 'Dumpers organization not found';
  END IF;

  UPDATE public.profiles
  SET org_id = dumpers_id
  WHERE id = p_user_id
    AND org_id IS NULL;

  INSERT INTO public.org_memberships (
    org_id,
    user_id,
    org_role,
    joined_at,
    verified_at
  )
  VALUES (dumpers_id, p_user_id, 'member', now(), now())
  ON CONFLICT (org_id, user_id) DO UPDATE
  SET verified_at = COALESCE(public.org_memberships.verified_at, now());

  UPDATE public.org_memberships
  SET verified_at = now()
  WHERE org_id = dumpers_id
    AND user_id = p_user_id
    AND verified_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_dumpers_membership()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assign_dumpers_org_membership(auth.uid());
END;
$$;

-- Officer helper used by admin flows — same as assign for Dumpers default org
CREATE OR REPLACE FUNCTION public.ensure_default_org_membership(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_officer_or_above() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.assign_dumpers_org_membership(p_user_id);
END;
$$;

-- =============================================================================
-- Signup: assign Dumpers immediately (including pending accounts)
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

  PERFORM public.assign_dumpers_org_membership(NEW.id);

  RETURN NEW;
END;
$$;

-- =============================================================================
-- Join flows: Dumpers members are auto-verified
-- =============================================================================

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

  INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at, verified_at)
  VALUES (
    p_org_id,
    auth.uid(),
    'member',
    now(),
    CASE WHEN public.is_dumpers_org(p_org_id) THEN now() ELSE NULL END
  )
  ON CONFLICT (org_id, user_id) DO UPDATE
  SET
    org_role = EXCLUDED.org_role,
    verified_at = CASE
      WHEN public.is_dumpers_org(p_org_id) THEN COALESCE(public.org_memberships.verified_at, now())
      ELSE public.org_memberships.verified_at
    END;
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

  -- Pending users already have Dumpers from signup; approved users without org can join here
  IF COALESCE(public.get_current_user_role(), 'pending') = 'pending' THEN
    PERFORM public.assign_dumpers_org_membership(auth.uid());
    RETURN;
  END IF;

  PERFORM public.join_organization(dumpers_id);
END;
$$;

-- =============================================================================
-- Backfill existing users
-- =============================================================================

DO $$
DECLARE
  profile_row RECORD;
BEGIN
  FOR profile_row IN
    SELECT id FROM public.profiles WHERE org_id IS NULL
  LOOP
    PERFORM public.assign_dumpers_org_membership(profile_row.id);
  END LOOP;
END $$;

UPDATE public.org_memberships m
SET verified_at = now()
FROM public.organizations o
WHERE m.org_id = o.id
  AND o.slug = 'dumpers'
  AND m.verified_at IS NULL;

INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at, verified_at)
SELECT o.id, p.id, 'member', COALESCE(p.approved_at, p.created_at, now()), now()
FROM public.profiles p
JOIN public.organizations o ON o.slug = 'dumpers'
WHERE p.org_id = o.id
ON CONFLICT (org_id, user_id) DO UPDATE
SET verified_at = COALESCE(public.org_memberships.verified_at, now());

GRANT EXECUTE ON FUNCTION public.assign_dumpers_org_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_dumpers_membership() TO authenticated;
