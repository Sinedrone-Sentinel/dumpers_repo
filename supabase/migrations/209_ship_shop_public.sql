-- Fuzy's Ship Shop builds belong to any signed-in account, not only officers.
-- Offline Mode stays in the browser. The table stays closed to PostgREST writes.
-- get_ship_shop_loadouts returns NULL when this account has no row yet, so the
-- client can move a browser's builds onto the account once.

COMMENT ON TABLE public.ship_shop_loadouts IS
  'Fuzy''s Ship Shop: up to four ship builds per signed-in account. Client writes go through save_ship_shop_loadouts.';

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
END;
$$;

REVOKE ALL ON FUNCTION public.ship_shop_require_officer() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.ship_shop_require_officer() IS
  'Requires a signed-in account. The name is kept so existing callers do not change.';

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

  RETURN v_store;
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
