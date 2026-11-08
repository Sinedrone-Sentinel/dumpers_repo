-- T-Rudders Mk.V was approved and is selectable.
-- Apply after 219_flight_gear.sql. Do not edit 219.

INSERT INTO public.flight_gear (id, kind, listed)
VALUES ('t-rudder', 'peripheral', true)
ON CONFLICT (id) DO UPDATE SET listed = true;
