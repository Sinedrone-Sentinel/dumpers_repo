-- 045 Remove preview features gating
-- Preview features are now launched to all approved members.
-- This migration updates the can_access_preview_features() function to simply
-- check if the user is approved (not pending, not ghost mode).

CREATE OR REPLACE FUNCTION public.can_access_preview_features()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_current_user_role() IN ('member', 'officer', 'super-admin')
    AND COALESCE(
      (SELECT NOT ghost_mode FROM public.profiles WHERE id = auth.uid()),
      false
    );
$$;

-- The rpc_can_access_preview_features wrapper also needs updating
CREATE OR REPLACE FUNCTION public.rpc_can_access_preview_features()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_preview_features();
$$;

-- Note: We intentionally leave the preview_features_enabled column in profiles
-- to avoid breaking any cached queries. It's now unused and can be removed in
-- a future cleanup migration if desired.
