-- Welcome Modal settings for onboarding new users
-- Super-admin can toggle "always show" for testing purposes

-- Add user flag to track if they've seen the welcome modal
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_seen_welcome boolean NOT NULL DEFAULT false;

-- Add site setting for super-admin to always see the modal (testing)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS show_welcome_modal_always boolean NOT NULL DEFAULT false;

-- RPC to mark welcome as seen
CREATE OR REPLACE FUNCTION public.mark_welcome_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET has_seen_welcome = true
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_welcome_seen() TO authenticated;

-- RPC to toggle super-admin "always show welcome" setting
CREATE OR REPLACE FUNCTION public.update_show_welcome_modal_always(p_enabled boolean)
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
  SET show_welcome_modal_always = p_enabled,
      updated_at = now()
  WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_show_welcome_modal_always(boolean) TO authenticated;

-- RPC to get welcome modal visibility status
CREATE OR REPLACE FUNCTION public.get_welcome_modal_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_seen boolean;
  v_always_show boolean;
  v_is_super_admin boolean;
BEGIN
  SELECT has_seen_welcome INTO v_has_seen
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT show_welcome_modal_always INTO v_always_show
  FROM public.site_settings
  WHERE id = 1;

  v_is_super_admin := public.is_super_admin();

  RETURN jsonb_build_object(
    'has_seen', COALESCE(v_has_seen, false),
    'always_show', COALESCE(v_always_show, false),
    'is_super_admin', v_is_super_admin
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_welcome_modal_status() TO authenticated;
