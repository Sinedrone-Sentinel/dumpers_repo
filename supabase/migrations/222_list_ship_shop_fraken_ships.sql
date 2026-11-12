-- Which ships have a published Franken-Fit, kept live for the ship search.
-- The fit JSON stays on ship_shop_fraken_fits and is still read through get_ship_shop_fraken_fit.
-- ship_shop_fraken_listed is only the ship id, so guests can select it and hear inserts and deletes.

CREATE OR REPLACE FUNCTION public.list_ship_shop_fraken_ship_ids()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(ship_id ORDER BY ship_id), '{}'::text[])
  FROM public.ship_shop_fraken_fits;
$$;

REVOKE ALL ON FUNCTION public.list_ship_shop_fraken_ship_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ship_shop_fraken_ship_ids() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_ship_shop_fraken_fit(p_ship_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM public.ship_shop_fraken_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_ship_id IS NULL OR p_ship_id !~ '^[a-z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid ship';
  END IF;

  DELETE FROM public.ship_shop_fraken_fits WHERE ship_id = p_ship_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_ship_shop_fraken_fit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ship_shop_fraken_fit(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.ship_shop_fraken_listed (
  ship_id text PRIMARY KEY
);

ALTER TABLE public.ship_shop_fraken_listed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ship_shop_fraken_listed REPLICA IDENTITY FULL;

REVOKE ALL ON TABLE public.ship_shop_fraken_listed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ship_shop_fraken_listed TO anon, authenticated;

DROP POLICY IF EXISTS ship_shop_fraken_listed_read ON public.ship_shop_fraken_listed;
CREATE POLICY ship_shop_fraken_listed_read
  ON public.ship_shop_fraken_listed
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.ship_shop_fraken_listed IS
  'Ship ids with a published Franken-Fit. A trigger mirrors inserts and deletes from ship_shop_fraken_fits. Clients may select. They may not write.';

INSERT INTO public.ship_shop_fraken_listed (ship_id)
SELECT ship_id FROM public.ship_shop_fraken_fits
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_ship_shop_fraken_listed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ship_shop_fraken_listed (ship_id)
    VALUES (NEW.ship_id)
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.ship_shop_fraken_listed WHERE ship_id = OLD.ship_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_ship_shop_fraken_listed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_ship_shop_fraken_listed ON public.ship_shop_fraken_fits;
CREATE TRIGGER sync_ship_shop_fraken_listed
  AFTER INSERT OR DELETE ON public.ship_shop_fraken_fits
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ship_shop_fraken_listed();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ship_shop_fraken_listed'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ship_shop_fraken_listed;
  END IF;
END $$;
