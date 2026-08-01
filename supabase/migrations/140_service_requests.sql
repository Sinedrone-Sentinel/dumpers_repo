-- =============================================================================
-- 140: Partnership service requests — request fan-out + first-wins Accept
-- =============================================================================
-- Members request a service; deliveries fan out to partner webhooks (bot posts
-- Accept buttons). First Accept wins; requester gets service_request_accepted
-- with org_name + pricing_label. Personal/market Discord paths untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.service_types(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'cancelled', 'expired')),
  accepted_partner_org_id uuid REFERENCES public.partner_orgs(id) ON DELETE SET NULL,
  accepted_pricing_label text,
  accepted_by_discord_user_id text,
  accepted_by_discord_username text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_requests_requester_created_idx
  ON public.service_requests (requester_id, created_at DESC);

CREATE INDEX IF NOT EXISTS service_requests_open_idx
  ON public.service_requests (service_type_id, status)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.service_request_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  partner_org_id uuid NOT NULL REFERENCES public.partner_orgs(id) ON DELETE CASCADE,
  partner_org_service_id uuid REFERENCES public.partner_org_services(id) ON DELETE SET NULL,
  pricing_label text NOT NULL DEFAULT 'FREE',
  discord_webhook_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'posted', 'failed', 'skipped')),
  error text,
  guild_id text,
  channel_id text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  UNIQUE (request_id, partner_org_id)
);

CREATE INDEX IF NOT EXISTS service_request_deliveries_request_idx
  ON public.service_request_deliveries (request_id);

CREATE UNIQUE INDEX IF NOT EXISTS service_request_deliveries_message_unique
  ON public.service_request_deliveries (channel_id, message_id)
  WHERE channel_id IS NOT NULL AND message_id IS NOT NULL;

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.service_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_request_deliveries FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- list_requestable_service_types — active types with ≥1 offering partner
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_requestable_service_types()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', st.id,
          'slug', st.slug,
          'label', st.label,
          'description', st.description,
          'sort_order', st.sort_order,
          'active', st.active,
          'partner_count', counts.partner_count
        )
        ORDER BY st.sort_order, st.label
      )
      FROM public.service_types st
      INNER JOIN LATERAL (
        SELECT count(*)::int AS partner_count
        FROM public.partner_org_services ps
        INNER JOIN public.partner_orgs po ON po.id = ps.partner_org_id
        WHERE ps.service_type_id = st.id
          AND ps.enabled = true
          AND nullif(trim(ps.discord_webhook_url), '') IS NOT NULL
          AND po.active = true
      ) counts ON counts.partner_count > 0
      WHERE st.active = true
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_requestable_service_types() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_requestable_service_types() TO authenticated;

-- -----------------------------------------------------------------------------
-- request_service — RSI verified; 10-min cooldown per user × service
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_service(p_service_type_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_st public.service_types%ROWTYPE;
  v_rsi text;
  v_request_id uuid;
  v_recent timestamptz;
  v_orgs jsonb;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.is_rsi_verified_member() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verified RSI Handle required');
  END IF;

  IF p_service_type_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service required');
  END IF;

  SELECT * INTO v_st FROM public.service_types WHERE id = p_service_type_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown or inactive service');
  END IF;

  SELECT max(created_at) INTO v_recent
  FROM public.service_requests
  WHERE requester_id = v_uid
    AND service_type_id = p_service_type_id
    AND created_at > now() - interval '10 minutes';

  IF v_recent IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cooldown: wait before requesting this service again',
      'cooldown_seconds', greatest(
        0,
        ceil(extract(epoch FROM (v_recent + interval '10 minutes' - now())))::int
      )
    );
  END IF;

  SELECT rsi_handle INTO v_rsi FROM public.profiles WHERE id = v_uid;
  IF nullif(trim(coalesce(v_rsi, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle required');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'partner_org_id', po.id,
        'org_name', po.org_name,
        'org_sid', po.org_sid,
        'pricing_label', coalesce(nullif(trim(ps.pricing_label), ''), 'FREE'),
        'partner_org_service_id', ps.id,
        'discord_webhook_url', ps.discord_webhook_url
      )
      ORDER BY po.org_name
    ),
    '[]'::jsonb
  )
  INTO v_orgs
  FROM public.partner_org_services ps
  INNER JOIN public.partner_orgs po ON po.id = ps.partner_org_id
  WHERE ps.service_type_id = p_service_type_id
    AND ps.enabled = true
    AND po.active = true
    AND nullif(trim(ps.discord_webhook_url), '') IS NOT NULL
    AND public.partner_webhook_url_ok(ps.discord_webhook_url);

  v_count := jsonb_array_length(v_orgs);
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No partner orgs currently offer this service'
    );
  END IF;

  INSERT INTO public.service_requests (requester_id, service_type_id)
  VALUES (v_uid, p_service_type_id)
  RETURNING id INTO v_request_id;

  INSERT INTO public.service_request_deliveries (
    request_id, partner_org_id, partner_org_service_id, pricing_label, discord_webhook_url
  )
  SELECT
    v_request_id,
    (o->>'partner_org_id')::uuid,
    (o->>'partner_org_service_id')::uuid,
    coalesce(nullif(trim(o->>'pricing_label'), ''), 'FREE'),
    o->>'discord_webhook_url'
  FROM jsonb_array_elements(v_orgs) AS o;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'service_label', v_st.label,
    'service_type_id', v_st.id,
    'requester_rsi', trim(v_rsi),
    'notified_orgs', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'org_name', e->>'org_name',
            'org_sid', e->>'org_sid',
            'pricing_label', e->>'pricing_label'
          )
          ORDER BY e->>'org_name'
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(v_orgs) AS e
    ),
    'delivery_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_service(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_service(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- claim_service_request_deliveries — Edge dispatch (service_role)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_service_request_deliveries(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.service_requests%ROWTYPE;
  v_label text;
  v_rsi text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not open', 'status', v_req.status);
  END IF;

  SELECT st.label INTO v_label
  FROM public.service_types st
  WHERE st.id = v_req.service_type_id;

  SELECT rsi_handle INTO v_rsi FROM public.profiles WHERE id = v_req.requester_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_req.id,
    'requester_id', v_req.requester_id,
    'service_label', coalesce(v_label, 'Service'),
    'requester_rsi', coalesce(nullif(trim(v_rsi), ''), 'Unknown'),
    'deliveries', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'delivery_id', d.id,
            'partner_org_id', d.partner_org_id,
            'org_name', po.org_name,
            'org_sid', po.org_sid,
            'pricing_label', d.pricing_label,
            'discord_webhook_url', d.discord_webhook_url
          )
          ORDER BY po.org_name
        )
        FROM public.service_request_deliveries d
        INNER JOIN public.partner_orgs po ON po.id = d.partner_org_id
        WHERE d.request_id = p_request_id
          AND d.status = 'pending'
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_service_request_deliveries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_service_request_deliveries(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- mark / register delivery results (service_role)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_service_request_delivery(
  p_delivery_id uuid,
  p_ok boolean,
  p_channel_id text DEFAULT NULL,
  p_message_id text DEFAULT NULL,
  p_guild_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int := 0;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_ok THEN
    IF nullif(trim(coalesce(p_channel_id, '')), '') IS NULL
       OR nullif(trim(coalesce(p_message_id, '')), '') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'channel_id and message_id required');
    END IF;

    UPDATE public.service_request_deliveries
    SET
      status = 'posted',
      channel_id = trim(p_channel_id),
      message_id = trim(p_message_id),
      guild_id = nullif(trim(coalesce(p_guild_id, '')), ''),
      error = NULL,
      posted_at = now()
    WHERE id = p_delivery_id
      AND status = 'pending';
  ELSE
    UPDATE public.service_request_deliveries
    SET
      status = 'failed',
      error = left(coalesce(nullif(trim(p_error), ''), 'Post failed'), 500),
      posted_at = now()
    WHERE id = p_delivery_id
      AND status = 'pending';
  END IF;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery not found or already completed');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_service_request_delivery(uuid, boolean, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_service_request_delivery(uuid, boolean, text, text, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- accept_service_request — first-wins; notify requester with org + pricing
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_service_request(
  p_request_id uuid,
  p_discord_user_id text,
  p_discord_username text DEFAULT NULL,
  p_channel_id text DEFAULT NULL,
  p_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.service_request_deliveries%ROWTYPE;
  v_req public.service_requests%ROWTYPE;
  v_org public.partner_orgs%ROWTYPE;
  v_service_label text;
  v_messages jsonb;
  v_won boolean := false;
  v_has_delivery boolean := false;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_request_id IS NULL OR nullif(trim(coalesce(p_discord_user_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_id and discord user required');
  END IF;

  -- Resolve which partner org this Discord message belongs to
  IF nullif(trim(coalesce(p_channel_id, '')), '') IS NOT NULL
     AND nullif(trim(coalesce(p_message_id, '')), '') IS NOT NULL THEN
    SELECT * INTO v_delivery
    FROM public.service_request_deliveries
    WHERE request_id = p_request_id
      AND channel_id = trim(p_channel_id)
      AND message_id = trim(p_message_id);
    v_has_delivery := FOUND;
  END IF;

  IF NOT v_has_delivery THEN
    SELECT * INTO v_delivery
    FROM public.service_request_deliveries
    WHERE request_id = p_request_id
      AND status = 'posted'
    ORDER BY posted_at ASC NULLS LAST
    LIMIT 1;
    v_has_delivery := FOUND;
  END IF;

  IF NOT v_has_delivery THEN
    -- Not a live partnership request (may be harness test id)
    RETURN jsonb_build_object('success', false, 'error', 'Not a live service request', 'code', 'not_live');
  END IF;

  SELECT * INTO v_org FROM public.partner_orgs WHERE id = v_delivery.partner_org_id;
  SELECT st.label INTO v_service_label
  FROM public.service_requests r
  INNER JOIN public.service_types st ON st.id = r.service_type_id
  WHERE r.id = p_request_id;

  UPDATE public.service_requests
  SET
    status = 'accepted',
    accepted_partner_org_id = v_delivery.partner_org_id,
    accepted_pricing_label = v_delivery.pricing_label,
    accepted_by_discord_user_id = trim(p_discord_user_id),
    accepted_by_discord_username = nullif(trim(coalesce(p_discord_username, '')), ''),
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_request_id
    AND status = 'open'
  RETURNING * INTO v_req;

  v_won := FOUND;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'channel_id', d.channel_id,
        'message_id', d.message_id,
        'guild_id', d.guild_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_messages
  FROM public.service_request_deliveries d
  WHERE d.request_id = p_request_id
    AND d.status = 'posted'
    AND d.channel_id IS NOT NULL
    AND d.message_id IS NOT NULL;

  IF v_won THEN
    PERFORM public.create_user_notification(
      v_req.requester_id,
      'service_request_accepted',
      'Service request accepted',
      v_org.org_name || ' accepted your ' || coalesce(v_service_label, 'service') ||
        ' request · ' || coalesce(v_delivery.pricing_label, 'FREE'),
      jsonb_build_object(
        'service_request_id', v_req.id,
        'service_type_id', v_req.service_type_id,
        'service_label', coalesce(v_service_label, 'Service'),
        'partner_org_id', v_org.id,
        'org_name', v_org.org_name,
        'org_sid', v_org.org_sid,
        'pricing_label', coalesce(v_delivery.pricing_label, 'FREE')
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'won', true,
      'live', true,
      'request_id', v_req.id,
      'service_label', coalesce(v_service_label, 'Service'),
      'requester_label', (
        SELECT coalesce(nullif(trim(rsi_handle), ''), 'Requester')
        FROM public.profiles WHERE id = v_req.requester_id
      ),
      'org_name', v_org.org_name,
      'org_sid', v_org.org_sid,
      'pricing_label', coalesce(v_delivery.pricing_label, 'FREE'),
      'accepted_by_discord_user_id', v_req.accepted_by_discord_user_id,
      'accepted_by_discord_username', v_req.accepted_by_discord_username,
      'messages', v_messages
    );
  END IF;

  -- Late / already taken
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'won', false,
    'live', true,
    'request_id', v_req.id,
    'status', v_req.status,
    'service_label', coalesce(v_service_label, 'Service'),
    'requester_label', (
      SELECT coalesce(nullif(trim(rsi_handle), ''), 'Requester')
      FROM public.profiles WHERE id = v_req.requester_id
    ),
    'org_name', (
      SELECT po.org_name FROM public.partner_orgs po
      WHERE po.id = v_req.accepted_partner_org_id
    ),
    'pricing_label', v_req.accepted_pricing_label,
    'accepted_by_discord_user_id', v_req.accepted_by_discord_user_id,
    'accepted_by_discord_username', v_req.accepted_by_discord_username,
    'messages', v_messages,
    'error', 'Already taken'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_service_request(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_service_request(uuid, text, text, text, text) TO service_role;

-- Requester may confirm their own request still open (for UI poll)
CREATE OR REPLACE FUNCTION public.get_my_open_service_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'service_type_id', r.service_type_id,
          'service_label', st.label,
          'status', r.status,
          'created_at', r.created_at
        )
        ORDER BY r.created_at DESC
      )
      FROM public.service_requests r
      INNER JOIN public.service_types st ON st.id = r.service_type_id
      WHERE r.requester_id = auth.uid()
        AND r.status = 'open'
        AND r.created_at > now() - interval '2 hours'
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_open_service_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_open_service_requests() TO authenticated;

COMMENT ON TABLE public.service_requests IS
  'Member service requests fanned out to partner org Discord channels via Dumper Services bot.';
