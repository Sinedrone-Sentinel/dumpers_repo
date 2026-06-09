-- Remove legacy auto-seeded personal stock rows (qty 0) from the old catalog grid.
-- My Resources cards are created explicitly via the add panel.

DELETE FROM public.personal_resource_inventory
WHERE quantity <= 0;
