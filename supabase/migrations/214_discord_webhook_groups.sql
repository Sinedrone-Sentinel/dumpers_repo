-- Member webhook groups, marketplace timing, Hangar and Franken-Fit alerts.
-- Officer demotion is delivered only to a webhook subscribed to admin_officer_demoted.

ALTER TABLE public.discord_message_queue
  DROP CONSTRAINT IF EXISTS discord_message_queue_event_type_check;

ALTER TABLE public.discord_message_queue
  ADD CONSTRAINT discord_message_queue_event_type_check
  CHECK (event_type IN (
    'orders', 'order_new', 'order_fulfilled', 'order_cancelled',
    'support', 'admin',
    'partnership_application', 'contributor_application',
    'market_wtb_new', 'market_wts_new', 'market_accepted', 'market_cancelled', 'market_coalesced',
    'market_wtb_edited', 'market_wts_edited', 'market_wtb_cancelled', 'market_wts_cancelled',
    'my_order_accepted', 'my_order_in_progress', 'my_order_ready', 'my_order_completed',
    'my_order_cancelled', 'my_order_released', 'my_order_timeout', 'my_order_noshow', 'my_order_dispute',
    'my_order_deal_message',
    'my_support_reply', 'my_support_resolved',
    'my_friend_request', 'my_friend_accepted',
    'hangar_30', 'hangar_5', 'franken_new', 'franken_updated'
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
    WHEN p_event_type IN (
      'market_wtb_new', 'market_wts_new', 'market_wtb_edited', 'market_wts_edited',
      'order_new', 'orders'
    ) THEN v_settings.order_new_enabled
    WHEN p_event_type IN ('market_accepted', 'order_fulfilled') THEN v_settings.order_fulfilled_enabled
    WHEN p_event_type IN (
      'market_cancelled', 'market_wtb_cancelled', 'market_wts_cancelled', 'order_cancelled'
    ) THEN v_settings.order_cancelled_enabled
    WHEN p_event_type = 'market_coalesced' THEN
      v_settings.orders_enabled
      AND (v_settings.order_new_enabled OR v_settings.order_cancelled_enabled)
    WHEN p_event_type LIKE 'my_%' THEN v_settings.personal_discord_enabled
    WHEN p_event_type IN ('hangar_30', 'hangar_5', 'franken_new', 'franken_updated') THEN true
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
    'market_wtb_new', 'market_wtb_edited', 'market_wtb_cancelled',
    'market_wts_new', 'market_wts_edited', 'market_wts_cancelled',
    'market_accepted',
    'my_order_accepted', 'my_order_in_progress', 'my_order_ready', 'my_order_completed',
    'my_order_cancelled', 'my_order_released', 'my_order_timeout', 'my_order_noshow', 'my_order_dispute',
    'my_order_deal_message',
    'my_support_reply', 'my_support_resolved',
    'my_friend_request', 'my_friend_accepted',
    'hangar_30', 'hangar_5', 'franken_new', 'franken_updated'
  ]::text[];
$$;

-- Keep existing marketplace subscriptions working after the edit/cancel split.
UPDATE public.discord_webhooks
SET subscribed_events = (
  SELECT COALESCE(array_agg(DISTINCT event_name), '{}')
  FROM (
    SELECT unnest(COALESCE(subscribed_events, '{}')) AS event_name
    UNION ALL
    SELECT 'market_wtb_edited' WHERE 'market_wtb_new' = ANY(subscribed_events)
    UNION ALL
    SELECT 'market_wts_edited' WHERE 'market_wts_new' = ANY(subscribed_events)
    UNION ALL
    SELECT 'market_wtb_cancelled' WHERE 'market_cancelled' = ANY(subscribed_events)
    UNION ALL
    SELECT 'market_wts_cancelled' WHERE 'market_cancelled' = ANY(subscribed_events)
  ) expanded
  WHERE event_name IS NOT NULL
    AND event_name <> 'market_cancelled'
);

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
DECLARE
  v_verified boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT COALESCE(rsi_handle_verified, false) INTO v_verified
    FROM public.profiles WHERE id = auth.uid();
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT 'my_support_reply'::text, ds.personal_discord_enabled, 'Staff reply'::text,
      'When staff responds on your ticket'::text, 'support'::text
      FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'my_support_resolved', ds.personal_discord_enabled, 'Ticket resolved',
      'When staff closes your ticket', 'support' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'hangar_30', ds.enabled, '30 minutes before',
      'Before all Executive Hangar lights turn green', 'hangar' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'hangar_5', ds.enabled, '5 minutes before',
      'Before all Executive Hangar lights turn green', 'hangar' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'franken_new', ds.enabled, 'New Franken-Fit',
      'A ship gets its first published fit', 'franken' FROM public.discord_settings ds WHERE ds.id = 1
    UNION ALL
    SELECT 'franken_updated', ds.enabled, 'Updated Franken-Fit',
      'A published fit is replaced', 'franken' FROM public.discord_settings ds WHERE ds.id = 1
  ) open_events
  UNION ALL
  SELECT * FROM (
    SELECT 'my_order_accepted'::text, ds.personal_discord_enabled, 'Someone accepted my listing'::text,
      'When a counterparty accepts your WTB or WTS'::text, 'personal'::text
      FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'market_wtb_new', ds.order_new_enabled, 'New WTB',
      'A new want-to-buy listing', 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'market_wtb_edited', ds.order_new_enabled, 'WTB edited',
      'Edits to a want-to-buy listing', 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'market_wtb_cancelled', ds.order_cancelled_enabled, 'WTB cancelled',
      'A want-to-buy listing is cancelled', 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'market_wts_new', ds.order_new_enabled, 'New WTS',
      'A new want-to-sell listing', 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'market_wts_edited', ds.order_new_enabled, 'WTS edited',
      'Edits to a want-to-sell listing', 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'market_wts_cancelled', ds.order_cancelled_enabled, 'WTS cancelled',
      'A want-to-sell listing is cancelled', 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'market_accepted', ds.order_fulfilled_enabled, 'Listing accepted',
      'Any listing is accepted', 'marketplace' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'my_friend_request', ds.personal_discord_enabled, 'Friend request received',
      'Another member sends you a friend request', 'personal' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
    UNION ALL
    SELECT 'my_friend_accepted', ds.personal_discord_enabled, 'Friend request accepted',
      'Someone accepts your friend request', 'personal' FROM public.discord_settings ds WHERE ds.id = 1 AND v_verified
  ) verified_events;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_discord_public_event_types() TO anon;
GRANT EXECUTE ON FUNCTION public.get_discord_public_event_types() TO authenticated;

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

  SELECT COALESCE(rsi_handle_verified, false) INTO v_rsi_verified
  FROM public.profiles WHERE id = v_user_id;

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

    IF (
      v_event_type LIKE 'market_%'
      OR v_event_type LIKE 'my_order_%'
      OR v_event_type LIKE 'my_friend_%'
    ) AND NOT COALESCE(v_rsi_verified, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RSI Handle verification required',
        'event_type', v_event_type
      );
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
      webhook_url, webhook_name, subscribed_events, registered_by, registered_by_user_id
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

-- Same-type bursts wait 2 minutes. Listing edits wait 5 minutes and use the edited event.
CREATE OR REPLACE FUNCTION public.discord_apply_message_timing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_key text;
  v_family text;
BEGIN
  IF NEW.title ILIKE '%Listing Updated%' THEN
    NEW.held_until := now() + interval '5 minutes';
    IF NEW.title ILIKE 'WTS %' OR COALESCE(NEW.description, '') ILIKE '%WTS%' THEN
      NEW.event_type := 'market_wts_edited';
    ELSE
      NEW.event_type := 'market_wtb_edited';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'market_cancelled' THEN
    IF COALESCE(NEW.description, '') ILIKE '%WTS%' OR NEW.title ILIKE '%WTS%' THEN
      NEW.event_type := 'market_wts_cancelled';
    ELSE
      NEW.event_type := 'market_wtb_cancelled';
    END IF;
  END IF;

  IF NEW.event_type IN (
    'market_wtb_new', 'market_wts_new', 'market_wtb_cancelled', 'market_wts_cancelled'
  ) AND NEW.actor_user_id IS NOT NULL AND TG_OP = 'INSERT' THEN
    v_family := NEW.event_type;
    v_key := 'market:burst:' || v_family || ':' || NEW.actor_user_id::text;
    SELECT id INTO v_existing_id
    FROM public.discord_message_queue
    WHERE dedupe_key = v_key
      AND processed_at IS NULL
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      PERFORM set_config('discord.burst_into', v_existing_id::text, true);
      PERFORM set_config('discord.burst_line', COALESCE(NEW.title, ''), true);
      NEW.dedupe_key := NULL;
      RETURN NEW;
    END IF;

    NEW.dedupe_key := v_key;
    NEW.held_until := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.discord_fold_market_burst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_into uuid;
BEGIN
  v_into := NULLIF(current_setting('discord.burst_into', true), '')::uuid;
  IF v_into IS NULL OR v_into = NEW.id THEN
    RETURN NEW;
  END IF;

  UPDATE public.discord_message_queue
  SET
    held_until = now() + interval '2 minutes',
    description = left(
      COALESCE(description, '') || E'\n' || COALESCE(current_setting('discord.burst_line', true), ''),
      2000
    )
  WHERE id = v_into
    AND processed_at IS NULL;

  DELETE FROM public.discord_message_queue WHERE id = NEW.id;
  PERFORM set_config('discord.burst_into', '', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS discord_fold_market_burst ON public.discord_message_queue;
CREATE TRIGGER discord_fold_market_burst
  AFTER INSERT ON public.discord_message_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.discord_fold_market_burst();

DROP TRIGGER IF EXISTS discord_apply_message_timing ON public.discord_message_queue;
CREATE TRIGGER discord_apply_message_timing
  BEFORE INSERT OR UPDATE OF title, held_until, event_type
  ON public.discord_message_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.discord_apply_message_timing();

CREATE OR REPLACE FUNCTION public.discord_enqueue_deduped(
  p_event_type text,
  p_title text,
  p_description text,
  p_color int,
  p_dedupe_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.discord_event_enabled(p_event_type) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.discord_message_queue
    WHERE dedupe_key = p_dedupe_key
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.discord_message_queue (
    event_type, title, description, color, dedupe_key
  )
  VALUES (
    p_event_type, p_title, p_description, p_color, p_dedupe_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.discord_enqueue_deduped(text, text, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discord_enqueue_deduped(text, text, text, int, text) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_franken_fit_discord()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := initcap(replace(NEW.ship_id, '_', ' '));
  PERFORM public.queue_discord_message(
    CASE WHEN TG_OP = 'INSERT' THEN 'franken_new' ELSE 'franken_updated' END,
    CASE WHEN TG_OP = 'INSERT'
      THEN 'New Franken-Fit: ' || v_name
      ELSE 'Franken-Fit updated: ' || v_name
    END,
    'Fuzy''s Franken-Fit for ' || v_name,
    16096779,
    '[]'::jsonb,
    NULL,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_franken_fit_discord ON public.ship_shop_fraken_fits;
CREATE TRIGGER notify_franken_fit_discord
  AFTER INSERT OR UPDATE ON public.ship_shop_fraken_fits
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_franken_fit_discord();

CREATE OR REPLACE FUNCTION public.admin_save_staff_webhook(
  p_group_events text[],
  p_events text[],
  p_webhook_name text,
  p_webhook_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_url text := NULLIF(trim(p_webhook_url), '');
  v_name text := NULLIF(trim(p_webhook_name), '');
BEGIN
  IF v_user_id IS NULL OR NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Super-admin required');
  END IF;

  DELETE FROM public.discord_webhooks
  WHERE registered_by_user_id = v_user_id
    AND subscribed_events && p_group_events;

  IF v_url IS NULL OR COALESCE(array_length(p_events, 1), 0) = 0 THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Channel name required');
  END IF;

  IF NOT v_url ~ '^https://discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'
     AND NOT v_url ~ '^https://discordapp\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Discord webhook URL');
  END IF;

  INSERT INTO public.discord_webhooks (
    webhook_url, webhook_name, subscribed_events, registered_by, registered_by_user_id
  )
  VALUES (
    v_url,
    v_name,
    p_events,
    (SELECT email FROM public.profiles WHERE id = v_user_id),
    v_user_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_staff_webhook(text[], text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_staff_webhook(text[], text[], text, text) TO authenticated;
