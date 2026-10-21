-- Ship Hangar: up to 10 ships for a signed-in account, 20 when RSI verified.
-- The browser cannot write the table. save_ship_hangar reads the verified flag itself.

CREATE TABLE IF NOT EXISTS public.ship_hangar (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  ships jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ship_hangar ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ship_hangar FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.ship_hangar IS
  'Ship Hangar: saved ships and their builds. 10 for a signed-in account, 20 when RSI verified. Client writes go through save_ship_hangar.';

CREATE OR REPLACE FUNCTION public.get_ship_hangar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ships jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT ships INTO v_ships
  FROM public.ship_hangar
  WHERE user_id = auth.uid();

  RETURN COALESCE(v_ships, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_ship_hangar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ship_hangar() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_ship_hangar(p_ships jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified boolean;
  v_cap integer;
  v_old jsonb;
  v_old_len integer;
  v_new_len integer;
  v_item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_ships IS NULL OR jsonb_typeof(p_ships) <> 'array' THEN
    RAISE EXCEPTION 'Invalid hangar';
  END IF;

  v_new_len := jsonb_array_length(p_ships);
  IF v_new_len > 20 THEN
    RAISE EXCEPTION 'Hangar limit is 20 ships';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ships)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR coalesce(v_item->>'id', '') = ''
      OR coalesce(v_item->>'shipId', '') = ''
      OR coalesce(v_item->>'label', '') = ''
      OR v_item->'build' IS NULL
      OR jsonb_typeof(v_item->'build') <> 'object'
      OR length(v_item->>'id') > 80
      OR length(v_item->>'shipId') > 80
      OR length(v_item->>'label') > 80
    THEN
      RAISE EXCEPTION 'Invalid hangar ship';
    END IF;
  END LOOP;

  SELECT COALESCE(rsi_handle_verified, false) INTO v_verified
  FROM public.profiles
  WHERE id = auth.uid();

  v_cap := CASE WHEN COALESCE(v_verified, false) THEN 20 ELSE 10 END;

  SELECT ships INTO v_old
  FROM public.ship_hangar
  WHERE user_id = auth.uid();

  v_old_len := COALESCE(jsonb_array_length(v_old), 0);

  IF v_new_len > v_cap AND v_new_len > v_old_len THEN
    RAISE EXCEPTION 'Hangar limit is % ships', v_cap;
  END IF;

  INSERT INTO public.ship_hangar (user_id, ships, updated_at)
  VALUES (auth.uid(), p_ships, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    ships = EXCLUDED.ships,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'cap', v_cap);
END;
$$;

REVOKE ALL ON FUNCTION public.save_ship_hangar(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_ship_hangar(jsonb) TO authenticated;
