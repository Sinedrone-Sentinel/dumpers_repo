-- Shop data from scunpacked (richardthombs/scunpacked)
-- Synced via super-admin Edge Function

-- ═══════════════════════════════════════════════════════════════════════════════
-- SHOPS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shops (
  id SERIAL PRIMARY KEY,
  shop_reference TEXT NOT NULL UNIQUE,       -- scunpacked reference UUID string
  name TEXT NOT NULL,                        -- "Aparelli, New Babbage"
  container_path TEXT,                       -- internal game path
  system TEXT NOT NULL DEFAULT 'Stanton',    -- Stanton, Pyro, etc.
  location TEXT,                             -- New Babbage, Hurston, HUR-L1, etc.
  location_type TEXT,                        -- city, rest_stop, orbital, station
  accepts_stolen_goods BOOLEAN DEFAULT false,
  profit_margin NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shops_system ON public.shops(system);
CREATE INDEX IF NOT EXISTS idx_shops_location ON public.shops(location);
CREATE INDEX IF NOT EXISTS idx_shops_name ON public.shops(name);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SHOP INVENTORY TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shop_inventory (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,                   -- internal name
  display_name TEXT,                         -- human readable
  item_type TEXT,                            -- QuantumDrive, Char_Clothing, etc.
  sub_type TEXT,
  base_price NUMERIC NOT NULL DEFAULT 0,
  effective_price NUMERIC,                   -- calculated with margins
  base_price_offset_pct NUMERIC DEFAULT 0,
  shop_buys BOOLEAN DEFAULT false,
  shop_sells BOOLEAN DEFAULT false,
  shop_rents BOOLEAN DEFAULT false,
  item_reference TEXT,                       -- link to items.json UUID
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_inventory_shop_id ON public.shop_inventory(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_type ON public.shop_inventory(item_type);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_display_name ON public.shop_inventory(display_name);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_sells ON public.shop_inventory(shop_sells) WHERE shop_sells = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPONENT PRICE SUMMARY TABLE
-- Aggregated prices for quick lookup on component cards
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.component_price_summary (
  id SERIAL PRIMARY KEY,
  component_name TEXT NOT NULL UNIQUE,       -- normalized display name
  component_type TEXT,                       -- QuantumDrive, Shield, etc.
  avg_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  shop_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_component_price_name ON public.component_price_summary(component_name);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYNC STATUS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shop_data_sync_status (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at TIMESTAMPTZ,
  source_url TEXT,
  source_version TEXT,
  shop_count INTEGER DEFAULT 0,
  inventory_count INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'never',
  sync_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Initialize sync status row
INSERT INTO public.shop_data_sync_status (id, sync_status)
VALUES (1, 'never')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- These are read-only reference tables, accessible to all authenticated users
-- and anonymous users (for Offline Mode)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_price_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_data_sync_status ENABLE ROW LEVEL SECURITY;

-- Shops: read for everyone
DROP POLICY IF EXISTS shops_select_all ON public.shops;
CREATE POLICY shops_select_all ON public.shops
  FOR SELECT TO authenticated, anon
  USING (true);

-- Shop inventory: read for everyone
DROP POLICY IF EXISTS shop_inventory_select_all ON public.shop_inventory;
CREATE POLICY shop_inventory_select_all ON public.shop_inventory
  FOR SELECT TO authenticated, anon
  USING (true);

-- Component price summary: read for everyone
DROP POLICY IF EXISTS component_price_summary_select_all ON public.component_price_summary;
CREATE POLICY component_price_summary_select_all ON public.component_price_summary
  FOR SELECT TO authenticated, anon
  USING (true);

-- Sync status: read for everyone
DROP POLICY IF EXISTS shop_data_sync_status_select_all ON public.shop_data_sync_status;
CREATE POLICY shop_data_sync_status_select_all ON public.shop_data_sync_status
  FOR SELECT TO authenticated, anon
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get sync status
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shop_data_sync_status()
RETURNS TABLE (
  last_synced_at TIMESTAMPTZ,
  source_version TEXT,
  shop_count INTEGER,
  inventory_count INTEGER,
  sync_status TEXT,
  sync_error TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    last_synced_at,
    source_version,
    shop_count,
    inventory_count,
    sync_status,
    sync_error
  FROM public.shop_data_sync_status
  WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_data_sync_status() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get distinct systems
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shop_systems()
RETURNS TABLE (system TEXT, shop_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT system, COUNT(*) as shop_count
  FROM public.shops
  GROUP BY system
  ORDER BY system;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_systems() TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get locations in a system
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shop_locations(p_system TEXT)
RETURNS TABLE (location TEXT, location_type TEXT, shop_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT location, location_type, COUNT(*) as shop_count
  FROM public.shops
  WHERE system = p_system AND location IS NOT NULL
  GROUP BY location, location_type
  ORDER BY location;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_locations(TEXT) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get shops at a location
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shops_at_location(p_system TEXT, p_location TEXT)
RETURNS TABLE (
  id INTEGER,
  shop_reference TEXT,
  name TEXT,
  location_type TEXT,
  accepts_stolen_goods BOOLEAN,
  profit_margin NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    shop_reference,
    name,
    location_type,
    accepts_stolen_goods,
    profit_margin
  FROM public.shops
  WHERE system = p_system 
    AND (p_location IS NULL OR location = p_location)
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_shops_at_location(TEXT, TEXT) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get shop inventory with optional filters
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shop_inventory(
  p_shop_id INTEGER,
  p_item_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_sells_only BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  item_name TEXT,
  display_name TEXT,
  item_type TEXT,
  sub_type TEXT,
  base_price NUMERIC,
  effective_price NUMERIC,
  shop_buys BOOLEAN,
  shop_sells BOOLEAN,
  shop_rents BOOLEAN,
  tags TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    item_name,
    display_name,
    item_type,
    sub_type,
    base_price,
    effective_price,
    shop_buys,
    shop_sells,
    shop_rents,
    tags
  FROM public.shop_inventory
  WHERE shop_id = p_shop_id
    AND (p_item_type IS NULL OR item_type = p_item_type)
    AND (p_search IS NULL OR display_name ILIKE '%' || p_search || '%')
    AND (p_sells_only IS NULL OR p_sells_only = false OR shop_sells = true)
  ORDER BY 
    CASE WHEN shop_sells THEN 0 ELSE 1 END,
    display_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_inventory(INTEGER, TEXT, TEXT, BOOLEAN) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get distinct item types from inventory
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shop_inventory_types()
RETURNS TABLE (item_type TEXT, item_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT item_type, COUNT(*) as item_count
  FROM public.shop_inventory
  WHERE item_type IS NOT NULL
  GROUP BY item_type
  ORDER BY item_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_inventory_types() TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get shops that sell a specific component (for Component modal)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shops_selling_component(p_component_name TEXT)
RETURNS TABLE (
  shop_id INTEGER,
  shop_name TEXT,
  location TEXT,
  system TEXT,
  effective_price NUMERIC,
  base_price NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.id as shop_id,
    s.name as shop_name,
    s.location,
    s.system,
    i.effective_price,
    i.base_price
  FROM public.shop_inventory i
  JOIN public.shops s ON s.id = i.shop_id
  WHERE i.display_name = p_component_name
    AND i.shop_sells = true
  ORDER BY i.effective_price ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_shops_selling_component(TEXT) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get component price summary (for card display)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_component_price_summaries()
RETURNS TABLE (
  component_name TEXT,
  component_type TEXT,
  avg_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  shop_count INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    component_name,
    component_type,
    avg_price,
    min_price,
    max_price,
    shop_count
  FROM public.component_price_summary
  ORDER BY component_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_component_price_summaries() TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC: Get single shop by ID (for deep linking)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_shop_by_id(p_shop_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  shop_reference TEXT,
  name TEXT,
  container_path TEXT,
  system TEXT,
  location TEXT,
  location_type TEXT,
  accepts_stolen_goods BOOLEAN,
  profit_margin NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    shop_reference,
    name,
    container_path,
    system,
    location,
    location_type,
    accepts_stolen_goods,
    profit_margin
  FROM public.shops
  WHERE id = p_shop_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_by_id(INTEGER) TO authenticated, anon;
