-- Accepted button-number shifts for Flight Profile modules.
-- The sheet numbers are the sinedrone_sentinel mapping. A live press replaces the shift for one placed module.

ALTER TABLE public.flight_profiles
  ADD COLUMN IF NOT EXISTS button_presses jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.flight_profiles.button_presses IS
  'Per-slot accepted button shift. baseline holds the sheet numbers for sinedrone_sentinel.';

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
  v_slots text[] := ARRAY['main', 'left', 'right', 'top', 'topLeft', 'topRight', 'bottom'];
  v_modules text[] := ARRAY[
    'scg', 'scg-lh', 'ota', 'ota-lh', 'stecs', 'stecs-plus', 'stecs-max',
    'stg', 'stg-lh', 'fsm', 'sem', 'sem-h', 'stem', 'atem',
    'thq', 'thq-v', 'thq-ww2', 'thq-v-ww2'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to save a flight profile';
  END IF;

  IF p_presses IS NULL OR jsonb_typeof(p_presses) <> 'object' THEN
    RAISE EXCEPTION 'Invalid button presses';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_presses)) <> 2
     OR NOT (p_presses ? 'left' AND p_presses ? 'right') THEN
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
      IF v_module IS NULL OR NOT (v_module = ANY (v_modules)) THEN
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

-- One-time: the numbers on the sheets are this member's mapping. They are not an accepted press.
DO $$
DECLARE
  v_count int;
  v_id uuid;
  v_baseline jsonb := '{
    "scg": 0,
    "scg-lh": 0,
    "fsm": 0,
    "stecs": 0,
    "stem": 0,
    "sem": 0,
    "sem-h": 0
  }'::jsonb;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE lower(rsi_handle) = 'sinedrone_sentinel'
    AND COALESCE(rsi_handle_verified, false);

  IF v_count > 1 THEN
    RAISE EXCEPTION 'More than one verified sinedrone_sentinel profile';
  END IF;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  SELECT id INTO v_id
  FROM public.profiles
  WHERE lower(rsi_handle) = 'sinedrone_sentinel'
    AND COALESCE(rsi_handle_verified, false);

  INSERT INTO public.flight_profiles (user_id, button_presses)
  VALUES (v_id, jsonb_build_object('baseline', v_baseline))
  ON CONFLICT (user_id) DO UPDATE
    SET button_presses = jsonb_set(
      COALESCE(public.flight_profiles.button_presses, '{}'::jsonb),
      '{baseline}',
      v_baseline,
      true
    )
  WHERE COALESCE(public.flight_profiles.button_presses -> 'baseline', '{}'::jsonb) = '{}'::jsonb;
END $$;
