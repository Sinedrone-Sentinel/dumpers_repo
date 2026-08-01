-- =============================================================================
-- 135: Marketplace RLS — SELECT for members, writes via SECURITY DEFINER RPCs
-- =============================================================================
-- Replaces FOR ALL policies on order tables so approved members cannot INSERT /
-- UPDATE / DELETE via PostgREST. Mutations stay on existing RPCs (DEFINER owner
-- bypasses RLS). Adds cancel_custom_order_requester for the one client path that
-- previously did a direct status UPDATE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cancel_custom_order_requester (was client .update({ status: 'cancelled' }))
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_custom_order_requester(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  v_notify uuid;
  v_name text;
BEGIN
  IF NOT public.can_access_preview_features() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can cancel this order';
  END IF;

  -- Matches My Listings Cancel button (WTB requester, not unaccepted pending delete)
  IF order_row.listing_type = 'wts' THEN
    RAISE EXCEPTION 'Use release/abandon for WTS deals';
  END IF;

  IF order_row.status NOT IN ('pending', 'accepted', 'in_progress', 'ready_for_pickup') THEN
    RAISE EXCEPTION 'Order cannot be cancelled in status %', order_row.status;
  END IF;

  IF order_row.status = 'pending' AND order_row.assignee_id IS NULL THEN
    RAISE EXCEPTION 'Delete unaccepted pending listings instead of cancelling';
  END IF;

  v_notify := order_row.assignee_id;

  UPDATE public.custom_orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'cancelled',
    jsonb_build_object(
      'listing_type', order_row.listing_type,
      'notify_user_id', v_notify
    )
  );

  IF v_notify IS NOT NULL THEN
    SELECT COALESCE(rsi_handle, display_name, email, 'A member')
    INTO v_name
    FROM public.profiles
    WHERE id = auth.uid();

    PERFORM public.create_user_notification(
      v_notify,
      'order_cancelled',
      'Order cancelled',
      COALESCE(v_name, 'A member') || ' cancelled: ' || order_row.title,
      jsonb_build_object('order_id', p_order_id)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_custom_order_requester(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_custom_order_requester(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- custom_orders
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "custom_orders_preview_access_all" ON public.custom_orders;
DROP POLICY IF EXISTS "custom_orders_super_admin_all" ON public.custom_orders;

CREATE POLICY "custom_orders_select_approved"
  ON public.custom_orders
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

-- -----------------------------------------------------------------------------
-- custom_order_items (was super-admin FOR ALL only — open SELECT for nested reads)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "custom_order_items_super_admin_all" ON public.custom_order_items;

CREATE POLICY "custom_order_items_select_approved"
  ON public.custom_order_items
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

-- -----------------------------------------------------------------------------
-- custom_order_blueprints / resource_lines / ratings
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "custom_order_blueprints_preview_access_all" ON public.custom_order_blueprints;

CREATE POLICY "custom_order_blueprints_select_approved"
  ON public.custom_order_blueprints
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

DROP POLICY IF EXISTS "custom_order_resource_lines_preview_all" ON public.custom_order_resource_lines;

CREATE POLICY "custom_order_resource_lines_select_approved"
  ON public.custom_order_resource_lines
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

DROP POLICY IF EXISTS "custom_order_ratings_preview_all" ON public.custom_order_ratings;

CREATE POLICY "custom_order_ratings_select_approved"
  ON public.custom_order_ratings
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

-- -----------------------------------------------------------------------------
-- order_fulfillments / fulfillment_items (SELECT for approved; was super-admin ALL)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "order_fulfillments_super_admin_all" ON public.order_fulfillments;

CREATE POLICY "order_fulfillments_select_approved"
  ON public.order_fulfillments
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

DROP POLICY IF EXISTS "fulfillment_items_super_admin_all" ON public.fulfillment_items;

CREATE POLICY "fulfillment_items_select_approved"
  ON public.fulfillment_items
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());

-- order_events already SELECT-only — leave as-is.
