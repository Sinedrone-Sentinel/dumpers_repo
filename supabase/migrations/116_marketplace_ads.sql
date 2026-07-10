-- Marketplace ads pool, live purchase toasts, dismissals, and site/profile toggles.

-- =============================================================================
-- Site settings (default off — opt-in)
-- =============================================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS marketplace_wts_ads_site_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketplace_wtb_ads_site_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketplace_purchase_toasts_site_enabled boolean NOT NULL DEFAULT false;

UPDATE public.site_settings
SET
  marketplace_wts_ads_site_enabled = COALESCE(marketplace_wts_ads_site_enabled, false),
  marketplace_wtb_ads_site_enabled = COALESCE(marketplace_wtb_ads_site_enabled, false),
  marketplace_purchase_toasts_site_enabled = COALESCE(marketplace_purchase_toasts_site_enabled, false)
WHERE id = 1;

-- =============================================================================
-- Profile toggles (default on; preserved when site disables)
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketplace_wts_ads_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketplace_wtb_ads_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketplace_purchase_toasts_enabled boolean NOT NULL DEFAULT true;

-- =============================================================================
-- Listing activity timestamp (7-day quiet period for ads)
-- =============================================================================

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS marketplace_activity_at timestamptz;

UPDATE public.custom_orders
SET marketplace_activity_at = GREATEST(created_at, updated_at)
WHERE marketplace_activity_at IS NULL;

ALTER TABLE public.custom_orders
  ALTER COLUMN marketplace_activity_at SET NOT NULL,
  ALTER COLUMN marketplace_activity_at SET DEFAULT now();

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_ad_pool (
  order_id uuid PRIMARY KEY REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('wts', 'wtb')),
  title text NOT NULL,
  total_dfp_auec bigint NOT NULL,
  requester_rsi_handle text,
  first_line_label text,
  extra_line_count int NOT NULL DEFAULT 0,
  listing_activity_at timestamptz NOT NULL,
  pool_refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_ad_dismissals (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('not_interested', 'dont_show_again', 'ooh_gimme')),
  suppressed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_purchase_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type text NOT NULL CHECK (listing_type IN ('wts', 'wtb')),
  buyer_rsi_handle text NOT NULL,
  seller_rsi_handle text NOT NULL,
  has_crafted_lines boolean NOT NULL DEFAULT false,
  has_delivered_lines boolean NOT NULL DEFAULT false,
  order_id uuid REFERENCES public.custom_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_purchase_feed_created_at_idx
  ON public.marketplace_purchase_feed (created_at DESC);

ALTER TABLE public.marketplace_ad_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_ad_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_purchase_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_ad_pool_select ON public.marketplace_ad_pool;
CREATE POLICY marketplace_ad_pool_select ON public.marketplace_ad_pool
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS marketplace_ad_dismissals_own ON public.marketplace_ad_dismissals;
CREATE POLICY marketplace_ad_dismissals_own ON public.marketplace_ad_dismissals
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS marketplace_purchase_feed_select ON public.marketplace_purchase_feed;
CREATE POLICY marketplace_purchase_feed_select ON public.marketplace_purchase_feed
  FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.marketplace_profile_label(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(rsi_handle, display_name, email, 'A member')
  FROM public.profiles
  WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_order_has_lines(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.custom_order_resource_lines WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.custom_order_items WHERE order_id = p_order_id
  )
  OR EXISTS (
    SELECT 1 FROM public.custom_orders o
    WHERE o.id = p_order_id AND o.blueprint_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_marketplace_listing_ad_eligible(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.custom_orders o
    WHERE o.id = p_order_id
      AND o.status = 'pending'
      AND o.source_listing_id IS NULL
      AND o.marketplace_activity_at <= now() - interval '7 days'
      AND public.marketplace_order_has_lines(o.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.marketplace_order_line_summary(p_order_id uuid)
RETURNS TABLE (first_line_label text, extra_line_count int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bp record;
  v_res record;
  v_total int := 0;
BEGIN
  SELECT COUNT(*)::int INTO v_total
  FROM (
    SELECT id FROM public.custom_order_blueprints WHERE order_id = p_order_id
    UNION ALL
    SELECT id FROM public.custom_order_resource_lines WHERE order_id = p_order_id
  ) lines;

  SELECT b.blueprint_title, b.quantity INTO v_bp
  FROM public.custom_order_blueprints b
  WHERE b.order_id = p_order_id
  ORDER BY b.sort_order, b.id
  LIMIT 1;

  IF FOUND THEN
    first_line_label := v_bp.blueprint_title || ' ×' || v_bp.quantity::text;
    extra_line_count := GREATEST(v_total - 1, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT r.resource_label, r.quantity_scu INTO v_res
  FROM public.custom_order_resource_lines r
  WHERE r.order_id = p_order_id
  ORDER BY r.sort_order, r.id
  LIMIT 1;

  IF FOUND THEN
    first_line_label := v_res.resource_label || ' ×' || trim_scale(v_res.quantity_scu)::text;
    extra_line_count := GREATEST(v_total - 1, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  first_line_label := NULL;
  extra_line_count := 0;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_marketplace_ad_pool_for_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.custom_orders%ROWTYPE;
  v_summary record;
BEGIN
  SELECT * INTO v_order FROM public.custom_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    DELETE FROM public.marketplace_ad_pool WHERE order_id = p_order_id;
    RETURN;
  END IF;

  IF NOT public.is_marketplace_listing_ad_eligible(p_order_id) THEN
    DELETE FROM public.marketplace_ad_pool WHERE order_id = p_order_id;
    RETURN;
  END IF;

  SELECT * INTO v_summary FROM public.marketplace_order_line_summary(p_order_id);

  INSERT INTO public.marketplace_ad_pool (
    order_id, requester_id, listing_type, title, total_dfp_auec,
    requester_rsi_handle, first_line_label, extra_line_count,
    listing_activity_at, pool_refreshed_at
  )
  VALUES (
    v_order.id,
    v_order.requester_id,
    v_order.listing_type,
    v_order.title,
    v_order.total_dfp_auec,
    public.marketplace_profile_label(v_order.requester_id),
    v_summary.first_line_label,
    COALESCE(v_summary.extra_line_count, 0),
    v_order.marketplace_activity_at,
    now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    requester_id = EXCLUDED.requester_id,
    listing_type = EXCLUDED.listing_type,
    title = EXCLUDED.title,
    total_dfp_auec = EXCLUDED.total_dfp_auec,
    requester_rsi_handle = EXCLUDED.requester_rsi_handle,
    first_line_label = EXCLUDED.first_line_label,
    extra_line_count = EXCLUDED.extra_line_count,
    listing_activity_at = EXCLUDED.listing_activity_at,
    pool_refreshed_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_marketplace_listing_activity(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.custom_orders
  SET marketplace_activity_at = now(), updated_at = now()
  WHERE id = p_order_id;

  PERFORM public.sync_marketplace_ad_pool_for_order(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_marketplace_ad_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wts_on boolean;
  v_wtb_on boolean;
  v_inserted int := 0;
  v_updated int := 0;
  v_deleted int := 0;
  v_row record;
  v_summary record;
BEGIN
  SELECT
    COALESCE(marketplace_wts_ads_site_enabled, false),
    COALESCE(marketplace_wtb_ads_site_enabled, false)
  INTO v_wts_on, v_wtb_on
  FROM public.site_settings
  WHERE id = 1;

  IF NOT v_wts_on AND NOT v_wtb_on THEN
    RETURN jsonb_build_object('inserted', 0, 'updated', 0, 'deleted', 0, 'skipped', true);
  END IF;

  FOR v_row IN
    SELECT o.*
    FROM public.custom_orders o
    WHERE o.status = 'pending'
      AND o.source_listing_id IS NULL
      AND o.marketplace_activity_at <= now() - interval '7 days'
      AND public.marketplace_order_has_lines(o.id)
      AND (
        (o.listing_type = 'wts' AND v_wts_on)
        OR (o.listing_type = 'wtb' AND v_wtb_on)
      )
  LOOP
    SELECT * INTO v_summary FROM public.marketplace_order_line_summary(v_row.id);

    INSERT INTO public.marketplace_ad_pool (
      order_id, requester_id, listing_type, title, total_dfp_auec,
      requester_rsi_handle, first_line_label, extra_line_count,
      listing_activity_at, pool_refreshed_at
    )
    VALUES (
      v_row.id,
      v_row.requester_id,
      v_row.listing_type,
      v_row.title,
      v_row.total_dfp_auec,
      public.marketplace_profile_label(v_row.requester_id),
      v_summary.first_line_label,
      COALESCE(v_summary.extra_line_count, 0),
      v_row.marketplace_activity_at,
      now()
    )
    ON CONFLICT (order_id) DO UPDATE SET
      requester_id = EXCLUDED.requester_id,
      listing_type = EXCLUDED.listing_type,
      title = EXCLUDED.title,
      total_dfp_auec = EXCLUDED.total_dfp_auec,
      requester_rsi_handle = EXCLUDED.requester_rsi_handle,
      first_line_label = EXCLUDED.first_line_label,
      extra_line_count = EXCLUDED.extra_line_count,
      listing_activity_at = EXCLUDED.listing_activity_at,
      pool_refreshed_at = now();

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  DELETE FROM public.marketplace_ad_pool p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.custom_orders o
    WHERE o.id = p.order_id
      AND o.status = 'pending'
      AND o.source_listing_id IS NULL
      AND o.marketplace_activity_at <= now() - interval '7 days'
      AND public.marketplace_order_has_lines(o.id)
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'deleted', v_deleted);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_marketplace_purchase_feed()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.marketplace_purchase_feed
  WHERE created_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_marketplace_purchase_feed(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_order public.custom_orders%ROWTYPE;
  v_listing public.custom_orders%ROWTYPE;
  v_buyer_id uuid;
  v_seller_id uuid;
  v_has_crafted boolean;
  v_has_delivered boolean;
BEGIN
  SELECT COALESCE(marketplace_purchase_toasts_site_enabled, false)
  INTO v_enabled
  FROM public.site_settings
  WHERE id = 1;

  IF NOT v_enabled THEN
    RETURN;
  END IF;

  SELECT * INTO v_order FROM public.custom_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_has_crafted := EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = p_order_id
  ) OR v_order.blueprint_id IS NOT NULL;

  v_has_delivered := EXISTS (
    SELECT 1 FROM public.custom_order_resource_lines WHERE order_id = p_order_id
  ) OR EXISTS (
    SELECT 1 FROM public.custom_order_items WHERE order_id = p_order_id
  );

  IF NOT v_has_crafted AND NOT v_has_delivered THEN
    RETURN;
  END IF;

  IF v_order.source_listing_id IS NOT NULL THEN
    SELECT * INTO v_listing FROM public.custom_orders WHERE id = v_order.source_listing_id;
    v_buyer_id := v_order.assignee_id;
    v_seller_id := v_listing.requester_id;
  ELSIF v_order.listing_type = 'wts' THEN
    v_buyer_id := v_order.assignee_id;
    v_seller_id := v_order.requester_id;
  ELSE
    v_buyer_id := v_order.requester_id;
    v_seller_id := v_order.assignee_id;
  END IF;

  INSERT INTO public.marketplace_purchase_feed (
    listing_type,
    buyer_rsi_handle,
    seller_rsi_handle,
    has_crafted_lines,
    has_delivered_lines,
    order_id
  )
  VALUES (
    CASE WHEN v_order.source_listing_id IS NOT NULL THEN 'wts' ELSE v_order.listing_type END,
    public.marketplace_profile_label(v_buyer_id),
    public.marketplace_profile_label(v_seller_id),
    v_has_crafted,
    v_has_delivered,
    p_order_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_marketplace_ad_candidates(p_limit int DEFAULT 50)
RETURNS SETOF public.marketplace_ad_pool
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wts_site boolean;
  v_wtb_site boolean;
  v_wts_user boolean;
  v_wtb_user boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(s.marketplace_wts_ads_site_enabled, false),
    COALESCE(s.marketplace_wtb_ads_site_enabled, false)
  INTO v_wts_site, v_wtb_site
  FROM public.site_settings s
  WHERE s.id = 1;

  SELECT
    COALESCE(p.marketplace_wts_ads_enabled, true),
    COALESCE(p.marketplace_wtb_ads_enabled, true)
  INTO v_wts_user, v_wtb_user
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT v_wts_site AND NOT v_wtb_site THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.marketplace_ad_pool p
  WHERE p.requester_id <> v_uid
    AND (
      (p.listing_type = 'wts' AND v_wts_site AND v_wts_user)
      OR (p.listing_type = 'wtb' AND v_wtb_site AND v_wtb_user)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.marketplace_ad_dismissals d
      WHERE d.user_id = v_uid
        AND d.order_id = p.order_id
        AND (
          d.suppressed_until > now()
          OR (d.suppressed_until IS NULL AND d.action IN ('dont_show_again', 'ooh_gimme'))
        )
    )
  ORDER BY random()
  LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_marketplace_ad_valid(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_ad_pool p
    JOIN public.custom_orders o ON o.id = p.order_id
    WHERE p.order_id = p_order_id
      AND public.is_marketplace_listing_ad_eligible(p.order_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.record_marketplace_ad_action(p_order_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wts_site boolean;
  v_wtb_site boolean;
  v_listing_type text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_action NOT IN ('not_interested', 'dont_show_again', 'ooh_gimme') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  SELECT listing_type INTO v_listing_type
  FROM public.custom_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT
    COALESCE(marketplace_wts_ads_site_enabled, false),
    COALESCE(marketplace_wtb_ads_site_enabled, false)
  INTO v_wts_site, v_wtb_site
  FROM public.site_settings
  WHERE id = 1;

  IF (v_listing_type = 'wts' AND NOT v_wts_site)
     OR (v_listing_type = 'wtb' AND NOT v_wtb_site) THEN
    RAISE EXCEPTION 'Marketplace ads disabled site-wide';
  END IF;

  INSERT INTO public.marketplace_ad_dismissals (user_id, order_id, action, suppressed_until)
  VALUES (
    v_uid,
    p_order_id,
    p_action,
    CASE WHEN p_action = 'not_interested' THEN now() + interval '72 hours' ELSE NULL END
  )
  ON CONFLICT (user_id, order_id) DO UPDATE SET
    action = EXCLUDED.action,
    suppressed_until = EXCLUDED.suppressed_until,
    created_at = now();
END;
$$;

-- =============================================================================
-- Super-admin site toggles
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_site_marketplace_wts_ads(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  UPDATE public.site_settings
  SET marketplace_wts_ads_site_enabled = p_enabled, updated_at = now()
  WHERE id = 1;

  IF NOT p_enabled THEN
    DELETE FROM public.marketplace_ad_dismissals d
    USING public.custom_orders o
    WHERE d.order_id = o.id AND o.listing_type = 'wts';

    DELETE FROM public.marketplace_ad_pool WHERE listing_type = 'wts';
  ELSE
    PERFORM public.refresh_marketplace_ad_pool();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_site_marketplace_wtb_ads(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  UPDATE public.site_settings
  SET marketplace_wtb_ads_site_enabled = p_enabled, updated_at = now()
  WHERE id = 1;

  IF NOT p_enabled THEN
    DELETE FROM public.marketplace_ad_dismissals d
    USING public.custom_orders o
    WHERE d.order_id = o.id AND o.listing_type = 'wtb';

    DELETE FROM public.marketplace_ad_pool WHERE listing_type = 'wtb';
  ELSE
    PERFORM public.refresh_marketplace_ad_pool();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_site_marketplace_purchase_toasts(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  UPDATE public.site_settings
  SET marketplace_purchase_toasts_site_enabled = p_enabled, updated_at = now()
  WHERE id = 1;

  IF NOT p_enabled THEN
    TRUNCATE public.marketplace_purchase_feed;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_marketplace_ad_pool() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_ad_candidates(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_marketplace_ad_valid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketplace_ad_action(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_site_marketplace_wts_ads(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_site_marketplace_wtb_ads(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_site_marketplace_purchase_toasts(boolean) TO authenticated;

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_marketplace_order_pool_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.marketplace_ad_pool WHERE order_id = OLD.id;
    DELETE FROM public.marketplace_ad_dismissals WHERE order_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    DELETE FROM public.marketplace_ad_pool WHERE order_id = NEW.id;
    DELETE FROM public.marketplace_ad_dismissals WHERE order_id = NEW.id;
  END IF;

  IF NEW.marketplace_activity_at IS DISTINCT FROM OLD.marketplace_activity_at
     AND NEW.marketplace_activity_at > OLD.marketplace_activity_at THEN
    PERFORM public.sync_marketplace_ad_pool_for_order(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_order_pool_sync ON public.custom_orders;
CREATE TRIGGER marketplace_order_pool_sync
  AFTER UPDATE OR DELETE ON public.custom_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_marketplace_order_pool_sync();

-- =============================================================================
-- Cron jobs
-- =============================================================================

DO $setup$
BEGIN
  BEGIN
    PERFORM cron.unschedule('refresh_marketplace_ad_pool');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule(
    'refresh_marketplace_ad_pool',
    '0 3 * * *',
    'SELECT public.refresh_marketplace_ad_pool()'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END;
$setup$;

-- =============================================================================
-- Hook existing order RPCs (marketplace activity + live purchase feed)
-- =============================================================================

-- accept_custom_order: live purchase toast on full accept
CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  bp_row record;
  assignee_name text;
  price_label text;
  fulfiller_rep int;
  fulfiller_completed int;
  buyer_rep int;
  buyer_completed int;
  v_rsi_verified boolean;
  v_unrated_count int;
  v_has_pending_rep boolean;
  v_active_count int;
  v_active_total bigint;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  SELECT rsi_handle_verified INTO v_rsi_verified FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_rsi_verified, false) THEN
    RAISE EXCEPTION 'RSI Handle verification required';
  END IF;

  v_unrated_count := public.get_unrated_order_count(auth.uid());
  IF v_unrated_count > 0 THEN
    RAISE EXCEPTION 'Rate your completed orders first (%) pending', v_unrated_count;
  END IF;

  SELECT * INTO order_row FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_row.status <> 'pending' THEN RAISE EXCEPTION 'Only pending orders can be accepted'; END IF;
  IF order_row.requester_id = auth.uid() THEN RAISE EXCEPTION 'You cannot accept your own order'; END IF;
  IF order_row.source_listing_id IS NOT NULL THEN
    RAISE EXCEPTION 'This is a purchase order, not an open listing';
  END IF;

  IF order_row.listing_type = 'wts' THEN
    IF NOT COALESCE(order_row.sell_entire_listing, true) THEN
      RAISE EXCEPTION 'This listing allows partial purchases — select items and quantities to buy';
    END IF;

    v_has_pending_rep := public.has_pending_buyer_rep(auth.uid());
    IF v_has_pending_rep THEN
      v_active_count := public.get_active_buyer_order_count(auth.uid());
      IF v_active_count >= 2 THEN
        RAISE EXCEPTION 'Order limit reached: max 2 active purchases while reputation is pending';
      END IF;
      v_active_total := public.get_active_buyer_order_total(auth.uid());
      IF (v_active_total + order_row.total_dfp_auec) > 1000000 THEN
        RAISE EXCEPTION 'Order limit reached: max 1,000,000 aUEC total while reputation is pending';
      END IF;
    END IF;

    IF order_row.min_fulfiller_reputation IS NOT NULL THEN
      SELECT COUNT(*)::int INTO buyer_completed
      FROM public.custom_orders
      WHERE assignee_id = auth.uid() AND listing_type = 'wts'
        AND status IN ('completed', 'archived');
      IF buyer_completed >= 5 THEN
        buyer_rep := public.user_buyer_reputation(auth.uid());
        IF buyer_rep IS NOT NULL AND buyer_rep < order_row.min_fulfiller_reputation THEN
          RAISE EXCEPTION 'Your buyer reputation (%) is below the required %', buyer_rep, order_row.min_fulfiller_reputation;
        END IF;
      END IF;
    END IF;
  ELSE
    v_has_pending_rep := public.has_pending_fulfiller_rep(auth.uid());
    IF v_has_pending_rep THEN
      v_active_count := public.get_active_fulfiller_count(auth.uid());
      IF v_active_count >= 1 THEN
        RAISE EXCEPTION 'Fulfillment limit reached: max 1 active order while reputation is pending';
      END IF;
    END IF;

    IF order_row.min_fulfiller_reputation IS NOT NULL THEN
      SELECT COUNT(*)::int INTO fulfiller_completed
      FROM public.custom_orders
      WHERE assignee_id = auth.uid() AND listing_type = 'wtb'
        AND status IN ('completed', 'archived');
      IF fulfiller_completed >= 5 THEN
        fulfiller_rep := public.user_fulfiller_reputation(auth.uid());
        IF fulfiller_rep IS NOT NULL AND fulfiller_rep < order_row.min_fulfiller_reputation THEN
          RAISE EXCEPTION 'Your fulfiller reputation (%) is below the required %', fulfiller_rep, order_row.min_fulfiller_reputation;
        END IF;
      END IF;
    END IF;

    FOR bp_row IN SELECT blueprint_id FROM public.custom_order_blueprints WHERE order_id = p_order_id LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.acquired_blueprints ab
        WHERE ab.user_id = auth.uid() AND ab.blueprint_id = bp_row.blueprint_id
      ) THEN
        RAISE EXCEPTION 'You must own blueprint % to accept this order', bp_row.blueprint_id;
      END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.custom_order_blueprints WHERE order_id = p_order_id)
       AND order_row.blueprint_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.acquired_blueprints ab
        WHERE ab.user_id = auth.uid() AND ab.blueprint_id = order_row.blueprint_id
      ) THEN
        RAISE EXCEPTION 'You must own this blueprint to accept the order';
      END IF;
    END IF;
  END IF;

  UPDATE public.custom_orders
  SET status = 'accepted', assignee_id = auth.uid(), accepted_at = now(), updated_at = now()
  WHERE id = p_order_id;

  SELECT COALESCE(rsi_handle, display_name, email, 'A member') INTO assignee_name FROM public.profiles WHERE id = auth.uid();
  price_label := public.format_dfp_auec(order_row.total_dfp_auec);

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (p_order_id, auth.uid(), 'accepted', jsonb_build_object('assignee_id', auth.uid(), 'listing_type', order_row.listing_type));

  IF order_row.listing_type = 'wts' THEN
    PERFORM public.create_user_notification(
      order_row.requester_id, 'order_accepted', 'Listing accepted',
      assignee_name || ' accepted your sell listing: ' || order_row.title || ' · ' || price_label,
      jsonb_build_object('order_id', p_order_id, 'listing_type', 'wts')
    );
  ELSE
    PERFORM public.create_user_notification(
      order_row.requester_id, 'order_accepted', 'Order accepted',
      assignee_name || ' accepted your order: ' || order_row.title || ' · ' || price_label,
      jsonb_build_object('order_id', p_order_id)
    );
    PERFORM public.create_user_notification(
      auth.uid(), 'order_accepted_price', 'You accepted an order',
      'Customer expects ' || price_label || ' for: ' || order_row.title,
      jsonb_build_object('order_id', p_order_id)
    );
  END IF;

  PERFORM public.insert_marketplace_purchase_feed(p_order_id);
END;
$$;

DO $setup$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup_marketplace_purchase_feed');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule(
    'cleanup_marketplace_purchase_feed',
    '0 * * * *',
    'SELECT public.cleanup_marketplace_purchase_feed()'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END;
$setup$;

DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'marketplace_purchase_feed'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_purchase_feed;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$realtime$;
