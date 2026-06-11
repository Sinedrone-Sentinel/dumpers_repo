-- 053 Pending Rep Order Limits
-- Implements order limits for users with pending reputation
-- Requires all users to rate completed orders before taking new ones

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Count user's unrated completed orders (orders where they need to archive/rate)
CREATE OR REPLACE FUNCTION public.get_unrated_order_count(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.custom_orders
  WHERE status = 'completed'
    AND (
      (requester_id = p_user_id AND requester_archived_at IS NULL)
      OR (assignee_id = p_user_id AND fulfiller_archived_at IS NULL)
    );
$$;

-- Count active orders as buyer (pending through ready_for_pickup)
CREATE OR REPLACE FUNCTION public.get_active_buyer_order_count(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.custom_orders
  WHERE requester_id = p_user_id
    AND status IN ('pending', 'accepted', 'in_progress', 'ready_for_pickup');
$$;

-- Get total aUEC of active orders as buyer
CREATE OR REPLACE FUNCTION public.get_active_buyer_order_total(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(total_dfp_auec), 0)::bigint
  FROM public.custom_orders
  WHERE requester_id = p_user_id
    AND status IN ('pending', 'accepted', 'in_progress', 'ready_for_pickup');
$$;

-- Count active fulfillments (accepted through ready_for_pickup)
CREATE OR REPLACE FUNCTION public.get_active_fulfillment_count(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.custom_orders
  WHERE assignee_id = p_user_id
    AND status IN ('accepted', 'in_progress', 'ready_for_pickup');
$$;

-- Check if user has pending buyer rep (< 5 completed as buyer)
CREATE OR REPLACE FUNCTION public.has_pending_buyer_rep(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*)::int
    FROM public.custom_orders
    WHERE requester_id = p_user_id
      AND status IN ('completed', 'archived')
  ) < 5;
$$;

-- Check if user has pending fulfiller rep (< 5 completed as fulfiller)
CREATE OR REPLACE FUNCTION public.has_pending_fulfiller_rep(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*)::int
    FROM public.custom_orders
    WHERE assignee_id = p_user_id
      AND status IN ('completed', 'archived')
  ) < 5;
$$;

-- Get user's order limits status (for UI display)
CREATE OR REPLACE FUNCTION public.get_user_order_limits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unrated_count int;
  v_buyer_order_count int;
  v_buyer_order_total bigint;
  v_fulfillment_count int;
  v_has_pending_buyer_rep boolean;
  v_has_pending_fulfiller_rep boolean;
BEGIN
  v_unrated_count := public.get_unrated_order_count(p_user_id);
  v_buyer_order_count := public.get_active_buyer_order_count(p_user_id);
  v_buyer_order_total := public.get_active_buyer_order_total(p_user_id);
  v_fulfillment_count := public.get_active_fulfillment_count(p_user_id);
  v_has_pending_buyer_rep := public.has_pending_buyer_rep(p_user_id);
  v_has_pending_fulfiller_rep := public.has_pending_fulfiller_rep(p_user_id);

  RETURN jsonb_build_object(
    'unrated_count', v_unrated_count,
    'buyer_order_count', v_buyer_order_count,
    'buyer_order_total', v_buyer_order_total,
    'fulfillment_count', v_fulfillment_count,
    'has_pending_buyer_rep', v_has_pending_buyer_rep,
    'has_pending_fulfiller_rep', v_has_pending_fulfiller_rep,
    'buyer_order_limit', 2,
    'buyer_auec_limit', 1000000,
    'fulfiller_order_limit', 1,
    'can_create_order', (
      v_unrated_count = 0
      AND (NOT v_has_pending_buyer_rep OR (v_buyer_order_count < 2 AND v_buyer_order_total < 1000000))
    ),
    'can_accept_order', (
      v_unrated_count = 0
      AND (NOT v_has_pending_fulfiller_rep OR v_fulfillment_count < 1)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unrated_order_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_buyer_order_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_buyer_order_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_fulfillment_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pending_buyer_rep(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pending_fulfiller_rep(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_order_limits(uuid) TO authenticated;

-- =============================================================================
-- Create Order RPC (with RSI verification + pending rep limits)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_custom_order(
  p_title text,
  p_notes text DEFAULT NULL,
  p_total_dfp_auec bigint DEFAULT 0,
  p_min_fulfiller_reputation int DEFAULT NULL,
  p_blueprints jsonb DEFAULT '[]'::jsonb,
  p_resources jsonb DEFAULT '[]'::jsonb,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rsi_verified boolean;
  v_unrated_count int;
  v_has_pending_rep boolean;
  v_active_count int;
  v_active_total bigint;
  v_order_id uuid;
  v_bp jsonb;
  v_res jsonb;
  v_item jsonb;
  v_bp_idx int := 0;
  v_res_idx int := 0;
  v_first_bp_id text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Check preview features access
  IF NOT public.can_access_preview_features() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Feature access required');
  END IF;

  -- Check RSI verification
  SELECT rsi_handle_verified INTO v_rsi_verified
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT COALESCE(v_rsi_verified, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle verification required');
  END IF;

  -- Check for unrated completed orders
  v_unrated_count := public.get_unrated_order_count(v_user_id);
  IF v_unrated_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rate your completed orders first',
      'unrated_count', v_unrated_count
    );
  END IF;

  -- Check pending buyer rep limits
  v_has_pending_rep := public.has_pending_buyer_rep(v_user_id);
  IF v_has_pending_rep THEN
    v_active_count := public.get_active_buyer_order_count(v_user_id);
    v_active_total := public.get_active_buyer_order_total(v_user_id);

    IF v_active_count >= 2 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Order limit reached',
        'detail', 'Max 2 active orders while reputation is pending'
      );
    END IF;

    IF (v_active_total + COALESCE(p_total_dfp_auec, 0)) > 1000000 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Order limit reached',
        'detail', 'Max 1,000,000 aUEC total while reputation is pending'
      );
    END IF;
  END IF;

  -- Validate order has content
  IF jsonb_array_length(p_blueprints) = 0 AND jsonb_array_length(p_resources) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Add at least one blueprint or resource');
  END IF;

  -- Get first blueprint ID for legacy field
  IF jsonb_array_length(p_blueprints) = 1 AND jsonb_array_length(p_resources) = 0 THEN
    v_first_bp_id := p_blueprints->0->>'blueprint_id';
  END IF;

  -- Create the order
  INSERT INTO public.custom_orders (
    requester_id,
    title,
    notes,
    total_dfp_auec,
    min_fulfiller_reputation,
    blueprint_id,
    min_quality,
    quantity,
    status
  )
  VALUES (
    v_user_id,
    trim(p_title),
    nullif(trim(p_notes), ''),
    COALESCE(p_total_dfp_auec, 0),
    p_min_fulfiller_reputation,
    v_first_bp_id,
    COALESCE((p_blueprints->0->>'min_quality')::int, 500),
    COALESCE((p_blueprints->0->>'quantity')::int, 1),
    'pending'
  )
  RETURNING id INTO v_order_id;

  -- Insert blueprint lines
  FOR v_bp IN SELECT * FROM jsonb_array_elements(p_blueprints)
  LOOP
    INSERT INTO public.custom_order_blueprints (
      order_id,
      blueprint_id,
      blueprint_title,
      min_quality,
      quantity,
      unit_dfp_auec,
      line_dfp_auec,
      sort_order
    )
    VALUES (
      v_order_id,
      v_bp->>'blueprint_id',
      v_bp->>'blueprint_title',
      COALESCE((v_bp->>'min_quality')::int, 500),
      COALESCE((v_bp->>'quantity')::int, 1),
      COALESCE((v_bp->>'unit_dfp_auec')::bigint, 0),
      COALESCE((v_bp->>'line_dfp_auec')::bigint, 0),
      v_bp_idx
    );
    v_bp_idx := v_bp_idx + 1;
  END LOOP;

  -- Insert resource lines
  FOR v_res IN SELECT * FROM jsonb_array_elements(p_resources)
  LOOP
    INSERT INTO public.custom_order_resource_lines (
      order_id,
      resource_key,
      resource_label,
      min_quality,
      quantity_scu,
      unit_dfp_auec,
      line_dfp_auec,
      sort_order
    )
    VALUES (
      v_order_id,
      v_res->>'resource_key',
      v_res->>'resource_label',
      COALESCE((v_res->>'min_quality')::int, 500),
      COALESCE((v_res->>'quantity_scu')::numeric, 1),
      COALESCE((v_res->>'unit_dfp_auec')::bigint, 0),
      COALESCE((v_res->>'line_dfp_auec')::bigint, 0),
      v_res_idx
    );
    v_res_idx := v_res_idx + 1;
  END LOOP;

  -- Insert order items (resource requirements)
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
    VALUES (
      v_order_id,
      v_item->>'resource_key',
      COALESCE((v_item->>'quantity')::numeric, 1)
    );
  END LOOP;

  -- Log order creation event
  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (v_order_id, v_user_id, 'created', jsonb_build_object('total_dfp_auec', p_total_dfp_auec));

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_custom_order(text, text, bigint, int, jsonb, jsonb, jsonb) TO authenticated;

-- =============================================================================
-- Update accept_custom_order with rating check + fulfiller limits
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  bp_row record;
  assignee_name text;
  price_label text;
  fulfiller_rep int;
  fulfiller_completed int;
  v_rsi_verified boolean;
  v_unrated_count int;
  v_has_pending_rep boolean;
  v_active_count int;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  -- Check RSI verification
  SELECT rsi_handle_verified INTO v_rsi_verified
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(v_rsi_verified, false) THEN
    RAISE EXCEPTION 'RSI Handle verification required';
  END IF;

  -- Check for unrated completed orders
  v_unrated_count := public.get_unrated_order_count(auth.uid());
  IF v_unrated_count > 0 THEN
    RAISE EXCEPTION 'Rate your completed orders first (% pending)', v_unrated_count;
  END IF;

  -- Check pending fulfiller rep limits
  v_has_pending_rep := public.has_pending_fulfiller_rep(auth.uid());
  IF v_has_pending_rep THEN
    v_active_count := public.get_active_fulfillment_count(auth.uid());
    IF v_active_count >= 1 THEN
      RAISE EXCEPTION 'Fulfillment limit reached: max 1 active order while reputation is pending';
    END IF;
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be accepted';
  END IF;

  IF order_row.requester_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot accept your own order';
  END IF;

  IF order_row.min_fulfiller_reputation IS NOT NULL THEN
    SELECT COUNT(*)::int INTO fulfiller_completed
    FROM public.custom_orders
    WHERE assignee_id = auth.uid()
      AND status IN ('completed', 'archived');

    IF fulfiller_completed >= 5 THEN
      fulfiller_rep := public.user_fulfiller_reputation(auth.uid());

      IF fulfiller_rep IS NOT NULL
         AND fulfiller_rep < order_row.min_fulfiller_reputation THEN
        RAISE EXCEPTION
          'Your fulfiller reputation (%) is below the required %',
          fulfiller_rep,
          order_row.min_fulfiller_reputation;
      END IF;
    END IF;
  END IF;

  FOR bp_row IN
    SELECT blueprint_id
    FROM public.custom_order_blueprints
    WHERE order_id = p_order_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.acquired_blueprints ab
      WHERE ab.user_id = auth.uid()
        AND ab.blueprint_id = bp_row.blueprint_id
    ) THEN
      RAISE EXCEPTION 'You must own blueprint % to accept this order', bp_row.blueprint_id;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = p_order_id
  ) AND order_row.blueprint_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.acquired_blueprints ab
      WHERE ab.user_id = auth.uid()
        AND ab.blueprint_id = order_row.blueprint_id
    ) THEN
      RAISE EXCEPTION 'You must own this blueprint to accept the order';
    END IF;
  END IF;

  UPDATE public.custom_orders
  SET
    status = 'accepted',
    assignee_id = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  SELECT COALESCE(rsi_handle, display_name, email, 'A member')
  INTO assignee_name
  FROM public.profiles
  WHERE id = auth.uid();

  price_label := public.format_dfp_auec(order_row.total_dfp_auec);

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'accepted',
    jsonb_build_object(
      'assignee_id', auth.uid(),
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_accepted',
    'Order accepted',
    assignee_name || ' accepted your order: ' || order_row.title || ' · ' || price_label,
    jsonb_build_object(
      'order_id', p_order_id,
      'assignee_id', auth.uid(),
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  PERFORM public.create_user_notification(
    auth.uid(),
    'order_accepted_price',
    'You accepted an order',
    'Customer expects ' || price_label || ' for: ' || order_row.title,
    jsonb_build_object(
      'order_id', p_order_id,
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );
END;
$$;
