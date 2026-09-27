-- Stock cards are one row per resource, quality, and location note.
-- Migration 121 dropped personal_resource_inventory_user_id_resource_key_quality_key
-- (the name from the squashed tracker table). Databases that added quality through
-- the earlier constraint personal_resource_inventory_user_resource_quality_key still
-- reject a second card for the same resource and quality at a different note.

ALTER TABLE public.personal_resource_inventory
  ADD COLUMN IF NOT EXISTS note_key text NOT NULL DEFAULT '';

UPDATE public.personal_resource_inventory
SET note_key = lower(trim(coalesce(note, '')))
WHERE note_key IS DISTINCT FROM lower(trim(coalesce(note, '')));

ALTER TABLE public.personal_resource_inventory
  DROP CONSTRAINT IF EXISTS personal_resource_inventory_user_resource_quality_key;

ALTER TABLE public.personal_resource_inventory
  DROP CONSTRAINT IF EXISTS personal_resource_inventory_user_id_resource_key_quality_key;

DROP INDEX IF EXISTS public.personal_resource_inventory_user_resource_quality_key;
DROP INDEX IF EXISTS public.personal_resource_inventory_user_id_resource_key_quality_key;

CREATE UNIQUE INDEX IF NOT EXISTS personal_resource_inventory_line_unique
  ON public.personal_resource_inventory (user_id, resource_key, quality, note_key);
