-- Per-event webhook rows (083) allow the same channel URL on many event types.
-- market_coalesced matches WTB/WTS/cancelled with &&, so one digest was POSTed
-- once per matching row (often 3× to the same channel). Deduplicate every webhook
-- lookup by webhook_url so each destination gets one POST per queued message.

CREATE OR REPLACE FUNCTION public.get_discord_webhooks_for_market_event(
  p_event_type text,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  webhook_url text,
  webhook_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (dw.webhook_url)
    dw.id,
    dw.webhook_url,
    dw.webhook_name
  FROM public.discord_webhooks dw
  WHERE dw.active = true
    AND (
      (
        p_event_type = 'market_coalesced'
        AND dw.subscribed_events && ARRAY['market_wtb_new', 'market_wts_new', 'market_cancelled']::text[]
      )
      OR (
        p_event_type <> 'market_coalesced'
        AND p_event_type = ANY(dw.subscribed_events)
      )
    )
    AND (p_exclude_user_id IS NULL OR dw.registered_by_user_id IS DISTINCT FROM p_exclude_user_id)
  ORDER BY dw.webhook_url, dw.created_at ASC NULLS LAST, dw.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_discord_webhooks_for_personal_event(
  p_event_type text,
  p_target_user_id uuid
)
RETURNS TABLE (
  id uuid,
  webhook_url text,
  webhook_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (dw.webhook_url)
    dw.id,
    dw.webhook_url,
    dw.webhook_name
  FROM public.discord_webhooks dw
  WHERE dw.active = true
    AND dw.registered_by_user_id = p_target_user_id
    AND p_event_type = ANY(dw.subscribed_events)
  ORDER BY dw.webhook_url, dw.created_at ASC NULLS LAST, dw.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_discord_webhooks_for_event(p_event_type text)
RETURNS TABLE (
  id uuid,
  webhook_url text,
  webhook_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (dw.webhook_url)
    dw.id,
    dw.webhook_url,
    dw.webhook_name
  FROM public.discord_webhooks dw
  WHERE dw.active = true
    AND p_event_type = ANY(dw.subscribed_events)
  ORDER BY dw.webhook_url, dw.created_at ASC NULLS LAST, dw.id ASC;
END;
$$;
