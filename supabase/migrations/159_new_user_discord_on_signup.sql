-- =============================================================================
-- 159: Queue "New User Joined" Discord on auth signup (not welcome finish)
-- =============================================================================
-- Root cause of missed alerts: Discord only fired from mark_welcome_seen() when
-- a member finished the Welcome modal. Signups that never completed onboarding
-- (e.g. deathlesscreation) appeared in Admin → Unverified with no Discord row.
--
-- Fix: enqueue from handle_new_user after profile insert. Remove enqueue from
-- mark_welcome_seen so finishing welcome does not double-notify.
-- Discord queue failures must never block account creation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.queue_new_user_joined_discord(
  p_user_id uuid,
  p_display_name text,
  p_email text,
  p_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id uuid;
  v_discord_color int := 5865242;
  v_status text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_status := CASE
    WHEN p_role = 'pending' THEN 'Pending approval'
    WHEN p_role = 'member' THEN 'Auto-approved member'
    ELSE COALESCE(p_role, 'unknown')
  END;

  v_message_id := public.queue_discord_message(
    'admin',
    'New User Joined',
    'A new member has signed up.',
    v_discord_color,
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Display Name',
        'value', COALESCE(NULLIF(TRIM(p_display_name), ''), 'Not set'),
        'inline', true
      ),
      jsonb_build_object(
        'name', 'Status',
        'value', v_status,
        'inline', true
      ),
      jsonb_build_object(
        'name', 'Email',
        'value', COALESCE(NULLIF(TRIM(p_email), ''), 'Unknown'),
        'inline', false
      )
    )
  );

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_new_user_joined_discord(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_new_user_joined_discord(uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.queue_new_user_joined_discord(uuid, text, text, text) IS
  'Enqueue staff Discord for a new signup. Called from handle_new_user; not client-callable.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auto_approve boolean;
  new_role text;
  approval_time timestamptz;
  v_display_name text;
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

  SELECT COALESCE(auto_approve_enabled, false) INTO auto_approve
  FROM public.site_settings
  WHERE id = 1;

  IF auto_approve THEN
    new_role := 'member';
    approval_time := now();
  ELSE
    new_role := 'pending';
    approval_time := NULL;
  END IF;

  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name'
  );

  INSERT INTO public.profiles (id, email, display_name, avatar_url, role, approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    NEW.raw_user_meta_data->>'avatar_url',
    new_role,
    approval_time
  );

  BEGIN
    PERFORM public.queue_new_user_joined_discord(
      NEW.id,
      v_display_name,
      NEW.email,
      new_role
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'queue_new_user_joined_discord failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Welcome finish: mark seen only (Discord moved to signup)
CREATE OR REPLACE FUNCTION public.mark_welcome_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET has_seen_welcome = true
  WHERE id = v_user_id;
END;
$$;

-- Catch-up: members who signed up but never finished welcome (no prior New User Joined row)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id, p.display_name, p.email, p.role
    FROM public.profiles p
    WHERE p.has_seen_welcome = false
      AND p.role IN ('pending', 'member')
      AND p.created_at >= (now() - interval '14 days')
      AND p.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.discord_message_queue q
        WHERE q.title = 'New User Joined'
          AND q.fields::text ILIKE '%' || replace(p.email, '%', '\%') || '%'
      )
  LOOP
    BEGIN
      PERFORM public.queue_new_user_joined_discord(
        r.id,
        r.display_name,
        r.email,
        r.role
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill queue_new_user_joined_discord failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$$;
