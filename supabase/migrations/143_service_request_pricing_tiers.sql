-- =============================================================================
-- 143: FREE vs FEE service request tiers
-- =============================================================================
-- Members see FREE SERVICES and FEE SERVICES separately. The same catalog type
-- (e.g. Medical) can appear in both when different orgs offer FREE vs paid.
-- request_service only notifies orgs matching the clicked tier. Discord embeds
-- show FREE/FEE from the snapshotted delivery pricing_label.
-- =============================================================================

-- Helper: normalize partner pricing to FREE vs FEE
CREATE OR REPLACE FUNCTION public.partner_pricing_is_free(p_pricing_label text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(trim(coalesce(nullif(trim(p_pricing_label), ''), 'FREE'))) = 'FREE';
$$;

REVOKE ALL ON FUNCTION public.partner_pricing_is_free(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_pricing_is_free(text) TO authenticated, service_role;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS pricing_tier text;

UPDATE public.service_requests
SET pricing_tier = CASE
  WHEN public.partner_pricing_is_free(accepted_pricing_label) THEN 'FREE'
  WHEN accepted_pricing_label IS NOT NULL THEN 'FEE'
  ELSE 'FEE'
END
WHERE pricing_tier IS NULL;

ALTER TABLE public.service_requests
  ALTER COLUMN pricing_tier SET DEFAULT 'FEE';

ALTER TABLE public.service_requests
  ALTER COLUMN pricing_tier SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_requests_pricing_tier_check'
  ) THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_pricing_tier_check
      CHECK (pricing_tier IN ('FREE', 'FEE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS service_requests_requester_type_tier_created_idx
  ON public.service_requests (requester_id, service_type_id, pricing_tier, created_at DESC);

-- -----------------------------------------------------------------------------
-- list_requestable_service_types — one row per (type × FREE|FEE) with partners
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
          'id', x.id,
          'slug', x.slug,
          'label', x.label,
          'description', x.description,
          'sort_order', x.sort_order,
          'active', x.active,
          'service_kind', x.service_kind,
          'details_hint', x.details_hint,
          'pricing_tier', x.pricing_tier,
          'partner_count', x.partner_count
        )
        ORDER BY x.tier_sort, x.sort_order, x.label
      )
      FROM (
        SELECT
          st.id,
          st.slug,
          st.label,
          st.description,
          st.sort_order,
          st.active,
          st.service_kind,
          st.details_hint,
          tier.pricing_tier,
          CASE tier.pricing_tier WHEN 'FREE' THEN 0 ELSE 1 END AS tier_sort,
          counts.partner_count
        FROM public.service_types st
        CROSS JOIN (VALUES ('FREE'::text), ('FEE'::text)) AS tier(pricing_tier)
        INNER JOIN LATERAL (
          SELECT count(*)::int AS partner_count
          FROM public.partner_org_services ps
          INNER JOIN public.partner_orgs po ON po.id = ps.partner_org_id
          WHERE ps.service_type_id = st.id
            AND ps.enabled = true
            AND nullif(trim(ps.discord_webhook_url), '') IS NOT NULL
            AND po.active = true
            AND (
              (tier.pricing_tier = 'FREE' AND public.partner_pricing_is_free(ps.pricing_label))
              OR
              (tier.pricing_tier = 'FEE' AND NOT public.partner_pricing_is_free(ps.pricing_label))
            )
        ) counts ON counts.partner_count > 0
        WHERE st.active = true
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_requestable_service_types() TO authenticated;

-- -----------------------------------------------------------------------------
-- request_service — filter orgs by FREE / FEE tier
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.request_service(uuid, text);

CREATE OR REPLACE FUNCTION public.request_service(
  p_service_type_id uuid,
  p_details text,
  p_pricing_tier text DEFAULT 'FEE'
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
  v_tier text := upper(trim(coalesce(p_pricing_tier, '')));
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

  IF v_tier NOT IN ('FREE', 'FEE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pricing tier must be FREE or FEE');
  END IF;

  IF char_length(v_details) < 1 OR char_length(v_details) > 250 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Details required (1–250 characters)');
  END IF;

  SELECT * INTO v_st FROM public.service_types WHERE id = p_service_type_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown or inactive service');
  END IF;

  UPDATE public.service_requests
  SET status = 'expired', updated_at = now()
  WHERE requester_id = v_uid
    AND status = 'open'
    AND created_at <= now() - interval '30 minutes';

  -- Cooldown is per service type × pricing tier (FREE Medical ≠ FEE Medical)
  SELECT max(created_at) INTO v_recent
  FROM public.service_requests
  WHERE requester_id = v_uid
    AND service_type_id = p_service_type_id
    AND pricing_tier = v_tier
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
    AND public.partner_webhook_url_ok(ps.discord_webhook_url)
    AND (
      (v_tier = 'FREE' AND public.partner_pricing_is_free(ps.pricing_label))
      OR
      (v_tier = 'FEE' AND NOT public.partner_pricing_is_free(ps.pricing_label))
    );

  v_count := jsonb_array_length(v_orgs);
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      CASE v_tier
        WHEN 'FREE' THEN 'No partner orgs currently offer this service for FREE'
        ELSE 'No partner orgs currently offer this service for a fee'
      END
    );
  END IF;

  INSERT INTO public.service_requests (requester_id, service_type_id, details, pricing_tier)
  VALUES (v_uid, p_service_type_id, v_details, v_tier)
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
    'pricing_tier', v_tier,
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

REVOKE ALL ON FUNCTION public.request_service(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_service(uuid, text, text) TO authenticated;
