-- =============================================================================
-- 139: Org Partnership — applications, service catalog, partner webhooks
-- =============================================================================
-- Requires 138 (partnership_application support category).
-- Pending applications open a support ticket (officer notify + staff Discord).
-- Partner Discord webhooks are separate from personal/market discord_webhooks.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_org_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_sid text NOT NULL,
  org_name text NOT NULL,
  org_url text,
  applicant_role_claim text,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn')),
  support_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_org_applications_pending_unique
  ON public.partner_org_applications (applicant_id, lower(org_sid))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS partner_org_applications_status_idx
  ON public.partner_org_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_sid text NOT NULL UNIQUE,
  org_name text NOT NULL,
  application_id uuid REFERENCES public.partner_org_applications(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_org_managers (
  partner_org_id uuid NOT NULL REFERENCES public.partner_orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_org_id, user_id)
);

CREATE INDEX IF NOT EXISTS partner_org_managers_user_idx
  ON public.partner_org_managers (user_id);

CREATE TABLE IF NOT EXISTS public.partner_org_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_org_id uuid NOT NULL REFERENCES public.partner_orgs(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  pricing_label text NOT NULL DEFAULT 'FREE',
  discord_webhook_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_org_id, service_type_id)
);

ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_org_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_org_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_org_services ENABLE ROW LEVEL SECURITY;

-- Reads via RPCs; no direct table grants for members
REVOKE ALL ON TABLE public.service_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.partner_org_applications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.partner_orgs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.partner_org_managers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.partner_org_services FROM PUBLIC, anon, authenticated;

INSERT INTO public.service_types (slug, label, description, sort_order) VALUES
  ('medical', 'Medical', 'Medics / healing / recovery assistance', 10),
  ('stuck_lift', 'Stuck / Lift', 'Players stuck or needing a lift', 20),
  ('security', 'Security', 'Escort / defense / security response', 30),
  ('ship_salvage', 'Ship Salvaging', 'Salvage / recovery of wrecks and hulls', 40)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_rsi_verified_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND rsi_handle_verified = true
      AND role IS DISTINCT FROM 'pending'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_partner_org_manager(p_partner_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_org_managers
    WHERE partner_org_id = p_partner_org_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.partner_webhook_url_ok(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_url IS NULL OR length(trim(p_url)) = 0 THEN
    RETURN true; -- empty clears
  END IF;
  RETURN trim(p_url) ~* '^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/.+';
END;
$$;

-- -----------------------------------------------------------------------------
-- Patch create_support_ticket label for new category
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category support_ticket_category,
  p_subject text,
  p_content text,
  p_reported_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_assignee_id uuid := NULL;
  v_reported_role text;
  v_category_label text;
  v_officer_id uuid;
BEGIN
  IF p_category = 'member_report' AND p_reported_user_id IS NOT NULL THEN
    SELECT role INTO v_reported_role
    FROM public.profiles
    WHERE id = p_reported_user_id;

    IF v_reported_role IN ('officer', 'super-admin') THEN
      SELECT id INTO v_assignee_id
      FROM public.profiles
      WHERE role = 'super-admin'
        AND id != auth.uid()
      ORDER BY random()
      LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.support_tickets (
    requester_id, category, subject, reported_user_id, assignee_id, status
  )
  VALUES (
    auth.uid(),
    p_category,
    p_subject,
    p_reported_user_id,
    v_assignee_id,
    CASE
      WHEN v_assignee_id IS NOT NULL THEN 'assigned'::support_ticket_status
      ELSE 'open'::support_ticket_status
    END
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, author_id, content, is_staff)
  VALUES (v_ticket_id, auth.uid(), p_content, false);

  v_category_label := CASE p_category::text
    WHEN 'bug_report' THEN 'Bug Report'
    WHEN 'member_report' THEN 'Member Report'
    WHEN 'rsi_verification' THEN 'RSI Verification Issue'
    WHEN 'partnership_application' THEN 'Partnership Application'
    ELSE initcap(replace(p_category::text, '_', ' '))
  END;

  IF v_assignee_id IS NOT NULL THEN
    PERFORM public.create_user_notification(
      v_assignee_id,
      'support_ticket_new',
      'New Support Ticket Assigned',
      v_category_label || ': ' || p_subject,
      jsonb_build_object('ticket_id', v_ticket_id)
    );
  ELSE
    FOR v_officer_id IN
      SELECT id FROM public.profiles
      WHERE role IN ('officer', 'super-admin')
        AND id != auth.uid()
    LOOP
      PERFORM public.create_user_notification(
        v_officer_id,
        'support_ticket_new',
        'New Support Ticket',
        v_category_label || ': ' || p_subject,
        jsonb_build_object('ticket_id', v_ticket_id)
      );
    END LOOP;
  END IF;

  PERFORM public.queue_discord_message(
    'support',
    'New Support Ticket',
    'A new support ticket has been submitted',
    9131814,
    jsonb_build_array(
      jsonb_build_object('name', 'Category', 'value', v_category_label, 'inline', true),
      jsonb_build_object(
        'name', 'Ticket ID',
        'value', left(v_ticket_id::text, 8),
        'inline', true
      )
    ),
    NULL,
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(
  support_ticket_category, text, text, uuid
) TO authenticated;

-- -----------------------------------------------------------------------------
-- list_service_types
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
          'id', s.id,
          'slug', s.slug,
          'label', s.label,
          'description', s.description,
          'sort_order', s.sort_order,
          'active', s.active
        )
        ORDER BY s.sort_order, s.label
      )
      FROM public.service_types s
      WHERE (NOT p_active_only OR s.active = true)
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_service_types(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_service_types(boolean) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- submit_partner_org_application
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_partner_org_application(
  p_org_sid text,
  p_org_name text,
  p_org_url text DEFAULT NULL,
  p_applicant_role_claim text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid text := lower(trim(p_org_sid));
  v_name text := trim(p_org_name);
  v_app_id uuid;
  v_ticket jsonb;
  v_ticket_id uuid;
  v_handle text;
  v_content text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.is_rsi_verified_member() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verified RSI Handle required');
  END IF;

  IF v_sid IS NULL OR length(v_sid) < 2 OR length(v_sid) > 64 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid org SID');
  END IF;

  IF v_name IS NULL OR length(v_name) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter the organization name');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.partner_orgs
    WHERE lower(org_sid) = v_sid AND active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This org is already an approved partner');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.partner_org_applications
    WHERE applicant_id = v_uid
      AND lower(org_sid) = v_sid
      AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have a pending application for this org');
  END IF;

  SELECT rsi_handle INTO v_handle FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.partner_org_applications (
    applicant_id, org_sid, org_name, org_url, applicant_role_claim, notes
  ) VALUES (
    v_uid,
    v_sid,
    v_name,
    nullif(trim(p_org_url), ''),
    nullif(trim(p_applicant_role_claim), ''),
    nullif(trim(p_notes), '')
  )
  RETURNING id INTO v_app_id;

  v_content := format(
    E'Partnership application submitted.%sOrg SID: %s%sOrg name: %s%sApplicant RSI: %s%sRole claim: %s%sOrg URL: %s%sNotes: %s%sApplication ID: %s%sReview in Partnership (officer) or Support Dashboard.',
    E'\n\n',
    v_sid, E'\n',
    v_name, E'\n',
    coalesce(v_handle, '(unknown)'), E'\n',
    coalesce(nullif(trim(p_applicant_role_claim), ''), '(not specified)'), E'\n',
    coalesce(nullif(trim(p_org_url), ''), '(none)'), E'\n',
    coalesce(nullif(trim(p_notes), ''), '(none)'), E'\n',
    v_app_id::text, E'\n'
  );

  v_ticket := public.create_support_ticket(
    'partnership_application'::support_ticket_category,
    'Partnership: ' || v_name || ' (' || v_sid || ')',
    v_content,
    NULL
  );

  IF coalesce((v_ticket->>'success')::boolean, false) THEN
    v_ticket_id := (v_ticket->>'ticket_id')::uuid;
    UPDATE public.partner_org_applications
    SET support_ticket_id = v_ticket_id, updated_at = now()
    WHERE id = v_app_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_app_id,
    'support_ticket_id', v_ticket_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_partner_org_application(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partner_org_application(text, text, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- list_my_partner_applications
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_partner_applications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
      FROM (
        SELECT
          a.id,
          a.org_sid,
          a.org_name,
          a.org_url,
          a.applicant_role_claim,
          a.notes,
          a.status,
          a.support_ticket_id,
          a.review_notes,
          a.reviewed_at,
          a.created_at
        FROM public.partner_org_applications a
        WHERE a.applicant_id = auth.uid()
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_partner_applications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_applications() TO authenticated;

-- -----------------------------------------------------------------------------
-- list_pending_partner_applications (officers)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pending_partner_applications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('officer', 'super-admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'applications', coalesce(
      (
        SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at ASC)
        FROM (
          SELECT
            a.id,
            a.org_sid,
            a.org_name,
            a.org_url,
            a.applicant_role_claim,
            a.notes,
            a.status,
            a.support_ticket_id,
            a.created_at,
            p.rsi_handle AS applicant_rsi_handle,
            p.display_name AS applicant_display_name,
            p.email AS applicant_email
          FROM public.partner_org_applications a
          JOIN public.profiles p ON p.id = a.applicant_id
          WHERE a.status = 'pending'
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_pending_partner_applications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_partner_applications() TO authenticated;

-- -----------------------------------------------------------------------------
-- review_partner_org_application
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_partner_org_application(
  p_application_id uuid,
  p_approve boolean,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.partner_org_applications%ROWTYPE;
  v_partner_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role IN ('officer', 'super-admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  SELECT * INTO v_app
  FROM public.partner_org_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  IF v_app.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application is not pending');
  END IF;

  IF p_approve THEN
    INSERT INTO public.partner_orgs (org_sid, org_name, application_id, approved_by, approved_at)
    VALUES (v_app.org_sid, v_app.org_name, v_app.id, v_uid, now())
    ON CONFLICT (org_sid) DO UPDATE
    SET
      org_name = EXCLUDED.org_name,
      application_id = EXCLUDED.application_id,
      active = true,
      approved_by = EXCLUDED.approved_by,
      approved_at = now(),
      updated_at = now()
    RETURNING id INTO v_partner_id;

    INSERT INTO public.partner_org_managers (partner_org_id, user_id, is_primary)
    VALUES (v_partner_id, v_app.applicant_id, true)
    ON CONFLICT (partner_org_id, user_id) DO UPDATE
    SET is_primary = true;

    UPDATE public.partner_org_applications
    SET
      status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_notes = nullif(trim(p_review_notes), ''),
      updated_at = now()
    WHERE id = v_app.id;

    PERFORM public.create_user_notification(
      v_app.applicant_id,
      'partnership_approved',
      'Partnership approved',
      'Your org partnership for ' || v_app.org_name || ' was approved. Open Partnership to manage services.',
      jsonb_build_object('partner_org_id', v_partner_id, 'application_id', v_app.id)
    );

    RETURN jsonb_build_object('success', true, 'status', 'approved', 'partner_org_id', v_partner_id);
  END IF;

  UPDATE public.partner_org_applications
  SET
    status = 'denied',
    reviewed_by = v_uid,
    reviewed_at = now(),
    review_notes = nullif(trim(p_review_notes), ''),
    updated_at = now()
  WHERE id = v_app.id;

  PERFORM public.create_user_notification(
    v_app.applicant_id,
    'partnership_denied',
    'Partnership application denied',
    'Your org partnership application for ' || v_app.org_name || ' was denied.',
    jsonb_build_object('application_id', v_app.id)
  );

  RETURN jsonb_build_object('success', true, 'status', 'denied');
END;
$$;

REVOKE ALL ON FUNCTION public.review_partner_org_application(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_partner_org_application(uuid, boolean, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- list_my_partner_orgs (+ services)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_partner_orgs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.org_name)
      FROM (
        SELECT
          o.id,
          o.org_sid,
          o.org_name,
          o.active,
          o.approved_at,
          m.is_primary,
          (
            SELECT coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', ps.id,
                  'service_type_id', ps.service_type_id,
                  'slug', st.slug,
                  'label', st.label,
                  'enabled', ps.enabled,
                  'pricing_label', ps.pricing_label,
                  'has_webhook', (ps.discord_webhook_url IS NOT NULL AND length(ps.discord_webhook_url) > 0)
                )
                ORDER BY st.sort_order
              ),
              '[]'::jsonb
            )
            FROM public.partner_org_services ps
            JOIN public.service_types st ON st.id = ps.service_type_id
            WHERE ps.partner_org_id = o.id
          ) AS services
        FROM public.partner_orgs o
        JOIN public.partner_org_managers m ON m.partner_org_id = o.id
        WHERE m.user_id = auth.uid()
          AND o.active = true
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_partner_orgs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_orgs() TO authenticated;

-- -----------------------------------------------------------------------------
-- upsert_partner_org_service — pricing + webhook per service (managers)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_partner_org_service(
  p_partner_org_id uuid,
  p_service_type_id uuid,
  p_enabled boolean DEFAULT true,
  p_pricing_label text DEFAULT 'FREE',
  p_discord_webhook_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price text := coalesce(nullif(trim(p_pricing_label), ''), 'FREE');
  v_existing_url text;
  v_final_url text;
  v_clear boolean := (p_discord_webhook_url IS NOT NULL AND length(trim(p_discord_webhook_url)) = 0);
  v_new_url text := nullif(trim(p_discord_webhook_url), '');
BEGIN
  IF NOT public.is_partner_org_manager(p_partner_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a manager of this partner org');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partner_orgs WHERE id = p_partner_org_id AND active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Partner org not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.service_types WHERE id = p_service_type_id AND active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown service type');
  END IF;

  IF v_new_url IS NOT NULL AND NOT public.partner_webhook_url_ok(v_new_url) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Discord webhook URL');
  END IF;

  SELECT discord_webhook_url INTO v_existing_url
  FROM public.partner_org_services
  WHERE partner_org_id = p_partner_org_id
    AND service_type_id = p_service_type_id;

  v_final_url := CASE
    WHEN v_clear THEN NULL
    WHEN v_new_url IS NOT NULL THEN v_new_url
    ELSE v_existing_url
  END;

  IF p_enabled AND v_final_url IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Enabled services require a Discord webhook URL (separate from personal Webhooks)'
    );
  END IF;

  INSERT INTO public.partner_org_services (
    partner_org_id, service_type_id, enabled, pricing_label, discord_webhook_url, updated_at
  ) VALUES (
    p_partner_org_id, p_service_type_id, p_enabled, v_price, v_final_url, now()
  )
  ON CONFLICT (partner_org_id, service_type_id) DO UPDATE
  SET
    enabled = EXCLUDED.enabled,
    pricing_label = EXCLUDED.pricing_label,
    discord_webhook_url = EXCLUDED.discord_webhook_url,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_partner_org_service(uuid, uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_partner_org_service(uuid, uuid, boolean, text, text) TO authenticated;

COMMENT ON TABLE public.partner_org_services IS
  'Per-service partner Discord webhooks — separate from discord_webhooks / /discord-subscribe.';
