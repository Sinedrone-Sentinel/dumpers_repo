-- 048 Blueprint sync from sccrafter.com
-- Stores full blueprint data in Supabase for live sync capability

-- Meta table to track sync status
CREATE TABLE IF NOT EXISTS public.blueprints_sync_meta (
  id int PRIMARY KEY DEFAULT 1,
  last_synced_at timestamptz,
  source_url text,
  source_version text,
  sync_status text DEFAULT 'never',
  sync_error text,
  blueprint_count int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial row
INSERT INTO public.blueprints_sync_meta (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Main blueprints table
CREATE TABLE IF NOT EXISTS public.synced_blueprints (
  id serial PRIMARY KEY,
  file text NOT NULL,
  record_name text NOT NULL UNIQUE,
  blueprint_name text NOT NULL,
  is_reward boolean DEFAULT false,
  slots jsonb DEFAULT '[]'::jsonb,
  reward_missions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS synced_blueprints_name_idx ON public.synced_blueprints (blueprint_name);
CREATE INDEX IF NOT EXISTS synced_blueprints_is_reward_idx ON public.synced_blueprints (is_reward);

-- Enable RLS
ALTER TABLE public.blueprints_sync_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synced_blueprints ENABLE ROW LEVEL SECURITY;

-- Public read access for sync meta
DROP POLICY IF EXISTS "blueprints_sync_meta_select" ON public.blueprints_sync_meta;
CREATE POLICY "blueprints_sync_meta_select"
  ON public.blueprints_sync_meta FOR SELECT
  USING (true);

-- Public read access for synced blueprints
DROP POLICY IF EXISTS "synced_blueprints_select" ON public.synced_blueprints;
CREATE POLICY "synced_blueprints_select"
  ON public.synced_blueprints FOR SELECT
  USING (true);

-- RPC to get blueprints sync status (for UI)
CREATE OR REPLACE FUNCTION public.get_blueprints_sync_status()
RETURNS TABLE (
  last_synced_at timestamptz,
  source_version text,
  sync_status text,
  sync_error text,
  blueprint_count int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    m.last_synced_at,
    m.source_version,
    m.sync_status,
    m.sync_error,
    m.blueprint_count
  FROM public.blueprints_sync_meta m
  WHERE m.id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_blueprints_sync_status() TO authenticated;
