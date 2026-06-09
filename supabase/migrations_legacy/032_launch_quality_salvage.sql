-- Launch preview features to all approved members; expand quality range; add salvage resources.

CREATE OR REPLACE FUNCTION public.can_access_preview_features()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role(), 'pending') <> 'pending';
$$;

ALTER TABLE public.personal_resource_inventory
  DROP CONSTRAINT IF EXISTS personal_resource_inventory_quality_check;

ALTER TABLE public.personal_resource_inventory
  ADD CONSTRAINT personal_resource_inventory_quality_check
    CHECK (quality >= 0 AND quality <= 1000);

INSERT INTO public.blueprint_resources (resource_key, label, is_active)
VALUES
  ('rmc', 'RMC (Recycled Material Composite)', true),
  ('construction_material', 'Construction Material', true)
ON CONFLICT (resource_key) DO UPDATE
SET
  label = EXCLUDED.label,
  is_active = true,
  synced_at = now();
