-- Virpil setups. A Virpil side saves top, main, and base. A VKB side keeps its seven slots.
-- Apply after 220_flight_gear_list_rudder.sql. Do not edit 216-220.

DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  WHERE con.conrelid = 'public.flight_gear'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%kind%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.flight_gear DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.flight_gear
  ADD CONSTRAINT flight_gear_kind_check
  CHECK (kind IN ('main', 'attach', 'peripheral', 'base'));

INSERT INTO public.flight_gear (id, kind, listed)
VALUES
  ('vp-alpha-r', 'main', false),
  ('vp-alpha-l', 'main', false),
  ('vp-alpha-prime-r', 'main', false),
  ('vp-alpha-prime-l', 'main', false),
  ('vp-delta', 'main', false),
  ('vp-cdt-aero-r', 'main', false),
  ('vp-cdt-aero-l', 'main', false),
  ('vp-flnkr', 'main', false),
  ('vp-archer-sf', 'main', false),
  ('vp-aeromax-l', 'main', false),
  ('vp-aeromax-r', 'main', false),
  ('vp-aeromax-lz', 'main', false),
  ('vp-aeromax-rz', 'main', false),
  ('vp-vmax-prime', 'main', false),
  ('vp-mt50cm3-throttle', 'main', false),
  ('vp-mt50cm4', 'main', false),
  ('vp-cdt-vmax', 'main', false),
  ('vp-warbrd', 'base', false),
  ('vp-warbrd-d', 'base', false),
  ('vp-mt50cm3-base', 'base', false),
  ('vp-atlas', 'base', false),
  ('vp-atlas-pro', 'base', false),
  ('vp-aeromax-module', 'attach', false),
  ('vp-ucp-1', 'peripheral', false),
  ('vp-ucp-2', 'peripheral', false),
  ('vp-ucp-3', 'peripheral', false),
  ('vp-r1-falcon', 'peripheral', false),
  ('vp-r1-legend', 'peripheral', false),
  ('vp-ace', 'peripheral', false),
  ('vp-hawk-60', 'peripheral', false),
  ('vp-sharka-50', 'peripheral', false),
  ('vp-dual-sf', 'peripheral', false),
  ('vp-rotor-tcs', 'peripheral', false),
  ('vp-rotor-tcs-plus', 'peripheral', false),
  ('vp-vector', 'peripheral', false),
  ('vp-vega', 'peripheral', false),
  ('vp-b-jet', 'peripheral', false),
  ('vp-p-jet', 'peripheral', false)
ON CONFLICT (id) DO NOTHING;

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
  v_kind text;
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
    IF jsonb_typeof(p_layout -> v_side) <> 'object' THEN
      RAISE EXCEPTION 'Invalid flight layout';
    END IF;

    IF (p_layout -> v_side ->> 'setup') = 'virpil' THEN
      IF (SELECT count(*) FROM jsonb_object_keys(p_layout -> v_side)) <> 4
         OR NOT (
           p_layout -> v_side ? 'setup'
           AND p_layout -> v_side ? 'top'
           AND p_layout -> v_side ? 'main'
           AND p_layout -> v_side ? 'base'
         ) THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;

      v_text := p_layout -> v_side ->> 'top';
      v_kind := 'attach';
      IF v_text IS NULL THEN
        IF jsonb_typeof(p_layout -> v_side -> 'top') IS DISTINCT FROM 'null' THEN
          RAISE EXCEPTION 'Invalid flight layout';
        END IF;
      ELSIF NOT EXISTS (SELECT 1 FROM public.flight_gear g WHERE g.id = v_text AND g.kind = v_kind) THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;

      v_text := p_layout -> v_side ->> 'main';
      IF v_text IS NULL THEN
        IF jsonb_typeof(p_layout -> v_side -> 'main') IS DISTINCT FROM 'null' THEN
          RAISE EXCEPTION 'Invalid flight layout';
        END IF;
      ELSIF NOT EXISTS (SELECT 1 FROM public.flight_gear g WHERE g.id = v_text AND g.kind = 'main') THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;

      v_text := p_layout -> v_side ->> 'base';
      IF v_text IS NULL THEN
        IF jsonb_typeof(p_layout -> v_side -> 'base') IS DISTINCT FROM 'null' THEN
          RAISE EXCEPTION 'Invalid flight layout';
        END IF;
      ELSIF NOT EXISTS (SELECT 1 FROM public.flight_gear g WHERE g.id = v_text AND g.kind = 'base') THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;
    ELSE
      IF (p_layout -> v_side ? 'setup')
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
    END IF;
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
        IF EXISTS (
          SELECT 1 FROM public.flight_gear g
          WHERE g.id = v_text AND g.kind IN ('main', 'base')
        ) THEN
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
  v_slots text[];
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
    IF jsonb_typeof(p_presses -> v_side) <> 'object' THEN
      RAISE EXCEPTION 'Invalid button presses';
    END IF;
    IF (p_presses -> v_side ? 'base') THEN
      v_slots := ARRAY['top', 'main', 'base'];
      IF (SELECT count(*) FROM jsonb_object_keys(p_presses -> v_side)) <> 3 THEN
        RAISE EXCEPTION 'Invalid button presses';
      END IF;
    ELSE
      v_slots := ARRAY['main', 'left', 'right', 'top', 'topLeft', 'topRight', 'bottom'];
      IF (SELECT count(*) FROM jsonb_object_keys(p_presses -> v_side)) <> 7 THEN
        RAISE EXCEPTION 'Invalid button presses';
      END IF;
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
        IF EXISTS (
          SELECT 1 FROM public.flight_gear g
          WHERE g.id = v_module AND g.kind IN ('main', 'base')
        ) THEN
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
