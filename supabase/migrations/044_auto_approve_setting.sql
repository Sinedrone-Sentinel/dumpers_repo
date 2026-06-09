-- Auto-approve new signups setting for super-admin
-- Adds auto_approve_enabled to site_settings and updates handle_new_user trigger

-- =============================================================================
-- Add auto_approve_enabled column to site_settings
-- =============================================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS auto_approve_enabled boolean NOT NULL DEFAULT false;

-- =============================================================================
-- RPC to update auto_approve_enabled (super-admin only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_site_auto_approve(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  UPDATE public.site_settings
  SET auto_approve_enabled = p_enabled,
      updated_at = now()
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.site_settings (id, auto_approve_enabled, updated_at)
    VALUES (1, p_enabled, now());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_site_auto_approve(boolean) TO authenticated;

-- =============================================================================
-- Update handle_new_user trigger to check auto_approve_enabled
-- =============================================================================

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
BEGIN
  -- Check if user is banned by ID
  IF EXISTS (SELECT 1 FROM public.banned_users WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'This account has been banned';
  END IF;

  -- Check if user is banned by email
  IF EXISTS (
    SELECT 1 FROM public.banned_users
    WHERE email IS NOT NULL AND email = NEW.email
  ) THEN
    RAISE EXCEPTION 'This email has been banned';
  END IF;

  -- Check auto-approve setting
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

  INSERT INTO public.profiles (id, email, display_name, avatar_url, role, approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    new_role,
    approval_time
  );

  RETURN NEW;
END;
$$;
