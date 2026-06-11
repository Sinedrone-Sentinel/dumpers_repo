-- 054 Order Abuse Prevention
-- Anti-abuse measures for pending rep users
-- Includes: min order value, duplicate detection, auto-reporting, rep reset, cleanup

-- =============================================================================
-- Abuse Tracking Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_abuse_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blueprint_id text NOT NULL,
  attempt_date date NOT NULL DEFAULT CURRENT_DATE,
  attempt_count int NOT NULL DEFAULT 1,
  reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, blueprint_id, attempt_date)
);

CREATE INDEX IF NOT EXISTS order_abuse_attempts_user_idx
  ON public.order_abuse_attempts (user_id, attempt_date);

ALTER TABLE public.order_abuse_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_abuse_attempts_officer_read" ON public.order_abuse_attempts;
CREATE POLICY "order_abuse_attempts_officer_read"
  ON public.order_abuse_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('officer', 'super-admin')
    )
  );

-- =============================================================================
-- Helper: Check for duplicate single-blueprint orders
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_duplicate_single_bp_order(
  p_user_id uuid,
  p_blueprint_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_order_id uuid;
  v_active_order_id uuid;
BEGIN
  -- Check for PENDING order with same single blueprint
  SELECT o.id INTO v_pending_order_id
  FROM public.custom_orders o
  WHERE o.requester_id = p_user_id
    AND o.status = 'pending'
    AND o.blueprint_id = p_blueprint_id
    AND NOT EXISTS (
      SELECT 1 FROM public.custom_order_blueprints ob
      WHERE ob.order_id = o.id
      AND ob.blueprint_id != p_blueprint_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.custom_order_resource_lines
      WHERE order_id = o.id
    )
  LIMIT 1;

  IF v_pending_order_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'has_duplicate', true,
      'duplicate_type', 'pending',
      'existing_order_id', v_pending_order_id
    );
  END IF;

  -- Check for ACCEPTED or IN_PROGRESS order with same single blueprint
  SELECT o.id INTO v_active_order_id
  FROM public.custom_orders o
  WHERE o.requester_id = p_user_id
    AND o.status IN ('accepted', 'in_progress', 'ready_for_pickup')
    AND o.blueprint_id = p_blueprint_id
    AND NOT EXISTS (
      SELECT 1 FROM public.custom_order_blueprints ob
      WHERE ob.order_id = o.id
      AND ob.blueprint_id != p_blueprint_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.custom_order_resource_lines
      WHERE order_id = o.id
    )
  LIMIT 1;

  IF v_active_order_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'has_duplicate', true,
      'duplicate_type', 'active',
      'existing_order_id', v_active_order_id
    );
  END IF;

  RETURN jsonb_build_object('has_duplicate', false);
END;
$$;

-- =============================================================================
-- Helper: Track abuse attempt and check if should report
-- =============================================================================

CREATE OR REPLACE FUNCTION public.track_abuse_attempt(
  p_user_id uuid,
  p_blueprint_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_count int;
  v_should_report boolean := false;
BEGIN
  -- Insert or increment attempt count for today
  INSERT INTO public.order_abuse_attempts (user_id, blueprint_id, attempt_date, attempt_count)
  VALUES (p_user_id, p_blueprint_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, blueprint_id, attempt_date)
  DO UPDATE SET attempt_count = order_abuse_attempts.attempt_count + 1
  RETURNING attempt_count INTO v_attempt_count;

  -- Check if this is the 3rd attempt today (and not already reported)
  IF v_attempt_count >= 3 THEN
    SELECT reported_at IS NULL INTO v_should_report
    FROM public.order_abuse_attempts
    WHERE user_id = p_user_id
      AND blueprint_id = p_blueprint_id
      AND attempt_date = CURRENT_DATE;
  END IF;

  RETURN jsonb_build_object(
    'attempt_count', v_attempt_count,
    'should_report', v_should_report
  );
END;
$$;

-- =============================================================================
-- Auto-Report Function: Create support ticket for suspicious activity
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_abuse_report(
  p_user_id uuid,
  p_blueprint_id text,
  p_attempt_count int,
  p_fulfiller_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_user_name text;
  v_fulfiller_name text;
  v_body text;
BEGIN
  -- Get user display name
  SELECT COALESCE(rsi_handle, display_name, email, 'Unknown user')
  INTO v_user_name
  FROM public.profiles
  WHERE id = p_user_id;

  -- Build report body
  v_body := 'Automated suspicious activity detection:' || E'\n\n';
  v_body := v_body || 'User: ' || v_user_name || E'\n';
  v_body := v_body || 'Blueprint: ' || p_blueprint_id || E'\n';
  v_body := v_body || 'Blocked attempts today: ' || p_attempt_count || E'\n';

  -- Add fulfiller info if suspicious pair detected
  IF p_fulfiller_id IS NOT NULL THEN
    SELECT COALESCE(rsi_handle, display_name, email, 'Unknown')
    INTO v_fulfiller_name
    FROM public.profiles
    WHERE id = p_fulfiller_id;

    v_body := v_body || E'\nSuspicious pair detected - same fulfiller for multiple orders: ' || v_fulfiller_name;
  END IF;

  v_body := v_body || E'\n\nThis user has repeatedly attempted to create duplicate orders for the same blueprint while another order is being fulfilled. This may indicate an attempt to game the reputation system.';

  -- Create support ticket (system-generated, no requester)
  INSERT INTO public.support_tickets (
    requester_id,
    category,
    subject,
    status
  )
  VALUES (
    p_user_id,  -- The user being reported becomes the "requester" for tracking
    'member_report',
    '[System] Suspicious order activity: ' || v_user_name,
    'open'
  )
  RETURNING id INTO v_ticket_id;

  -- Add the report as a message
  INSERT INTO public.ticket_messages (
    ticket_id,
    author_id,
    content,
    is_staff
  )
  VALUES (
    v_ticket_id,
    NULL,
    v_body,
    true
  );

  -- Mark the attempt as reported
  UPDATE public.order_abuse_attempts
  SET reported_at = now()
  WHERE user_id = p_user_id
    AND blueprint_id = p_blueprint_id
    AND attempt_date = CURRENT_DATE;

  RETURN v_ticket_id;
END;
$$;

-- =============================================================================
-- Suspicious Pair Detection
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_suspicious_pair(p_buyer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_fulfiller_id uuid;
  v_consecutive_count int := 0;
  v_order record;
BEGIN
  -- Check last 3 completed orders for this buyer
  FOR v_order IN
    SELECT assignee_id
    FROM public.custom_orders
    WHERE requester_id = p_buyer_id
      AND status IN ('completed', 'archived')
      AND assignee_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 3
  LOOP
    IF v_last_fulfiller_id IS NULL THEN
      v_last_fulfiller_id := v_order.assignee_id;
      v_consecutive_count := 1;
    ELSIF v_order.assignee_id = v_last_fulfiller_id THEN
      v_consecutive_count := v_consecutive_count + 1;
    ELSE
      EXIT;  -- Different fulfiller, stop counting
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'is_suspicious', v_consecutive_count >= 3,
    'consecutive_count', v_consecutive_count,
    'fulfiller_id', v_last_fulfiller_id
  );
END;
$$;

-- =============================================================================
-- Updated create_custom_order with abuse prevention
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
  v_is_single_bp boolean;
  v_dupe_check jsonb;
  v_abuse_track jsonb;
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
      'error_type', 'unrated',
      'unrated_count', v_unrated_count
    );
  END IF;

  -- Validate order has content
  IF jsonb_array_length(p_blueprints) = 0 AND jsonb_array_length(p_resources) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Add at least one blueprint or resource');
  END IF;

  -- Check if this is a single-blueprint order
  v_is_single_bp := jsonb_array_length(p_blueprints) = 1 AND jsonb_array_length(p_resources) = 0;
  
  IF v_is_single_bp THEN
    v_first_bp_id := p_blueprints->0->>'blueprint_id';
  END IF;

  -- Check pending buyer rep limits
  v_has_pending_rep := public.has_pending_buyer_rep(v_user_id);
  
  IF v_has_pending_rep THEN
    -- MINIMUM ORDER VALUE: 10,000 aUEC for pending rep
    IF COALESCE(p_total_dfp_auec, 0) < 10000 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Minimum order value is 10,000 aUEC while reputation is pending',
        'error_type', 'min_value',
        'min_value', 10000
      );
    END IF;

    -- DUPLICATE SINGLE-BP DETECTION
    IF v_is_single_bp THEN
      v_dupe_check := public.check_duplicate_single_bp_order(v_user_id, v_first_bp_id);
      
      IF (v_dupe_check->>'has_duplicate')::boolean THEN
        IF v_dupe_check->>'duplicate_type' = 'pending' THEN
          -- Force redirect to edit existing pending order
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Pending order found with same Blueprint. Pulling your existing order back for editing.',
            'error_type', 'duplicate_pending',
            'existing_order_id', v_dupe_check->>'existing_order_id'
          );
        ELSE
          -- Block: active order exists, track attempt
          v_abuse_track := public.track_abuse_attempt(v_user_id, v_first_bp_id);
          
          -- Create auto-report if 3+ attempts today
          IF (v_abuse_track->>'should_report')::boolean THEN
            PERFORM public.create_abuse_report(
              v_user_id,
              v_first_bp_id,
              (v_abuse_track->>'attempt_count')::int
            );
          END IF;
          
          RETURN jsonb_build_object(
            'success', false,
            'error', 'You already have an active order for this blueprint being fulfilled. Please wait for it to complete.',
            'error_type', 'duplicate_active',
            'existing_order_id', v_dupe_check->>'existing_order_id',
            'attempt_count', v_abuse_track->>'attempt_count'
          );
        END IF;
      END IF;
    END IF;

    -- Check order count limit
    v_active_count := public.get_active_buyer_order_count(v_user_id);
    IF v_active_count >= 2 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Order limit reached',
        'error_type', 'order_limit',
        'detail', 'Max 2 active orders while reputation is pending'
      );
    END IF;

    -- Check total aUEC limit
    v_active_total := public.get_active_buyer_order_total(v_user_id);
    IF (v_active_total + COALESCE(p_total_dfp_auec, 0)) > 1000000 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Order limit reached',
        'error_type', 'auec_limit',
        'detail', 'Max 1,000,000 aUEC total while reputation is pending'
      );
    END IF;
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

-- =============================================================================
-- Rep Reset Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reset_user_buyer_rep(
  p_target_user_id uuid,
  p_clear_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  v_deleted_ratings int;
  v_deleted_orders int := 0;
BEGIN
  -- Check caller is officer+
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  -- Officers can only reset members, super-admin can reset anyone
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF v_caller_role = 'officer' AND v_target_role IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reset reputation of officers or admins');
  END IF;

  -- Delete ratings where user was rated AS A BUYER (by fulfillers)
  DELETE FROM public.custom_order_ratings
  WHERE ratee_id = p_target_user_id
    AND rater_role = 'fulfiller';
  GET DIAGNOSTICS v_deleted_ratings = ROW_COUNT;

  -- Optionally clear archived orders where user was requester
  IF p_clear_archived THEN
    DELETE FROM public.custom_orders
    WHERE requester_id = p_target_user_id
      AND status = 'archived';
    GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;
  END IF;

  -- Log the action
  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    NULL,
    auth.uid(),
    'admin_buyer_rep_reset',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'deleted_ratings', v_deleted_ratings,
      'deleted_orders', v_deleted_orders,
      'cleared_archived', p_clear_archived
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_ratings', v_deleted_ratings,
    'deleted_orders', v_deleted_orders
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_fulfiller_rep(
  p_target_user_id uuid,
  p_clear_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  v_deleted_ratings int;
  v_deleted_orders int := 0;
BEGIN
  -- Check caller is officer+
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  -- Officers can only reset members, super-admin can reset anyone
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF v_caller_role = 'officer' AND v_target_role IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reset reputation of officers or admins');
  END IF;

  -- Delete ratings where user was rated AS A FULFILLER (by buyers)
  DELETE FROM public.custom_order_ratings
  WHERE ratee_id = p_target_user_id
    AND rater_role = 'requester';
  GET DIAGNOSTICS v_deleted_ratings = ROW_COUNT;

  -- Optionally clear archived orders where user was assignee
  IF p_clear_archived THEN
    DELETE FROM public.custom_orders
    WHERE assignee_id = p_target_user_id
      AND status = 'archived';
    GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;
  END IF;

  -- Log the action
  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    NULL,
    auth.uid(),
    'admin_fulfiller_rep_reset',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'deleted_ratings', v_deleted_ratings,
      'deleted_orders', v_deleted_orders,
      'cleared_archived', p_clear_archived
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_ratings', v_deleted_ratings,
    'deleted_orders', v_deleted_orders
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_buyer_rep(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_fulfiller_rep(uuid, boolean) TO authenticated;

-- =============================================================================
-- Cleanup Function (for pg_cron)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_archived_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count int;
BEGIN
  -- Delete archived orders older than 30 days
  -- Note: Ratings are preserved since they don't have CASCADE
  DELETE FROM public.custom_orders
  WHERE status = 'archived'
    AND updated_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Also clean up old abuse attempt records (older than 30 days)
  DELETE FROM public.order_abuse_attempts
  WHERE attempt_date < CURRENT_DATE - 30;
  
  RETURN v_deleted_count;
END;
$$;

-- =============================================================================
-- pg_cron Job (run this manually in Supabase SQL editor after enabling pg_cron)
-- =============================================================================

-- To enable pg_cron:
-- 1. Go to Supabase Dashboard > Database > Extensions
-- 2. Enable pg_cron
-- 3. Then run this in SQL editor:

/*
SELECT cron.schedule(
  'cleanup-archived-orders',
  '0 0 * * *',  -- Daily at midnight UTC
  $$SELECT public.cleanup_old_archived_orders()$$
);
*/

-- To verify the job is scheduled:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('cleanup-archived-orders');

-- =============================================================================
-- Update get_user_order_limits to include min_value
-- =============================================================================

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
    'buyer_min_order_value', 10000,
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
