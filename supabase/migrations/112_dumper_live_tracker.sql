-- BP Dumper live mission tracker: ephemeral active missions + watch session flags

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dumper_watch_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dumper_last_ping_at timestamptz;

CREATE TABLE IF NOT EXISTS public.dumper_active_missions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_guid text NOT NULL,
  contract_definition_id text,
  debug_name text NOT NULL DEFAULT 'Unknown',
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_guid)
);

CREATE INDEX IF NOT EXISTS dumper_active_missions_user_idx
  ON public.dumper_active_missions (user_id);

ALTER TABLE public.dumper_active_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dumper_active_missions_select_own" ON public.dumper_active_missions;
CREATE POLICY "dumper_active_missions_select_own"
  ON public.dumper_active_missions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Realtime for live page subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.dumper_active_missions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'acquired_blueprints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.acquired_blueprints;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- End stale watch sessions (crash without session_end)
CREATE OR REPLACE FUNCTION public.cleanup_stale_dumper_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale_users uuid[];
  v_count integer := 0;
BEGIN
  SELECT array_agg(id) INTO v_stale_users
  FROM public.profiles
  WHERE dumper_watch_active = true
    AND (
      dumper_last_ping_at IS NULL
      OR dumper_last_ping_at < now() - interval '90 seconds'
    );

  IF v_stale_users IS NULL OR array_length(v_stale_users, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.dumper_active_missions
  WHERE user_id = ANY(v_stale_users);

  UPDATE public.profiles
  SET dumper_watch_active = false
  WHERE id = ANY(v_stale_users);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_dumper_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_dumper_sessions() TO service_role;

-- Periodic stale session cleanup (requires pg_cron from baseline migrations)
DO $setup$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup_stale_dumper_sessions');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'cleanup_stale_dumper_sessions',
    '* * * * *',
    'SELECT public.cleanup_stale_dumper_sessions()'
  );
EXCEPTION
  WHEN undefined_function THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END;
$setup$;

COMMENT ON TABLE public.dumper_active_missions IS
  'Ephemeral in-game missions synced by BP Dumper watch mode; cleared on session_end or stale timeout.';
COMMENT ON COLUMN public.profiles.dumper_watch_active IS
  'True while BP Dumper watch mode is connected for this user.';
COMMENT ON COLUMN public.profiles.dumper_last_ping_at IS
  'Last session_start, session_ping, or mission event from BP Dumper.';
