-- Super-admin unban: remove from banned_users, restore profile as pending
-- Run in Supabase SQL Editor after 001_banned_users.sql

CREATE OR REPLACE FUNCTION public.unban_member(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  ban_row public.banned_users%ROWTYPE;
BEGIN
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_role IS DISTINCT FROM 'super-admin' THEN
    RAISE EXCEPTION 'Permission denied: super-admin required';
  END IF;

  SELECT * INTO ban_row
  FROM public.banned_users
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not banned';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  DELETE FROM public.banned_users
  WHERE id = target_user_id;

  INSERT INTO public.profiles (
    id, email, display_name, avatar_url, rsi_handle, role
  )
  VALUES (
    ban_row.id,
    ban_row.email,
    ban_row.display_name,
    ban_row.avatar_url,
    ban_row.rsi_handle,
    'pending'
  );

  RETURN jsonb_build_object('success', true, 'unbanned_user_id', target_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.unban_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unban_member(uuid) TO authenticated;
