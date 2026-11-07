-- The modules a member places in the Flight Profile bays.
-- The uploaded XML is left alone. A layout can be saved before a file exists.

ALTER TABLE public.flight_profiles
  ADD COLUMN IF NOT EXISTS layout jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.flight_profiles ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE public.flight_profiles ALTER COLUMN profile_name DROP NOT NULL;
ALTER TABLE public.flight_profiles ALTER COLUMN xml DROP NOT NULL;

COMMENT ON COLUMN public.flight_profiles.layout IS
  'Bay layout saved by save_flight_profile_layout. Keys are left/right and the mount slots.';

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

  IF p_layout IS NULL OR jsonb_typeof(p_layout) <> 'object' THEN
    RAISE EXCEPTION 'Invalid flight layout';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_layout)) <> 2
     OR NOT (p_layout ? 'left' AND p_layout ? 'right') THEN
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
      ELSIF NOT (v_text = ANY (v_modules)) THEN
        RAISE EXCEPTION 'Invalid flight layout';
      END IF;
    END LOOP;
  END LOOP;

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
