-- Lists the finished VKB sheets so they can be selected.
-- Apply after 224_drop_capacitor_bookkeeping_ticker.sql. Do not edit 219-224.

INSERT INTO public.flight_gear (id, kind, listed)
VALUES
  ('scg-std', 'main', true),
  ('scg-std-lh', 'main', true),
  ('ota', 'main', true),
  ('ota-lh', 'main', true),
  ('thq', 'attach', true),
  ('thq-v', 'attach', true),
  ('atem', 'attach', true)
ON CONFLICT (id) DO UPDATE SET listed = true;
