-- One Star Citizen flight profile per member.
-- Saving replaces the stored XML. Nothing from the previous file is kept.

CREATE TABLE IF NOT EXISTS public.flight_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  profile_name text NOT NULL,
  xml text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_profiles_file_name_len CHECK (char_length(file_name) BETWEEN 1 AND 180),
  CONSTRAINT flight_profiles_profile_name_len CHECK (char_length(profile_name) BETWEEN 1 AND 120),
  CONSTRAINT flight_profiles_xml_len CHECK (char_length(xml) BETWEEN 1 AND 2000000)
);

COMMENT ON TABLE public.flight_profiles IS
  'One Star Citizen flight-control profile per member. save_flight_profile replaces the previous XML.';

ALTER TABLE public.flight_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.flight_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.flight_profiles TO authenticated;

DROP POLICY IF EXISTS flight_profiles_select_own ON public.flight_profiles;
CREATE POLICY flight_profiles_select_own
  ON public.flight_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.save_flight_profile(
  p_file_name text,
  p_profile_name text,
  p_xml text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_file text;
  v_name text;
  v_xml text;
  v_saved timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to save a flight profile';
  END IF;

  v_file := regexp_replace(btrim(COALESCE(p_file_name, '')), '^.*[\\/]', '');
  v_name := btrim(COALESCE(p_profile_name, ''));
  v_xml := COALESCE(p_xml, '');

  IF char_length(v_file) < 1 OR char_length(v_file) > 180 THEN
    RAISE EXCEPTION 'Invalid profile file name';
  END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Invalid profile name';
  END IF;
  IF char_length(v_xml) < 1 OR char_length(v_xml) > 2000000 THEN
    RAISE EXCEPTION 'Flight profile must be under 2 MB';
  END IF;
  IF position('<actionmaps' IN lower(v_xml)) = 0
     OR position('<rebind' IN lower(v_xml)) = 0 THEN
    RAISE EXCEPTION 'That file is not a Star Citizen flight profile';
  END IF;

  INSERT INTO public.flight_profiles (user_id, file_name, profile_name, xml, updated_at)
  VALUES (v_uid, v_file, v_name, v_xml, v_saved)
  ON CONFLICT (user_id) DO UPDATE
    SET file_name = EXCLUDED.file_name,
        profile_name = EXCLUDED.profile_name,
        xml = EXCLUDED.xml,
        updated_at = EXCLUDED.updated_at;

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_flight_profile(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_flight_profile(text, text, text) TO authenticated;
