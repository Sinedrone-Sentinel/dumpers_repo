-- Replace ephemeral market listings with resource lines on custom_orders (orders are the growth table)
-- Run in Supabase SQL Editor after 025_resource_market_listings.sql

DROP TABLE IF EXISTS public.resource_buy_requests CASCADE;
DROP TABLE IF EXISTS public.resource_sale_listings CASCADE;

CREATE TABLE IF NOT EXISTS public.custom_order_resource_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  resource_label text NOT NULL,
  min_quality int NOT NULL DEFAULT 500
    CHECK (min_quality >= 0 AND min_quality <= 1000),
  quantity_scu numeric(12, 3) NOT NULL CHECK (quantity_scu > 0),
  unit_dfp_auec bigint NOT NULL DEFAULT 0 CHECK (unit_dfp_auec >= 0),
  line_dfp_auec bigint NOT NULL DEFAULT 0 CHECK (line_dfp_auec >= 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_order_resource_lines_order_idx
  ON public.custom_order_resource_lines (order_id, sort_order);

ALTER TABLE public.custom_order_resource_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_order_resource_lines_preview_all" ON public.custom_order_resource_lines;
CREATE POLICY "custom_order_resource_lines_preview_all"
  ON public.custom_order_resource_lines
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());
