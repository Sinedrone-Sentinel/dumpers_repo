-- Reliable org context load + repair broken profile.org_id / membership rows
-- Run in Supabase SQL Editor after 019_org_read_via_profile.sql

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
    AND (
      org_id IS NULL
      OR org_id <> dumpers_id
      OR NOT EXISTS (
        SELECT 1 FROM public.organizations o WHERE o.id = profiles.org_id
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.org_memberships m
        WHERE m.user_id = p_user_id
          AND m.org_id = profiles.org_id
      )
    );

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

CREATE OR REPLACE FUNCTION public.get_my_org_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  payload jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.assign_dumpers_org_membership(uid);

  SELECT jsonb_build_object(
    'organization', jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'slug', o.slug,
      'resources_public', o.resources_public,
      'joinable', o.joinable
    ),
    'membership', jsonb_build_object(
      'org_id', m.org_id,
      'user_id', m.user_id,
      'org_role', m.org_role,
      'verified_at', m.verified_at,
      'verified_by', m.verified_by,
      'joined_at', m.joined_at
    )
  )
  INTO payload
  FROM public.profiles p
  JOIN public.organizations o ON o.id = p.org_id
  JOIN public.org_memberships m
    ON m.org_id = p.org_id
   AND m.user_id = p.id
  WHERE p.id = uid;

  RETURN payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_context() TO authenticated;
