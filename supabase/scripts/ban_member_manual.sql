-- Manual ban cleanup script for DBA use (Supabase SQL Editor)
-- Set target_user_id below, then run the entire script.

DO $$
DECLARE
  target_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- ← replace
  banned_by_id uuid := NULL; -- optional: officer profile id for audit
  ban_reason text := 'Manual ban';
  profile_row public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile_row
  FROM public.profiles
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found for user %', target_user_id;
  END IF;

  IF profile_row.role = 'super-admin' THEN
    RAISE EXCEPTION 'Cannot ban a super-admin';
  END IF;

  DELETE FROM public.acquired_blueprints
  WHERE user_id = target_user_id;

  INSERT INTO public.banned_users (
    id, email, display_name, rsi_handle, avatar_url,
    banned_at, banned_by, reason
  )
  VALUES (
    profile_row.id,
    profile_row.email,
    profile_row.display_name,
    profile_row.rsi_handle,
    profile_row.avatar_url,
    now(),
    banned_by_id,
    ban_reason
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    rsi_handle = EXCLUDED.rsi_handle,
    avatar_url = EXCLUDED.avatar_url,
    banned_at = EXCLUDED.banned_at,
    banned_by = EXCLUDED.banned_by,
    reason = EXCLUDED.reason;

  DELETE FROM public.profiles
  WHERE id = target_user_id;

  RAISE NOTICE 'Banned user % (%)', profile_row.display_name, target_user_id;
END;
$$;

-- After running this script, also ban the auth user in Dashboard → Authentication → Users,
-- or call the ban-user Edge Function / auth.admin.updateUserById with service role.
