-- Production incremental: site_settings for existing DBs (already ran 001-041)
-- Skip on greenfield installs that ran 006 baseline.


CREATE TABLE IF NOT EXISTS public.site_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dfp_display_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (id, dfp_display_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_settings_select_authenticated" ON public.site_settings;
CREATE POLICY "site_settings_select_authenticated"
  ON public.site_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "site_settings_update_super_admin" ON public.site_settings;
CREATE POLICY "site_settings_update_super_admin"
  ON public.site_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.update_site_dfp_display(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  INSERT INTO public.site_settings (id, dfp_display_enabled, updated_at)
  VALUES (1, p_enabled, now())
  ON CONFLICT (id) DO UPDATE
  SET dfp_display_enabled = EXCLUDED.dfp_display_enabled,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_site_dfp_display(boolean) TO authenticated;
