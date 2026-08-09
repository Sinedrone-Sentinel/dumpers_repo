-- =============================================================================
-- 170: Personal Discord events for Friends (request + accepted)
-- =============================================================================
-- Member-subscribe events (Discord Subscribe -> My activity):
--   my_friend_request  - someone sent you a friend request
--   my_friend_accepted - someone accepted your friend request
-- Embed fields use RSI Handle only (privacy-consistent with in-app Notify).
-- Queue only from DEFINER friend RPCs (never from client queue_discord_message).
-- Requires migrations 166-169 (friend_rsi_label, send/respond friend RPCs).
-- =============================================================================

ALTER TABLE public.discord_message_queue
  DROP CONSTRAINT IF EXISTS discord_message_queue_event_type_check;

ALTER TABLE public.discord_message_queue
  ADD CONSTRAINT discord_message_queue_event_type_check
  CHECK (event_type IN (
    'orders', 'order_new', 'order_fulfilled', 'order_cancelled',
    'support', 'admin',
    'partnership_application', 'contributor_application',
    'market_wtb_new', 'market_wts_new', 'market_accepted', 'market_cancelled', 'market_coalesced',
    'my_order_accepted', 'my_order_in_progress', 'my_order_ready', 'my_order_completed',
    'my_order_cancelled', 'my_order_released', 'my_order_timeout', 'my_order_noshow', 'my_order_dispute',
    'my_support_reply', 'my_support_resolved',
    'my_friend_request', 'my_friend_accepted'
  ));

CREATE OR REPLACE FUNCTION public.discord_event_enabled(p_event_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.discord_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_settings FROM public.discord_settings WHERE id = 1;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN false;
  END IF;

  RETURN CASE
    WHEN p_event_type IN ('market_wtb_new', 'market_wts_new', 'order_new', 'orders') THEN v_settings.order_new_enabled
    WHEN p_event_type IN ('market_accepted', 'order_fulfilled') THEN v_settings.order_fulfilled_enabled
    WHEN p_event_type IN ('market_cancelled', 'order_cancelled') THEN v_settings.order_cancelled_enabled
    WHEN p_event_type = 'market_coalesced' THEN
      v_settings.orders_enabled
      AND (v_settings.order_new_enabled OR v_settings.order_cancelled_enabled)
    WHEN p_event_type LIKE 'my_order_%'
      OR p_event_type LIKE 'my_support_%'
      OR p_event_type LIKE 'my_friend_%' THEN v_settings.personal_discord_enabled
    WHEN p_event_type = 'support' THEN v_settings.support_enabled
    WHEN p_event_type = 'admin' THEN v_settings.admin_enabled
    WHEN p_event_type = 'partnership_application' THEN v_settings.partnership_application_enabled
    WHEN p_event_type = 'contributor_application' THEN v_settings.contributor_application_enabled
    ELSE true
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.discord_user_valid_events()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'market_wtb_new', 'market_wts_new', 'market_accepted', 'market_cancelled',
    'my_order_accepted', 'my_order_in_progress', 'my_order_ready', 'my_order_completed',
    'my_order_cancelled', 'my_order_released', 'my_order_timeout', 'my_order_noshow', 'my_order_dispute',
    'my_support_reply', 'my_support_resolved',
    'my_friend_request', 'my_friend_accepted'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.discord_default_user_events()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'my_order_accepted', 'my_order_ready', 'my_order_completed',
    'my_order_cancelled', 'my_order_released', 'my_order_timeout', 'my_order_noshow', 'my_order_dispute',
    'my_support_reply', 'my_support_resolved',
    'my_friend_request', 'my_friend_accepted'
  ]::text[];
$$;

DROP FUNCTION IF EXISTS public.get_discord_public_event_types();

CREATE OR REPLACE FUNCTION public.get_discord_public_event_types()
RETURNS TABLE (
  event_type text,
  enabled boolean,
  display_name text,
  description text,
  event_category text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 'my_order_accepted'::text, ds.personal_discord_enabled, 'Someone accepted my listing'::text,
      'When a counterparty accepts your WTB or WTS'::text, 'personal'::text FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_in_progress', ds.personal_discord_enabled, 'Work started on my order',
      'When craft or sale work begins on your deal'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_ready', ds.personal_discord_enabled, 'Ready for pickup',
      'When the seller marks your order ready'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_completed', ds.personal_discord_enabled, 'Pickup confirmed',
      'When the buyer confirms pickup on your sale'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_cancelled', ds.personal_discord_enabled, 'Counterparty cancelled',
      'When the other party cancels before completion'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_released', ds.personal_discord_enabled, 'Counterparty released order',
      'When your deal is released back to the marketplace pool'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_timeout', ds.personal_discord_enabled, 'Timeout / auto-released',
      'When a deal times out and returns to the pool'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_noshow', ds.personal_discord_enabled, 'No-show',
      'When pickup deadline is missed'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_order_dispute', ds.personal_discord_enabled, 'Dispute opened',
      'When a dispute is opened on your order'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_friend_request', ds.personal_discord_enabled, 'Friend request received',
      'When another member sends you a friend request (RSI Handle only)'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_friend_accepted', ds.personal_discord_enabled, 'Friend request accepted',
      'When someone accepts your friend request (RSI Handle only)'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_support_reply', ds.personal_discord_enabled, 'Support ticket reply',
      'When staff responds on your support ticket'::text, 'support' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_support_resolved', ds.personal_discord_enabled, 'Support ticket resolved',
      'When staff closes your support ticket'::text, 'support' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'market_wtb_new', ds.order_new_enabled, 'New WTB listings',
      'When anyone posts a new want-to-buy listing'::text, 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'market_wts_new', ds.order_new_enabled, 'New WTS listings',
      'When anyone posts a new want-to-sell listing'::text, 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'market_accepted', ds.order_fulfilled_enabled, 'Listing accepted',
      'When any marketplace listing is accepted'::text, 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'market_cancelled', ds.order_cancelled_enabled, 'Listing cancelled',
      'When any pending listing is cancelled'::text, 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1
  ) t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_discord_public_event_types() TO anon;
GRANT EXECUTE ON FUNCTION public.get_discord_public_event_types() TO authenticated;

-- RSI verification required for personal friend webhooks (same gate as my_order_*).
CREATE OR REPLACE FUNCTION public.sync_my_discord_event_webhooks(p_entries jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entry jsonb;
  v_event_type text;
  v_webhook_name text;
  v_webhook_url text;
  v_valid_events text[] := public.discord_user_valid_events();
  v_rsi_verified boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid webhook payload');
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    v_event_type := NULLIF(trim(v_entry->>'event_type'), '');
    v_webhook_name := NULLIF(trim(v_entry->>'webhook_name'), '');
    v_webhook_url := NULLIF(trim(v_entry->>'webhook_url'), '');

    IF v_event_type IS NULL OR NOT (v_event_type = ANY(v_valid_events)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid event type in payload');
    END IF;

    IF v_webhook_url IS NULL THEN
      PERFORM public.clear_my_discord_event_webhook(v_event_type);
      CONTINUE;
    END IF;

    IF v_event_type LIKE 'my_order_%' OR v_event_type LIKE 'my_friend_%' THEN
      SELECT rsi_handle_verified INTO v_rsi_verified
      FROM public.profiles
      WHERE id = v_user_id;

      IF NOT COALESCE(v_rsi_verified, false) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'RSI Handle verification required',
          'event_type', v_event_type
        );
      END IF;
    END IF;

    IF v_webhook_name IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Channel name required when a webhook URL is set',
        'event_type', v_event_type
      );
    END IF;

    IF NOT v_webhook_url ~ '^https://discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'
       AND NOT v_webhook_url ~ '^https://discordapp\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid Discord webhook URL format',
        'event_type', v_event_type
      );
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.discord_webhooks
      WHERE webhook_url = v_webhook_url
        AND registered_by_user_id IS DISTINCT FROM v_user_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'This Discord channel is already registered by another member',
        'event_type', v_event_type
      );
    END IF;

    PERFORM public.clear_my_discord_event_webhook(v_event_type);

    INSERT INTO public.discord_webhooks (
      webhook_url,
      webhook_name,
      subscribed_events,
      registered_by,
      registered_by_user_id
    )
    VALUES (
      v_webhook_url,
      v_webhook_name,
      ARRAY[v_event_type]::text[],
      (SELECT email FROM public.profiles WHERE id = v_user_id),
      v_user_id
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_discord_event_webhooks(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_rsi_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_lookup jsonb;
  v_target_id uuid;
  v_low uuid;
  v_high uuid;
  v_row public.friendships%ROWTYPE;
  v_my_handle text;
  v_target_handle text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_me AND p.role IS NOT NULL AND p.role <> 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved member required');
  END IF;

  v_lookup := public.search_member_for_friend_request(p_rsi_handle);
  IF NOT COALESCE((v_lookup->>'success')::boolean, false) THEN
    RETURN v_lookup;
  END IF;

  v_target_id := (v_lookup->'member'->>'id')::uuid;
  v_low := LEAST(v_me, v_target_id);
  v_high := GREATEST(v_me, v_target_id);

  INSERT INTO public.friendships (user_low, user_high, requested_by, status)
  VALUES (v_low, v_high, v_me, 'pending')
  ON CONFLICT (user_low, user_high) DO UPDATE
    SET requested_by = EXCLUDED.requested_by,
        status = 'pending',
        created_at = now(),
        responded_at = NULL
    WHERE public.friendships.status = 'denied'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not create friend request');
  END IF;

  v_my_handle := public.friend_rsi_label(v_me);
  v_target_handle := public.friend_rsi_label(v_target_id);

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  PERFORM public.create_user_notification(
    v_target_id,
    'friend_request',
    'Friend request',
    v_my_handle || ' sent you a friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', v_me
    )
  );

  PERFORM public.create_user_notification(
    v_me,
    'friend_request_sent',
    'Friend request sent',
    'Waiting for ' || v_target_handle || ' to respond.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'to_user_id', v_target_id
    )
  );

  PERFORM public.queue_discord_message(
    'my_friend_request',
    'Friend request',
    NULL,
    5793266,
    jsonb_build_array(
      jsonb_build_object(
        'name', left(v_my_handle, 256),
        'value', 'requesting friendship',
        'inline', false
      )
    ),
    v_target_id,
    v_me
  );

  RETURN jsonb_build_object('success', true, 'friendshipId', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_row public.friendships%ROWTYPE;
  v_other uuid;
  v_my_handle text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT * INTO v_row FROM public.friendships WHERE id = p_friendship_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending request not found');
  END IF;
  IF v_row.requested_by = v_me THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot respond to your own request');
  END IF;
  IF v_me <> v_row.user_low AND v_me <> v_row.user_high THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_other := public.friend_other_user(v_row, v_me);
  v_my_handle := public.friend_rsi_label(v_me);

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  IF COALESCE(p_accept, false) THEN
    UPDATE public.friendships
    SET status = 'accepted', responded_at = now()
    WHERE id = v_row.id;

    PERFORM public.create_user_notification(
      v_other,
      'friend_accepted',
      'Friend request accepted',
      v_my_handle || ' accepted your friend request.',
      jsonb_build_object(
        'friendship_id', v_row.id,
        'from_user_id', v_me
      )
    );

    PERFORM public.queue_discord_message(
      'my_friend_accepted',
      'Friend request accepted',
      NULL,
      5763719,
      jsonb_build_array(
        jsonb_build_object(
          'name', left(v_my_handle, 256),
          'value', 'accepted friendship request',
          'inline', false
        )
      ),
      v_other,
      v_me
    );

    RETURN jsonb_build_object('success', true, 'status', 'accepted');
  END IF;

  DELETE FROM public.friendships WHERE id = v_row.id;

  PERFORM public.create_user_notification(
    v_other,
    'friend_declined',
    'Friend request declined',
    v_my_handle || ' declined your friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', v_me
    )
  );

  RETURN jsonb_build_object('success', true, 'status', 'denied');
END;
$$;
