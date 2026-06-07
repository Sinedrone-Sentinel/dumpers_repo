-- Dynamic resource catalog derived from blueprint crafting requirements.
-- Synced from the client when blueprints data changes (super-admin).
-- Run in Supabase SQL Editor after 006_operations.sql

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

CREATE POLICY "blueprint_resources_super_admin_all"
  ON public.blueprint_resources
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Backfill catalog rows for any inventory that existed before dynamic sync
INSERT INTO public.blueprint_resources (resource_key, label, is_active)
SELECT resource_key, resource_key, true
FROM public.resource_inventory
ON CONFLICT (resource_key) DO NOTHING;

-- Tie inventory rows to catalog entries
DO $$ BEGIN
  ALTER TABLE public.resource_inventory
    ADD CONSTRAINT resource_inventory_resource_key_fkey
    FOREIGN KEY (resource_key)
    REFERENCES public.blueprint_resources (resource_key)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
