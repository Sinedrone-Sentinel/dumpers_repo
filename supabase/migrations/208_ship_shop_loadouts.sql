-- Officer ship builds for Fuzy's Ship Shop. One jsonb row per user.
-- Members cannot write the table. Get and save are SECURITY DEFINER and officer-only.

CREATE TABLE IF NOT EXISTS public.ship_shop_loadouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store jsonb NOT NULL DEFAULT '{"version":1,"builds":[null,null,null,null]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ship_shop_loadouts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ship_shop_loadouts FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.ship_shop_loadouts IS
  'Fuzy''s Ship Shop: up to four ship builds per officer. Client writes go through save_ship_shop_loadouts.';

CREATE OR REPLACE FUNCTION public.ship_shop_require_officer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('officer', 'super-admin')
  ) THEN
    RAISE EXCEPTION 'Officers only';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ship_shop_require_officer() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_ship_shop_loadouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store jsonb;
BEGIN
  PERFORM public.ship_shop_require_officer();

  SELECT store INTO v_store
  FROM public.ship_shop_loadouts
  WHERE user_id = auth.uid();

  RETURN COALESCE(v_store, '{"version":1,"builds":[null,null,null,null]}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_ship_shop_loadouts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ship_shop_loadouts() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_ship_shop_loadouts(p_store jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ship_shop_require_officer();

  IF p_store IS NULL OR jsonb_typeof(p_store) <> 'object' THEN
    RAISE EXCEPTION 'Invalid ship shop store';
  END IF;

  INSERT INTO public.ship_shop_loadouts (user_id, store, updated_at)
  VALUES (auth.uid(), p_store, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    store = EXCLUDED.store,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_ship_shop_loadouts(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_ship_shop_loadouts(jsonb) TO authenticated;
