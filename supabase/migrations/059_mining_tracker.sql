-- Mining Tracker entries for logged-in users
-- Guests use localStorage; members sync to this table

CREATE TABLE IF NOT EXISTS public.mining_tracker_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ore_name text NOT NULL,
  rarity text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, ore_name)
);

CREATE INDEX IF NOT EXISTS idx_mining_tracker_user ON public.mining_tracker_entries(user_id);

-- RLS: users can only access their own entries
ALTER TABLE public.mining_tracker_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mining_tracker_select_own ON public.mining_tracker_entries;
CREATE POLICY mining_tracker_select_own ON public.mining_tracker_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS mining_tracker_insert_own ON public.mining_tracker_entries;
CREATE POLICY mining_tracker_insert_own ON public.mining_tracker_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mining_tracker_delete_own ON public.mining_tracker_entries;
CREATE POLICY mining_tracker_delete_own ON public.mining_tracker_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Get user's mining tracker entries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_mining_tracker_entries()
RETURNS TABLE (
  id uuid,
  ore_name text,
  rarity text,
  added_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, ore_name, rarity, added_at
  FROM public.mining_tracker_entries
  WHERE user_id = auth.uid()
  ORDER BY added_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_mining_tracker_entries() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Add ore to mining tracker (upsert - ignore if already exists)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_mining_tracker_entry(
  p_ore_name text,
  p_rarity text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  INSERT INTO public.mining_tracker_entries (user_id, ore_name, rarity)
  VALUES (auth.uid(), p_ore_name, p_rarity)
  ON CONFLICT (user_id, ore_name) DO NOTHING
  RETURNING id INTO v_entry_id;
  
  IF v_entry_id IS NULL THEN
    -- Already existed
    RETURN jsonb_build_object('success', true, 'already_existed', true);
  END IF;
  
  RETURN jsonb_build_object('success', true, 'id', v_entry_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_mining_tracker_entry(text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Remove ore from mining tracker
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_mining_tracker_entry(p_ore_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.mining_tracker_entries
  WHERE user_id = auth.uid() AND ore_name = p_ore_name;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_mining_tracker_entry(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Clear all mining tracker entries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clear_mining_tracker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.mining_tracker_entries
  WHERE user_id = auth.uid();
  
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_mining_tracker() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Batch import mining tracker entries (for migration from localStorage)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.import_mining_tracker_entries(
  p_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry jsonb;
  v_imported int := 0;
BEGIN
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO public.mining_tracker_entries (user_id, ore_name, rarity)
    VALUES (
      auth.uid(),
      v_entry->>'oreName',
      v_entry->>'rarity'
    )
    ON CONFLICT (user_id, ore_name) DO NOTHING;
    
    IF FOUND THEN
      v_imported := v_imported + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'imported', v_imported);
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_mining_tracker_entries(jsonb) TO authenticated;
