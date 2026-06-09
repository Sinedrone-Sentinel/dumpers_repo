-- Member ban system: banned_users table, RLS, ban_member RPC
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- =============================================================================
-- banned_users table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.banned_users (
  id uuid PRIMARY KEY,
  email text,
  display_name text,
  rsi_handle text,
  avatar_url text,
  banned_at timestamptz NOT NULL DEFAULT now(),
  banned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text
);

CREATE INDEX IF NOT EXISTS banned_users_email_idx ON public.banned_users (email);

ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own ban record (client ban detection)
CREATE POLICY "banned_users_select_own"
  ON public.banned_users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Officers and super-admins can read all ban records (audit tab)
CREATE POLICY "banned_users_select_officers"
  ON public.banned_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('officer', 'super-admin')
    )
  );

-- No INSERT/UPDATE/DELETE policies for clients — only ban_member RPC inserts

-- =============================================================================
-- Block banned users from profiles and acquired_blueprints (RESTRICTIVE)
-- =============================================================================

-- Helper: true when the current session user is on the ban list
CREATE OR REPLACE FUNCTION public.is_current_user_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_users WHERE id = auth.uid()
  );
$$;

-- RESTRICTIVE policies deny access when the caller is banned
CREATE POLICY "profiles_deny_banned"
  ON public.profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (NOT public.is_current_user_banned());

CREATE POLICY "acquired_blueprints_deny_banned"
  ON public.acquired_blueprints
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (NOT public.is_current_user_banned());

-- =============================================================================
-- ban_member RPC
-- =============================================================================

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

REVOKE ALL ON FUNCTION public.ban_member(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ban_member(uuid, text) TO authenticated;
