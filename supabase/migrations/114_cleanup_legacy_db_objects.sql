-- =============================================================================
-- Migration 114: Safe cleanup of legacy / unused database objects
--
-- Frees space on Supabase free tier by removing:
--   • sccrafter-era blueprint sync leftovers
--   • dead RPCs and columns
--   • ghost_mode (feature removed from app)
--   • RSI multi-org schema (081) — NOT franchise org logo / Discord admin
--   • game_components table — app reads bundled game-components.json
--   • any remaining shop tables/RPCs (087 defensive re-drop)
--
-- KEPT (still in use):
--   • can_access_preview_features() — order/resource RLS + RPCs
--   • org-logo storage + get_org_logo_* RPCs (franchise branding)
--   • discord_settings / discord_webhooks / send-discord (franchise Discord)
--   • game_mining, game_ordnance, game_blueprint_* tables
--
-- Pre-flight: scripts/verify-db-cleanup-candidates.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Revoke grants on functions we are about to drop
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fulfill_custom_order(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_blueprints_sync_status() FROM authenticated;
REVOKE ALL ON FUNCTION public.get_blueprint_owner_count(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_starstrings_sync_status() FROM anon;
REVOKE ALL ON FUNCTION public.get_starstrings_sync_status() FROM authenticated;

-- -----------------------------------------------------------------------------
-- 2. Drop unused RPCs
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.check_suspicious_pair(uuid);
DROP FUNCTION IF EXISTS public.process_discord_queue_simple();
DROP FUNCTION IF EXISTS public.get_blueprint_owner_count(text);
DROP FUNCTION IF EXISTS public.rpc_can_access_preview_features();
DROP FUNCTION IF EXISTS public.get_starstrings_sync_status();
DROP FUNCTION IF EXISTS public.fulfill_custom_order(uuid, text);
DROP FUNCTION IF EXISTS public.get_blueprints_sync_status();

-- -----------------------------------------------------------------------------
-- 3. Orphaned sccrafter-era blueprint sync metadata
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "blueprints_sync_meta_select" ON public.blueprints_sync_meta;
DROP TABLE IF EXISTS public.blueprints_sync_meta;

-- -----------------------------------------------------------------------------
-- 4. Remove ghost_mode from RPCs, then drop column
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_preview_features()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_current_user_role() IN ('member', 'officer', 'super-admin');
$$;

CREATE OR REPLACE FUNCTION public.get_blueprint_owner_counts(p_blueprint_ids text[])
RETURNS TABLE (
  blueprint_id text,
  owner_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ab.blueprint_id,
    COUNT(DISTINCT ab.user_id) AS owner_count
  FROM public.acquired_blueprints ab
  INNER JOIN public.profiles p ON p.id = ab.user_id
  WHERE ab.blueprint_id = ANY(p_blueprint_ids)
    AND COALESCE(p.role, 'pending') <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_users b WHERE b.id = p.id
    )
  GROUP BY ab.blueprint_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_blueprint_owner_counts(text[]) TO authenticated;

COMMENT ON FUNCTION public.get_blueprint_owner_counts(text[]) IS
  'Returns owner counts for blueprints, excluding pending and banned users';

CREATE OR REPLACE FUNCTION public.get_site_total_inventory()
RETURNS TABLE (
  resource_key text,
  quantity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.get_current_user_role(), 'pending') = 'pending' THEN
    RAISE EXCEPTION 'Approved membership required to view site totals';
  END IF;

  RETURN QUERY
  SELECT
    pri.resource_key,
    ROUND(SUM(pri.quantity)::numeric, 3) AS quantity
  FROM public.personal_resource_inventory pri
  INNER JOIN public.profiles p ON p.id = pri.user_id
  WHERE COALESCE(p.role, 'pending') <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_users b WHERE b.id = p.id
    )
    AND pri.quantity > 0
  GROUP BY pri.resource_key
  HAVING SUM(pri.quantity) > 0
  ORDER BY pri.resource_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_total_inventory() TO authenticated;

COMMENT ON FUNCTION public.get_site_total_inventory() IS
  'Sum of personal_resource_inventory across approved, non-banned members.';

CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name text;
  v_member_id uuid;
  v_price_label text;
BEGIN
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(rsi_handle, display_name, email, 'Someone')
  INTO v_requester_name
  FROM public.profiles
  WHERE id = NEW.requester_id;

  v_price_label := public.format_dfp_auec(NEW.total_dfp_auec);

  FOR v_member_id IN
    SELECT id FROM public.profiles
    WHERE role IN ('member', 'officer', 'super-admin')
    AND id != NEW.requester_id
  LOOP
    PERFORM public.create_user_notification(
      v_member_id,
      'order_new',
      'New Order Available',
      v_requester_name || ' posted: ' || NEW.title || ' · ' || v_price_label,
      jsonb_build_object('order_id', NEW.id, 'total_dfp_auec', NEW.total_dfp_auec)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP INDEX IF EXISTS public.profiles_ghost_mode_idx;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS ghost_mode;

-- -----------------------------------------------------------------------------
-- 5. Drop unused columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS preview_features_enabled;

ALTER TABLE public.blueprint_resources
  DROP COLUMN IF EXISTS description;

-- -----------------------------------------------------------------------------
-- 6. Drop RSI multi-org schema (081) — not franchise org logo / Discord admin
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.org_webhook_registration_requests CASCADE;
DROP TABLE IF EXISTS public.discord_org_webhooks CASCADE;
DROP TABLE IF EXISTS public.user_rsi_org_affiliations CASCADE;
DROP TABLE IF EXISTS public.rsi_org_ranks CASCADE;
DROP TABLE IF EXISTS public.rsi_orgs CASCADE;

-- -----------------------------------------------------------------------------
-- 7. Drop game_components — app serves bundled game-components.json
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can read game_components" ON public.game_components;
DROP POLICY IF EXISTS "Anyone can read starstrings_components" ON public.game_components;
DROP TABLE IF EXISTS public.game_components CASCADE;

CREATE OR REPLACE FUNCTION public.get_game_data_sync_status()
RETURNS TABLE (
  last_synced_at TIMESTAMPTZ,
  source_version TEXT,
  sync_status TEXT,
  sync_error TEXT,
  mining_count BIGINT,
  components_count BIGINT,
  ordnance_count BIGINT,
  blueprint_pools_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.last_synced_at,
    m.source_version,
    m.sync_status,
    m.sync_error,
    (SELECT COUNT(*) FROM public.game_mining),
    0::bigint,
    (SELECT COUNT(*) FROM public.game_ordnance),
    (SELECT COUNT(*) FROM public.game_blueprint_pools)
  FROM public.game_sync_meta m
  WHERE m.id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_game_data_sync_status() TO anon;
GRANT EXECUTE ON FUNCTION public.get_game_data_sync_status() TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. Defensive shop cleanup (087) — no Shops feature in this app
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_shop_browse_tree();
DROP FUNCTION IF EXISTS public.search_shops_by_item(TEXT);
DROP FUNCTION IF EXISTS public.get_shop_by_id(INTEGER);
DROP FUNCTION IF EXISTS public.get_shop_sites(TEXT);
DROP FUNCTION IF EXISTS public.get_shop_locations_v2(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_shops_at_location_v2(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_shop_data_sync_status();
DROP FUNCTION IF EXISTS public.get_shop_systems();
DROP FUNCTION IF EXISTS public.get_shop_locations(TEXT);
DROP FUNCTION IF EXISTS public.get_shops_at_location(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_shop_inventory(INTEGER, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.get_shop_inventory_types();
DROP FUNCTION IF EXISTS public.get_shops_selling_component(TEXT);
DROP FUNCTION IF EXISTS public.get_component_price_summaries();

DROP TABLE IF EXISTS public.shop_inventory CASCADE;
DROP TABLE IF EXISTS public.component_price_summary CASCADE;
DROP TABLE IF EXISTS public.shops CASCADE;
DROP TABLE IF EXISTS public.shop_data_sync_status CASCADE;
