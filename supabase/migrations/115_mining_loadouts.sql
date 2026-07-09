-- Per-user mining loadout planner state (synced across devices).

CREATE TABLE IF NOT EXISTS public.mining_loadout_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store jsonb NOT NULL DEFAULT '{"version":1,"vessels":{}}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mining_loadout_state_updated
  ON public.mining_loadout_state(updated_at DESC);

ALTER TABLE public.mining_loadout_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mining_loadout_select_own ON public.mining_loadout_state;
CREATE POLICY mining_loadout_select_own ON public.mining_loadout_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS mining_loadout_insert_own ON public.mining_loadout_state;
CREATE POLICY mining_loadout_insert_own ON public.mining_loadout_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mining_loadout_update_own ON public.mining_loadout_state;
CREATE POLICY mining_loadout_update_own ON public.mining_loadout_state
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mining_loadout_delete_own ON public.mining_loadout_state;
CREATE POLICY mining_loadout_delete_own ON public.mining_loadout_state
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.mining_loadout_state IS
  'Mining Tracker loadout planner: vessel laser configs and custom crafted mining heads per member.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Get current user loadout store (empty default when none saved yet)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_mining_loadout_state()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT store FROM public.mining_loadout_state WHERE user_id = auth.uid()),
    '{"version":1,"vessels":{}}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_mining_loadout_state() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Upsert full loadout store for current user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_mining_loadout_state(p_store jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_store IS NULL OR jsonb_typeof(p_store) <> 'object' THEN
    RAISE EXCEPTION 'Invalid loadout store payload';
  END IF;

  INSERT INTO public.mining_loadout_state (user_id, store, updated_at)
  VALUES (auth.uid(), p_store, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    store = EXCLUDED.store,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_mining_loadout_state(jsonb) TO authenticated;
