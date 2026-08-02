-- Officers may ban pending/member accounts only; banning officers is super-admin only.
-- Matches Admin Panel UI gates (demote / ban officers = super-admin).

CREATE OR REPLACE FUNCTION public.ban_member(
  target_user_id uuid,
  reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  target_role text;
  profile_row public.profiles%ROWTYPE;
BEGIN
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_role IS NULL OR caller_role NOT IN ('officer', 'super-admin') THEN
    RAISE EXCEPTION 'Permission denied: officer or super-admin required';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  target_role := profile_row.role;

  IF target_role = 'super-admin' THEN
    RAISE EXCEPTION 'Cannot ban a super-admin';
  END IF;

  IF caller_role = 'officer' AND target_role = 'officer' THEN
    RAISE EXCEPTION 'Permission denied: only a super-admin can ban an officer';
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
    auth.uid(),
    reason
  );

  DELETE FROM public.profiles
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true, 'banned_user_id', target_user_id);
END;
$$;
