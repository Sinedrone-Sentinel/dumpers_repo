-- =============================================================================
-- 142: Service catalog kinds, details, 30m/31m timers, informative screenshots
-- =============================================================================

-- -----------------------------------------------------------------------------
-- service_types: kind + requester prompt hint
-- -----------------------------------------------------------------------------
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS service_kind text NOT NULL DEFAULT 'actionable'
    CHECK (service_kind IN ('actionable', 'informative'));

ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS details_hint text;

UPDATE public.service_types
SET
  service_kind = 'actionable',
  details_hint = 'Hostile area or safe? Floating in space / on ground / in ship? Cause: fall/stupidity, NPC, or player?',
  label = 'Medical / SAR',
  description = 'Downed, bleed-out, body recovery, armed medevac',
  sort_order = 10
WHERE slug = 'medical';

UPDATE public.service_types
SET
  service_kind = 'actionable',
  details_hint = 'Meetup security job, or escort A→B (→C→D)? Route / objective in brief.',
  label = 'Security / Escort',
  description = 'Combat backup, protection, bunker clear',
  sort_order = 20
WHERE slug = 'security';

-- stuck_lift → transport
UPDATE public.service_types
SET
  slug = 'transport',
  label = 'Transport / lift',
  description = 'Stuck / elevator / get-me-out, plus taxi between locations',
  service_kind = 'actionable',
  details_hint = 'Where you are AND where you want to go (or “unstuck here”).',
  sort_order = 70,
  active = true
WHERE slug = 'stuck_lift';

-- ship_salvage retired (wreck tips → report_salvage)
UPDATE public.service_types
SET
  active = false,
  description = 'Retired — use Report salvage for wreck tips'
WHERE slug = 'ship_salvage';

INSERT INTO public.service_types (slug, label, description, sort_order, service_kind, details_hint, active)
VALUES
  (
    'refuel',
    'Refuel',
    'Stranded needing fuel',
    30,
    'actionable',
    'Quant? Hydrogen? Both? Ship type (e.g. Gladius, C2)? Where roughly?',
    true
  ),
  (
    'repair',
    'Repair',
    'Needs repair assist',
    40,
    'actionable',
    'What’s broken / how bad? Ship type? Where roughly?',
    true
  ),
  (
    'crimestat_removal',
    'CrimeStat removal',
    'Help clearing / handling CrimeStat (org policy dependent)',
    50,
    'actionable',
    'Current CS level if known; where you are; what you need done.',
    true
  ),
  (
    'prison_pickup',
    'Prison escape pickup',
    'Pickup after Klescher / prison exit',
    60,
    'actionable',
    'Which prison / pad; when you’re ready; where you want to go after.',
    true
  ),
  (
    'report_salvage',
    'Report salvage / abandoned ship',
    'Wreck / derelict tip for salvage orgs',
    80,
    'informative',
    'Approx how many abandoned vehicles; ship types if known; condition / hostiles optional.',
    true
  ),
  (
    'report_pirate',
    'Report pirate / hostile activity',
    'Sightings for anti-piracy orgs',
    90,
    'informative',
    'Estimated number of pirates (rough OK); list ship names if remembered (optional).',
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  service_kind = EXCLUDED.service_kind,
  details_hint = EXCLUDED.details_hint,
  active = EXCLUDED.active;

-- Ensure transport exists even if stuck_lift was never seeded
INSERT INTO public.service_types (slug, label, description, sort_order, service_kind, details_hint, active)
VALUES (
  'transport',
  'Transport / lift',
  'Stuck / elevator / get-me-out, plus taxi between locations',
  70,
  'actionable',
  'Where you are AND where you want to go (or “unstuck here”).',
  true
)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  service_kind = EXCLUDED.service_kind,
  details_hint = EXCLUDED.details_hint,
  active = true;

-- -----------------------------------------------------------------------------
-- service_requests: details + screenshot path
-- -----------------------------------------------------------------------------
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS details text;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS screenshot_path text;

ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_details_len;

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_details_len
  CHECK (details IS NULL OR char_length(details) <= 250);

-- -----------------------------------------------------------------------------
-- Storage: temporary screenshots (private; service_role + owner)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-request-screenshots',
  'service-request-screenshots',
  false,
  8388608,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "srs_select_own" ON storage.objects;
CREATE POLICY "srs_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'service-request-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "srs_insert_own" ON storage.objects;
CREATE POLICY "srs_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'service-request-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "srs_delete_own" ON storage.objects;
CREATE POLICY "srs_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'service-request-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- list_service_types — include kind + hint
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_service_types(p_active_only boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
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
          'service_kind', st.service_kind,
          'details_hint', st.details_hint
        )
        ORDER BY st.sort_order, st.label
      )
      FROM public.service_types st
      WHERE (NOT p_active_only OR st.active = true)
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_service_types(boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- list_requestable_service_types — include kind + hint
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
          'service_kind', st.service_kind,
          'details_hint', st.details_hint,
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

GRANT EXECUTE ON FUNCTION public.list_requestable_service_types() TO authenticated;

-- -----------------------------------------------------------------------------
-- request_service — details required; 31-min cooldown
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.request_service(uuid);

CREATE OR REPLACE FUNCTION public.request_service(
  p_service_type_id uuid,
  p_details text
)
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
  v_details text := trim(coalesce(p_details, ''));
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

  IF char_length(v_details) < 1 OR char_length(v_details) > 250 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Details required (1–250 characters)');
  END IF;

  SELECT * INTO v_st FROM public.service_types WHERE id = p_service_type_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown or inactive service');
  END IF;

  -- Expire any of this user's open actionable requests past 30 minutes (best-effort)
  UPDATE public.service_requests
  SET status = 'expired', updated_at = now()
  WHERE requester_id = v_uid
    AND status = 'open'
    AND created_at <= now() - interval '30 minutes';

  SELECT max(created_at) INTO v_recent
  FROM public.service_requests
  WHERE requester_id = v_uid
    AND service_type_id = p_service_type_id
    AND created_at > now() - interval '31 minutes';

  IF v_recent IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cooldown: wait before requesting this service again',
      'cooldown_seconds', greatest(
        0,
        ceil(extract(epoch FROM (v_recent + interval '31 minutes' - now())))::int
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

  INSERT INTO public.service_requests (requester_id, service_type_id, details)
  VALUES (v_uid, p_service_type_id, v_details)
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
    'service_kind', v_st.service_kind,
    'service_slug', v_st.slug,
    'requester_rsi', trim(v_rsi),
    'details', v_details,
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

REVOKE ALL ON FUNCTION public.request_service(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_service(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- attach_service_request_screenshot — owner sets path after upload
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_service_request_screenshot(
  p_request_id uuid,
  p_screenshot_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.service_requests%ROWTYPE;
  v_kind text;
  v_path text := trim(coalesce(p_screenshot_path, ''));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_req.requester_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  SELECT service_kind INTO v_kind FROM public.service_types WHERE id = v_req.service_type_id;
  IF v_kind IS DISTINCT FROM 'informative' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Screenshot only for informative tips');
  END IF;

  IF v_path = '' OR position('../' in v_path) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid screenshot path');
  END IF;

  IF split_part(v_path, '/', 1) IS DISTINCT FROM v_uid::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Screenshot path must be under your user folder');
  END IF;

  UPDATE public.service_requests
  SET screenshot_path = v_path, updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_service_request_screenshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_service_request_screenshot(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- claim_service_request_deliveries — include kind, details, screenshot
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
  v_kind text;
  v_slug text;
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

  SELECT st.label, st.service_kind, st.slug
  INTO v_label, v_kind, v_slug
  FROM public.service_types st
  WHERE st.id = v_req.service_type_id;

  SELECT rsi_handle INTO v_rsi FROM public.profiles WHERE id = v_req.requester_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_req.id,
    'requester_id', v_req.requester_id,
    'service_label', coalesce(v_label, 'Service'),
    'service_kind', coalesce(v_kind, 'actionable'),
    'service_slug', coalesce(v_slug, ''),
    'details', coalesce(v_req.details, ''),
    'screenshot_path', v_req.screenshot_path,
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

GRANT EXECUTE ON FUNCTION public.claim_service_request_deliveries(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- purge_service_request — hard delete request (+ storage path returned for Edge)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_service_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_requests
      WHERE id = p_request_id AND requester_id = auth.uid()
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not found');
    END IF;
  END IF;

  SELECT screenshot_path INTO v_path FROM public.service_requests WHERE id = p_request_id;

  DELETE FROM public.service_requests WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'screenshot_path', v_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_service_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_service_request(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- expire_open_service_requests — mark expired; return message refs for Discord
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_open_service_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_messages jsonb;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  WITH expired AS (
    UPDATE public.service_requests
    SET status = 'expired', updated_at = now()
    WHERE status = 'open'
      AND created_at <= now() - interval '30 minutes'
    RETURNING id, service_type_id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM expired;

  SELECT coalesce(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'request_id', d.request_id,
        'channel_id', d.channel_id,
        'message_id', d.message_id,
        'guild_id', d.guild_id,
        'service_label', st.label,
        'requester_label', coalesce(nullif(trim(p.rsi_handle), ''), 'Requester')
      )
    ),
    '[]'::jsonb
  )
  INTO v_messages
  FROM public.service_request_deliveries d
  INNER JOIN public.service_requests r ON r.id = d.request_id
  INNER JOIN public.service_types st ON st.id = r.service_type_id
  INNER JOIN public.profiles p ON p.id = r.requester_id
  WHERE r.id = ANY (v_ids)
    AND d.status = 'posted'
    AND d.channel_id IS NOT NULL
    AND d.message_id IS NOT NULL
    AND st.service_kind = 'actionable';

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', coalesce(array_length(v_ids, 1), 0),
    'messages', v_messages
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_open_service_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_open_service_requests() TO service_role;

-- Accept: clearer timeout message when expired
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

  -- Auto-expire this request if past lifetime before Accept race
  UPDATE public.service_requests
  SET status = 'expired', updated_at = now()
  WHERE id = p_request_id
    AND status = 'open'
    AND created_at <= now() - interval '30 minutes';

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

  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'won', false,
    'live', true,
    'timed_out', v_req.status = 'expired',
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
    'error', CASE
      WHEN v_req.status = 'expired' THEN 'Timed out'
      ELSE 'Already taken'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_service_request(uuid, text, text, text, text) TO service_role;
