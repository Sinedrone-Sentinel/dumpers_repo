-- Resource market: buy requests + sale listings (preview), SCU quantities to 3 decimals
-- Run in Supabase SQL Editor after 024_order_dfp_multi_blueprint.sql

CREATE TABLE IF NOT EXISTS public.resource_buy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  resource_key text NOT NULL,
  resource_label text NOT NULL,
  min_quality int NOT NULL DEFAULT 500
    CHECK (min_quality >= 0 AND min_quality <= 1000),
  quantity_scu numeric(12, 3) NOT NULL CHECK (quantity_scu > 0),
  dfp_total_auec bigint NOT NULL DEFAULT 0 CHECK (dfp_total_auec >= 0),
  notes text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'filled', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_buy_requests_open_idx
  ON public.resource_buy_requests (status, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS resource_buy_requests_requester_idx
  ON public.resource_buy_requests (requester_id);

CREATE TABLE IF NOT EXISTS public.resource_sale_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  resource_key text NOT NULL,
  resource_label text NOT NULL,
  min_quality int NOT NULL DEFAULT 500
    CHECK (min_quality >= 0 AND min_quality <= 1000),
  quantity_scu numeric(12, 3) NOT NULL CHECK (quantity_scu > 0),
  dfp_total_auec bigint NOT NULL DEFAULT 0 CHECK (dfp_total_auec >= 0),
  notes text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'sold', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_sale_listings_open_idx
  ON public.resource_sale_listings (status, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS resource_sale_listings_seller_idx
  ON public.resource_sale_listings (seller_id);

ALTER TABLE public.resource_buy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_sale_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_buy_requests_preview_all" ON public.resource_buy_requests;
CREATE POLICY "resource_buy_requests_preview_all"
  ON public.resource_buy_requests
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

DROP POLICY IF EXISTS "resource_sale_listings_preview_all" ON public.resource_sale_listings;
CREATE POLICY "resource_sale_listings_preview_all"
  ON public.resource_sale_listings
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());
