-- 003 blueprints catalog + target list (no org columns)

CREATE TABLE IF NOT EXISTS public.blueprint_resources (
  resource_key text PRIMARY KEY,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blueprint_resources_active_idx
  ON public.blueprint_resources (is_active)
  WHERE is_active = true;

ALTER TABLE public.blueprint_resources ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.target_list_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blueprint_id text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, blueprint_id)
);

CREATE INDEX IF NOT EXISTS target_list_blueprints_user_idx
  ON public.target_list_blueprints (user_id);

CREATE TABLE IF NOT EXISTS public.target_list_mission_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_key text NOT NULL,
  mission_label text NOT NULL,
  included boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_key)
);

CREATE INDEX IF NOT EXISTS target_list_mission_prefs_user_idx
  ON public.target_list_mission_prefs (user_id);

ALTER TABLE public.target_list_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_list_mission_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "target_list_blueprints_own" ON public.target_list_blueprints;
CREATE POLICY "target_list_blueprints_own"
  ON public.target_list_blueprints FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "target_list_mission_prefs_own" ON public.target_list_mission_prefs;
CREATE POLICY "target_list_mission_prefs_own"
  ON public.target_list_mission_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.blueprint_resources (resource_key, label, is_active)
VALUES
  ('rmc', 'RMC (Recycled Material Composite)', true),
  ('construction_material', 'Construction Material', true)
ON CONFLICT (resource_key) DO UPDATE
SET label = EXCLUDED.label, is_active = true, synced_at = now();
