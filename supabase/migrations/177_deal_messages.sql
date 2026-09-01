-- =============================================================================
-- 177: Per-deal chat (Bazaar / My Listings)
-- Messages only on two-party child deals. Writes via DEFINER RPCs (no client DML).
-- Sticky bell type order_deal_message cannot be Cleared until the deal ends.
-- Personal Discord: my_order_deal_message (queue from send_deal_message only).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.deal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_messages_body_len CHECK (char_length(body) BETWEEN 1 AND 800)
);

CREATE INDEX IF NOT EXISTS deal_messages_order_created_idx
  ON public.deal_messages (order_id, created_at);

ALTER TABLE public.deal_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.deal_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.deal_messages FROM anon;
REVOKE ALL ON TABLE public.deal_messages FROM authenticated;
GRANT SELECT ON TABLE public.deal_messages TO authenticated;

DROP POLICY IF EXISTS deal_messages_select_parties ON public.deal_messages;
CREATE POLICY deal_messages_select_parties
  ON public.deal_messages
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_preview_features()
    AND (
      EXISTS (
        SELECT 1
        FROM public.custom_orders o
        WHERE o.id = deal_messages.order_id
          AND (o.requester_id = auth.uid() OR o.assignee_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.custom_orders o
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE o.id = deal_messages.order_id
          AND o.dispute_opened_at IS NOT NULL
          AND p.role IN ('officer', 'super-admin')
      )
    )
  );

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
    'my_order_deal_message',
    'my_support_reply', 'my_support_resolved',
    'my_friend_request', 'my_friend_accepted'
  ));

CREATE OR REPLACE FUNCTION public.discord_user_valid_events()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'market_wtb_new', 'market_wts_new', 'market_accepted', 'market_cancelled',
    'my_order_accepted', 'my_order_in_progress', 'my_order_ready', 'my_order_completed',
    'my_order_cancelled', 'my_order_released', 'my_order_timeout', 'my_order_noshow', 'my_order_dispute',
    'my_order_deal_message',
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
    'my_order_deal_message',
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
    SELECT 'my_order_deal_message', ds.personal_discord_enabled, 'Deal chat message',
      'When the other party sends a message on your accepted deal'::text, 'personal' FROM public.discord_settings ds WHERE ds.id = 1
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

DROP POLICY IF EXISTS "user_notifications_delete_own" ON public.user_notifications;
CREATE POLICY "user_notifications_delete_own"
  ON public.user_notifications
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND type NOT IN (
      'questionnaire_available',
      'friend_request',
      'friend_request_sent',
      'order_deal_message'
    )
  );

CREATE OR REPLACE FUNCTION public.purge_deal_messages(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.deal_messages WHERE order_id = p_order_id;
  DELETE FROM public.user_notifications
  WHERE type = 'order_deal_message'
    AND (payload ->> 'order_id') = p_order_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_deal_messages(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_deal_messages(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_deal_messages(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deal_messages(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_purge_deal_messages_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled', 'archived', 'fulfilled')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.purge_deal_messages(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_deal_messages_on_terminal ON public.custom_orders;
CREATE TRIGGER trg_purge_deal_messages_on_terminal
  AFTER UPDATE OF status ON public.custom_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purge_deal_messages_on_terminal();

CREATE OR REPLACE FUNCTION public.list_deal_messages(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.custom_orders%ROWTYPE;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF NOT public.can_access_preview_features() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not permitted');
  END IF;

  SELECT * INTO v_order FROM public.custom_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deal not found');
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

  IF v_uid <> v_order.requester_id AND v_uid <> v_order.assignee_id THEN
    IF NOT (v_order.dispute_opened_at IS NOT NULL AND v_role IN ('officer', 'super-admin')) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not a party on this deal');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'orderId', m.order_id,
        'senderId', m.sender_id,
        'body', m.body,
        'createdAt', m.created_at
      ) ORDER BY m.created_at)
      FROM public.deal_messages m
      WHERE m.order_id = p_order_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_deal_messages(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_deal_messages(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_deal_messages(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_deal_message(p_order_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.custom_orders%ROWTYPE;
  v_other uuid;
  v_body text;
  v_preview text;
  v_msg_id uuid;
  v_recent int;
  v_me_verified boolean;
  v_other_verified boolean;
  v_sender_handle text;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF NOT public.can_access_preview_features() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not permitted');
  END IF;

  v_body := trim(both from COALESCE(p_body, ''));
  IF v_body = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot be empty');
  END IF;
  IF char_length(v_body) > 800 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message is too long');
  END IF;

  SELECT * INTO v_order FROM public.custom_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deal not found');
  END IF;

  IF v_order.assignee_id IS NULL
     OR (v_order.status = 'pending' AND v_order.source_listing_id IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chat opens after both parties are on the deal');
  END IF;

  IF v_uid <> v_order.requester_id AND v_uid <> v_order.assignee_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a party on this deal');
  END IF;

  IF v_order.status NOT IN ('accepted', 'in_progress', 'ready_for_pickup')
     AND v_order.dispute_opened_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This deal is no longer open for chat');
  END IF;

  IF v_order.status IN ('completed', 'cancelled', 'archived', 'fulfilled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This deal is no longer open for chat');
  END IF;

  v_other := CASE WHEN v_uid = v_order.requester_id THEN v_order.assignee_id ELSE v_order.requester_id END;

  SELECT COALESCE(rsi_handle_verified, false) INTO v_me_verified FROM public.profiles WHERE id = v_uid;
  SELECT COALESCE(rsi_handle_verified, false) INTO v_other_verified FROM public.profiles WHERE id = v_other;
  IF NOT v_me_verified OR NOT v_other_verified THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle verification required');
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.deal_messages
  WHERE sender_id = v_uid AND created_at > now() - interval '1 minute';
  IF v_recent >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many messages — wait a moment');
  END IF;

  INSERT INTO public.deal_messages (order_id, sender_id, body)
  VALUES (p_order_id, v_uid, v_body)
  RETURNING id INTO v_msg_id;

  v_sender_handle := COALESCE(public.friend_rsi_label(v_uid), 'Member');
  v_preview := left(v_body, 160);

  SELECT id INTO v_existing
  FROM public.user_notifications
  WHERE user_id = v_other
    AND type = 'order_deal_message'
    AND (payload ->> 'order_id') = p_order_id::text
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.user_notifications
    SET title = 'New deal message',
        body = v_sender_handle || ': ' || v_preview,
        payload = jsonb_build_object(
          'order_id', p_order_id,
          'listing_type', COALESCE(v_order.listing_type, 'wtb'),
          'sender_rsi', v_sender_handle
        ),
        created_at = now(),
        read_at = NULL
    WHERE id = v_existing;
  ELSE
    PERFORM public.create_user_notification(
      v_other,
      'order_deal_message',
      'New deal message',
      v_sender_handle || ': ' || v_preview,
      jsonb_build_object(
        'order_id', p_order_id,
        'listing_type', COALESCE(v_order.listing_type, 'wtb'),
        'sender_rsi', v_sender_handle
      )
    );
  END IF;

  BEGIN
    PERFORM public.queue_discord_message(
      'my_order_deal_message',
      'New deal message: ' || left(COALESCE(v_order.title, 'Deal'), 80),
      v_sender_handle || ' sent a message',
      3723992,
      jsonb_build_array(
        jsonb_build_object('name', 'From', 'value', left(v_sender_handle, 256), 'inline', true),
        jsonb_build_object('name', 'Deal', 'value', left(COALESCE(v_order.title, 'Deal'), 256), 'inline', true),
        jsonb_build_object('name', 'Preview', 'value', left(v_preview, 256), 'inline', false)
      ),
      v_other,
      v_uid
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'deal chat discord: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', jsonb_build_object(
      'id', v_msg_id,
      'orderId', p_order_id,
      'senderId', v_uid,
      'body', v_body,
      'createdAt', now()
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_deal_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_deal_message(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_deal_message(uuid, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'deal_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_messages;
  END IF;
END $$;

COMMENT ON TABLE public.deal_messages IS
  'Per-deal chat. Client SELECT only; send via send_deal_message; purged when the deal ends.';
