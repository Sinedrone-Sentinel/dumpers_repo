-- The 4.10.3 hotfix parse ingested capacitor bookkeeping (requested ammo and
-- regen cost per bullet) as "65 Blueprints changed". Those fields are not the
-- shot count. The misspellings row was attached only because that digest ran.

DELETE FROM public.whats_new_entries
WHERE version = '4.10.3-live.13220821'
  AND issue_key IN ('blueprints:changed', 'misspellings:corrected');
