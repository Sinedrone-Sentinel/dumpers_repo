-- Hidden flight-gear catalog, plus external device slots for RSI-verified members.
-- Apply after 218_flight_button_presses.sql. Do not edit 216, 217, or 218.

CREATE TABLE IF NOT EXISTS public.flight_gear (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('main', 'attach', 'peripheral')),
  listed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.flight_gear ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.flight_gear FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.flight_gear TO authenticated;

DROP POLICY IF EXISTS flight_gear_read ON public.flight_gear;
CREATE POLICY flight_gear_read ON public.flight_gear
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.flight_gear (id, kind, listed)
VALUES
  ('scg', 'main', true),
  ('scg-lh', 'main', true),
  ('scg-std', 'main', false),
  ('scg-std-lh', 'main', false),
  ('ota', 'main', false),
  ('ota-lh', 'main', false),
  ('gf4-scg', 'main', false),
  ('gf4-scg-lh', 'main', false),
  ('gf4-scg-std', 'main', false),
  ('gf4-scg-std-lh', 'main', false),
  ('gf4-f14', 'main', false),
  ('gf4-kg12', 'main', false),
  ('gf4-mcg-pro', 'main', false),
  ('gf4-mcg-ult', 'main', false),
  ('gf3-scg', 'main', false),
  ('gf3-scg-lh', 'main', false),
  ('gf3-scg-std', 'main', false),
  ('gf3-scg-std-lh', 'main', false),
  ('gf3-f14', 'main', false),
  ('gf3-kg12', 'main', false),
  ('gf3-kg12-g1', 'main', false),
  ('gf3-mcg-pro', 'main', false),
  ('gf3-mcg-ult', 'main', false),
  ('stecs', 'main', true),
  ('stecs-mini', 'main', false),
  ('stecs-plus', 'main', false),
  ('stecs-max', 'main', false),
  ('stecs1-mini', 'main', false),
  ('stecs1', 'main', false),
  ('stecs1-plus', 'main', false),
  ('stecs1-max', 'main', false),
  ('stg-mini', 'main', false),
  ('stg-mini-lh', 'main', false),
  ('stg', 'main', false),
  ('stg-lh', 'main', false),
  ('stg-plus', 'main', false),
  ('stg-plus-lh', 'main', false),
  ('stg-max', 'main', false),
  ('stg-max-lh', 'main', false),
  ('fsm', 'attach', true),
  ('sem', 'attach', true),
  ('sem-h', 'attach', true),
  ('stem', 'attach', true),
  ('atem', 'attach', false),
  ('thq', 'attach', false),
  ('thq-v', 'attach', false),
  ('thq-ww2', 'attach', false),
  ('thq-v-ww2', 'attach', false),
  ('sd-mini', 'peripheral', false),
  ('sd-mk2', 'peripheral', false),
  ('sd-xl', 'peripheral', false),
  ('sd-plus', 'peripheral', false),
  ('sd-neo', 'peripheral', false),
  ('sd-pedal', 'peripheral', false),
  ('t-rudder', 'peripheral', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_set_flight_gear_listed(p_id text, p_listed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super admin only';
  END IF;
  UPDATE public.flight_gear SET listed = p_listed WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown flight gear';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_flight_gear_listed(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_flight_gear_listed(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.flight_gear_known(p_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.flight_gear WHERE id = p_id);
$$;

REVOKE ALL ON FUNCTION public.flight_gear_known(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_flight_profile_layout(p_layout jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_saved timestamptz := now();
  v_side text;
  v_slot text;
  v_text text;
  v_index int;
  v_verified boolean;
  v_slots text[] := ARRAY['main', 'left', 'right', 'top', 'topLeft', 'topRight', 'bottom'];
  v_external text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to save a flight profile';
  END IF;
  IF p_layout IS NULL OR jsonb_typeof(p_layout) <> 'object' THEN
    RAISE EXCEPTION 'Invalid flight layout';
  END IF;
  IF NOT (p_layout ? 'left' AND p_layout ? 'right') THEN
    RAISE EXCEPTION 'Invalid flight layout';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_layout) AS key
    WHERE key NOT IN ('left', 'right', 'externalLeft', 'externalRight')
  ) THEN
    RAISE EXCEPTION 'Invalid flight layout';
  END IF;

  FOREACH v_side IN ARRAY ARRAY['left', 'right']
  LOOP
    IF jsonb_typeof(p_layout -> v_side) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(p_layout -> v_side)) <> 7 THEN
      RAISE EXCEPTION 'Invalid flight layout';
    END IF;
    FOREACH v_slot IN ARRAY v_slots
    LOOP
      IF NOT (p_layout -> v_side ? v_slot) THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;
      v_text := p_layout -> v_side ->> v_slot;
      IF v_text IS NULL THEN
        IF jsonb_typeof(p_layout -> v_side -> v_slot) IS DISTINCT FROM 'null' THEN
          RAISE EXCEPTION 'Invalid flight layout';
        END IF;
      ELSIF NOT public.flight_gear_known(v_text) THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;
    END LOOP;
  END LOOP;

  IF p_layout ? 'externalLeft' OR p_layout ? 'externalRight' THEN
    SELECT COALESCE(rsi_handle_verified, false) INTO v_verified
    FROM public.profiles WHERE id = v_uid;
    IF NOT COALESCE(v_verified, false) THEN
      RAISE EXCEPTION 'RSI verification is required for external devices';
    END IF;
    FOREACH v_external IN ARRAY ARRAY['externalLeft', 'externalRight']
    LOOP
      IF NOT (p_layout ? v_external) THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(p_layout -> v_external) <> 'array'
         OR jsonb_array_length(p_layout -> v_external) <> 2 THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;
      FOR v_index IN 0..1
      LOOP
        IF jsonb_typeof(p_layout -> v_external -> v_index) = 'null' THEN
          CONTINUE;
        END IF;
        v_text := p_layout -> v_external ->> v_index;
        IF v_text IS NULL OR NOT public.flight_gear_known(v_text) THEN
          RAISE EXCEPTION 'Invalid flight layout';
        END IF;
        IF EXISTS (SELECT 1 FROM public.flight_gear g WHERE g.id = v_text AND g.kind = 'main') THEN
          RAISE EXCEPTION 'External slots are for extra devices only';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  INSERT INTO public.flight_profiles (user_id, layout, updated_at)
  VALUES (v_uid, p_layout, v_saved)
  ON CONFLICT (user_id) DO UPDATE
    SET layout = EXCLUDED.layout,
        updated_at = EXCLUDED.updated_at;
  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_flight_profile_layout(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_flight_profile_layout(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_flight_button_presses(p_presses jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_saved timestamptz := now();
  v_side text;
  v_slot text;
  v_value jsonb;
  v_module text;
  v_delta int;
  v_baseline jsonb;
  v_stored jsonb;
  v_verified boolean;
  v_index int;
  v_external text;
  v_slots text[] := ARRAY['main', 'left', 'right', 'top', 'topLeft', 'topRight', 'bottom'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to save a flight profile';
  END IF;

  IF p_presses IS NULL OR jsonb_typeof(p_presses) <> 'object' THEN
    RAISE EXCEPTION 'Invalid button presses';
  END IF;
  IF NOT (p_presses ? 'left' AND p_presses ? 'right') THEN
    RAISE EXCEPTION 'Invalid button presses';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_presses) AS key
    WHERE key NOT IN ('left', 'right', 'externalLeft', 'externalRight')
  ) THEN
    RAISE EXCEPTION 'Invalid button presses';
  END IF;

  FOREACH v_side IN ARRAY ARRAY['left', 'right']
  LOOP
    IF jsonb_typeof(p_presses -> v_side) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(p_presses -> v_side)) <> 7 THEN
      RAISE EXCEPTION 'Invalid button presses';
    END IF;
    FOREACH v_slot IN ARRAY v_slots
    LOOP
      IF NOT (p_presses -> v_side ? v_slot) THEN
        RAISE EXCEPTION 'Invalid button presses';
      END IF;
      v_value := p_presses -> v_side -> v_slot;
      IF jsonb_typeof(v_value) = 'null' THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_value) <> 'object'
         OR (SELECT count(*) FROM jsonb_object_keys(v_value)) <> 3
         OR NOT (v_value ? 'moduleId' AND v_value ? 'delta' AND v_value ? 'accepted')
         OR v_value ->> 'accepted' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Invalid button presses';
      END IF;
      v_module := v_value ->> 'moduleId';
      IF v_module IS NULL OR NOT public.flight_gear_known(v_module) THEN
        RAISE EXCEPTION 'Invalid button presses';
      END IF;
      BEGIN
        v_delta := (v_value ->> 'delta')::int;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid button presses';
      END;
      IF v_delta < -512 OR v_delta > 512 OR (v_value ->> 'delta') !~ '^-?[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid button presses';
      END IF;
    END LOOP;
  END LOOP;

  IF p_presses ? 'externalLeft' OR p_presses ? 'externalRight' THEN
    SELECT COALESCE(rsi_handle_verified, false) INTO v_verified
    FROM public.profiles WHERE id = v_uid;
    IF NOT COALESCE(v_verified, false) THEN
      RAISE EXCEPTION 'RSI verification is required for external devices';
    END IF;
    FOREACH v_external IN ARRAY ARRAY['externalLeft', 'externalRight']
    LOOP
      IF NOT (p_presses ? v_external) THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(p_presses -> v_external) <> 'array'
         OR jsonb_array_length(p_presses -> v_external) <> 2 THEN
        RAISE EXCEPTION 'Invalid button presses';
      END IF;
      FOR v_index IN 0..1
      LOOP
        v_value := p_presses -> v_external -> v_index;
        IF jsonb_typeof(v_value) = 'null' THEN
          CONTINUE;
        END IF;
        IF jsonb_typeof(v_value) <> 'object'
           OR (SELECT count(*) FROM jsonb_object_keys(v_value)) <> 3
           OR NOT (v_value ? 'moduleId' AND v_value ? 'delta' AND v_value ? 'accepted')
           OR v_value ->> 'accepted' IS DISTINCT FROM 'true' THEN
          RAISE EXCEPTION 'Invalid button presses';
        END IF;
        v_module := v_value ->> 'moduleId';
        IF v_module IS NULL OR NOT public.flight_gear_known(v_module) THEN
          RAISE EXCEPTION 'Invalid button presses';
        END IF;
        IF EXISTS (SELECT 1 FROM public.flight_gear g WHERE g.id = v_module AND g.kind = 'main') THEN
          RAISE EXCEPTION 'External slots are for extra devices only';
        END IF;
        BEGIN
          v_delta := (v_value ->> 'delta')::int;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'Invalid button presses';
        END;
        IF v_delta < -512 OR v_delta > 512 OR (v_value ->> 'delta') !~ '^-?[0-9]+$' THEN
          RAISE EXCEPTION 'Invalid button presses';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  SELECT COALESCE(button_presses -> 'baseline', '{}'::jsonb)
    INTO v_baseline
  FROM public.flight_profiles
  WHERE user_id = v_uid;

  v_stored := p_presses || jsonb_build_object('baseline', COALESCE(v_baseline, '{}'::jsonb));

  INSERT INTO public.flight_profiles (user_id, button_presses, updated_at)
  VALUES (v_uid, v_stored, v_saved)
  ON CONFLICT (user_id) DO UPDATE
    SET button_presses = EXCLUDED.button_presses,
        updated_at = EXCLUDED.updated_at;

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_flight_button_presses(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_flight_button_presses(jsonb) TO authenticated;
