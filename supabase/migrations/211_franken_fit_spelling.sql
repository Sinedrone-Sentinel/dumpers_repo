-- Member-facing spelling is Franken-Fit. Names from 210 stay in place.

COMMENT ON TABLE public.ship_shop_fraken_owner IS
  'Single account allowed to publish Fuzy''s Franken-Fit. Pinned by user id, not by RSI handle.';

COMMENT ON TABLE public.ship_shop_fraken_fits IS
  'One view-only Franken-Fit per ship. Reads go through get_ship_shop_fraken_fit. Writes go through save_ship_shop_fraken_fit.';

UPDATE public.whats_new_entries
SET
  headline = replace(headline, 'Fraken-Fit', 'Franken-Fit'),
  items = replace(items::text, 'Fraken-Fit', 'Franken-Fit')::jsonb
WHERE headline LIKE '%Fraken-Fit%'
   OR items::text LIKE '%Fraken-Fit%';
