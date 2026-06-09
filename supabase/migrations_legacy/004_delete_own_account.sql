-- Self-service account deletion (does not modify banned_users)
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
BEGIN
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.banned_users WHERE id = caller_id) THEN
    RAISE EXCEPTION 'Banned accounts cannot be deleted through settings';
  END IF;

  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF caller_role = 'super-admin' THEN
    RAISE EXCEPTION 'Super-admin accounts cannot self-delete';
  END IF;

  -- Clear references from other profiles (approved_by has no ON DELETE SET NULL)
  UPDATE public.profiles
  SET approved_by = NULL
  WHERE approved_by = caller_id;

  DELETE FROM public.acquired_blueprints
  WHERE user_id = caller_id;

  DELETE FROM public.profiles
  WHERE id = caller_id;

  -- banned_users intentionally untouched (audit/blocklist preserved)

  RETURN jsonb_build_object('success', true, 'deleted_user_id', caller_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
