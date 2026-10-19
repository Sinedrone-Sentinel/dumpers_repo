-- Fuzy's Fraken-Fit: one published loadout per ship.
-- The owner row is pinned to the verified Hotfuzy officer account at apply time.
-- A later handle change does not move the save right.
-- Anyone may read a published fit. Only that pinned account can write one.
-- No client table writes.

CREATE TABLE IF NOT EXISTS public.ship_shop_fraken_owner (
  id int PRIMARY KEY CHECK (id = 1),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.ship_shop_fraken_fits (
  ship_id text PRIMARY KEY CHECK (ship_id ~ '^[a-z0-9_]{1,80}$'),
  ports jsonb NOT NULL DEFAULT '{}'::jsonb,
  power jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ship_shop_fraken_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ship_shop_fraken_fits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ship_shop_fraken_owner FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ship_shop_fraken_fits FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.ship_shop_fraken_owner IS
  'Single account allowed to publish Fuzy''s Fraken-Fit. Pinned by user id, not by RSI handle.';

COMMENT ON TABLE public.ship_shop_fraken_fits IS
  'One view-only Fraken-Fit per ship. Reads go through get_ship_shop_fraken_fit. Writes go through save_ship_shop_fraken_fit.';

DO $$
DECLARE
  v_count int;
  v_id uuid;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE lower(rsi_handle) = 'hotfuzy'
    AND COALESCE(rsi_handle_verified, false)
    AND role IN ('officer', 'super-admin');

  IF v_count > 1 THEN
    RAISE EXCEPTION 'More than one verified Hotfuzy officer profile';
  END IF;

  IF v_count = 1 THEN
    SELECT id INTO v_id
    FROM public.profiles
    WHERE lower(rsi_handle) = 'hotfuzy'
      AND COALESCE(rsi_handle_verified, false)
      AND role IN ('officer', 'super-admin');

    INSERT INTO public.ship_shop_fraken_owner (id, user_id)
    VALUES (1, v_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ship_shop_fraken_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.user_id
  FROM public.ship_shop_fraken_owner o
  JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = 1
    AND p.role IN ('officer', 'super-admin');
$$;

REVOKE ALL ON FUNCTION public.ship_shop_fraken_owner_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ship_shop_fraken_can_save()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND auth.uid() = public.ship_shop_fraken_owner_id();
$$;

REVOKE ALL ON FUNCTION public.ship_shop_fraken_can_save() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ship_shop_fraken_can_save() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ship_shop_fraken_fit(p_ship_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ports jsonb;
  v_power jsonb;
BEGIN
  IF p_ship_id IS NULL OR p_ship_id !~ '^[a-z0-9_]{1,80}$' THEN
    RETURN NULL;
  END IF;

  SELECT ports, power INTO v_ports, v_power
  FROM public.ship_shop_fraken_fits
  WHERE ship_id = p_ship_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'shipId', p_ship_id,
    'ports', COALESCE(v_ports, '{}'::jsonb),
    'power', COALESCE(v_power, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ship_shop_fraken_fit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ship_shop_fraken_fit(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_ship_shop_fraken_fit(p_ship_id text, p_build jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ports jsonb;
  v_power jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM public.ship_shop_fraken_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_ship_id IS NULL OR p_ship_id !~ '^[a-z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid ship';
  END IF;

  IF p_build IS NULL OR jsonb_typeof(p_build) <> 'object' THEN
    RAISE EXCEPTION 'Invalid build';
  END IF;

  IF p_build->>'shipId' IS DISTINCT FROM p_ship_id THEN
    RAISE EXCEPTION 'Invalid build';
  END IF;

  v_ports := COALESCE(p_build->'ports', '{}'::jsonb);
  v_power := COALESCE(p_build->'power', '{}'::jsonb);

  IF jsonb_typeof(v_ports) <> 'object' OR jsonb_typeof(v_power) <> 'object' THEN
    RAISE EXCEPTION 'Invalid build';
  END IF;

  IF octet_length(v_ports::text) > 200000 OR octet_length(v_power::text) > 200000 THEN
    RAISE EXCEPTION 'Invalid build';
  END IF;

  INSERT INTO public.ship_shop_fraken_fits (ship_id, ports, power, updated_at)
  VALUES (p_ship_id, v_ports, v_power, now())
  ON CONFLICT (ship_id)
  DO UPDATE SET
    ports = EXCLUDED.ports,
    power = EXCLUDED.power,
    updated_at = now();

  RETURN jsonb_build_object('shipId', p_ship_id, 'ports', v_ports, 'power', v_power);
END;
$$;

REVOKE ALL ON FUNCTION public.save_ship_shop_fraken_fit(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ship_shop_fraken_fit(text, jsonb) TO authenticated;
