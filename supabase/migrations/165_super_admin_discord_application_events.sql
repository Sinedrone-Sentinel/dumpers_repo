-- =============================================================================
-- 165: Super-Admin Discord application event types + toggle columns
-- =============================================================================
-- - Display rename is frontend-only (Org -> Super-Admin); DB column names stay.
-- - New staff event types: partnership_application, contributor_application
--   (both deliver via official_webhook_url / Super-Admin Webhook).
-- - Partnership tickets no longer use the generic "support" Discord event.
-- - Contributor applies no longer use the generic "admin" Discord event.
-- =============================================================================

ALTER TABLE public.discord_settings
  ADD COLUMN IF NOT EXISTS partnership_application_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.discord_settings
  ADD COLUMN IF NOT EXISTS contributor_application_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.discord_settings.partnership_application_enabled IS
  'When true (and master enabled), queue Discord for new partnership applications to the Super-Admin webhook.';
COMMENT ON COLUMN public.discord_settings.contributor_application_enabled IS
  'When true (and master enabled), queue Discord for new Dev Team / contributor applications to the Super-Admin webhook.';

UPDATE public.discord_settings
SET official_webhook_name = 'Super-Admin Channel'
WHERE id = 1
  AND official_webhook_name IS NOT DISTINCT FROM 'Official Org Channel';

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
    'my_support_reply', 'my_support_resolved'
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
    WHEN p_event_type LIKE 'my_order_%' OR p_event_type LIKE 'my_support_%' THEN v_settings.personal_discord_enabled
    WHEN p_event_type = 'support' THEN v_settings.support_enabled
    WHEN p_event_type = 'admin' THEN v_settings.admin_enabled
    WHEN p_event_type = 'partnership_application' THEN v_settings.partnership_application_enabled
    WHEN p_event_type = 'contributor_application' THEN v_settings.contributor_application_enabled
    ELSE true
  END;
END;
$$;

DROP FUNCTION IF EXISTS public.update_discord_settings(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, boolean, boolean, int);

CREATE OR REPLACE FUNCTION public.update_discord_settings(
  p_enabled boolean DEFAULT NULL,
  p_orders_enabled boolean DEFAULT NULL,
  p_order_new_enabled boolean DEFAULT NULL,
  p_order_fulfilled_enabled boolean DEFAULT NULL,
  p_order_cancelled_enabled boolean DEFAULT NULL,
  p_blueprints_enabled boolean DEFAULT NULL,
  p_support_enabled boolean DEFAULT NULL,
  p_admin_enabled boolean DEFAULT NULL,
  p_official_webhook_url text DEFAULT NULL,
  p_official_webhook_name text DEFAULT NULL,
  p_personal_discord_enabled boolean DEFAULT NULL,
  p_market_coalesce_enabled boolean DEFAULT NULL,
  p_market_coalesce_minutes int DEFAULT NULL,
  p_partnership_application_enabled boolean DEFAULT NULL,
  p_contributor_application_enabled boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  UPDATE public.discord_settings
  SET
    enabled = COALESCE(p_enabled, enabled),
    orders_enabled = COALESCE(p_orders_enabled, orders_enabled),
    order_new_enabled = COALESCE(p_order_new_enabled, order_new_enabled),
    order_fulfilled_enabled = COALESCE(p_order_fulfilled_enabled, order_fulfilled_enabled),
    order_cancelled_enabled = COALESCE(p_order_cancelled_enabled, order_cancelled_enabled),
    blueprints_enabled = COALESCE(p_blueprints_enabled, blueprints_enabled),
    support_enabled = COALESCE(p_support_enabled, support_enabled),
    admin_enabled = COALESCE(p_admin_enabled, admin_enabled),
    personal_discord_enabled = COALESCE(p_personal_discord_enabled, personal_discord_enabled),
    market_coalesce_enabled = COALESCE(p_market_coalesce_enabled, market_coalesce_enabled),
    market_coalesce_minutes = COALESCE(
      CASE
        WHEN p_market_coalesce_minutes IS NULL THEN NULL
        ELSE GREATEST(p_market_coalesce_minutes, 1)
      END,
      market_coalesce_minutes
    ),
    partnership_application_enabled = COALESCE(p_partnership_application_enabled, partnership_application_enabled),
    contributor_application_enabled = COALESCE(p_contributor_application_enabled, contributor_application_enabled),
    official_webhook_url = COALESCE(p_official_webhook_url, official_webhook_url),
    official_webhook_name = COALESCE(p_official_webhook_name, official_webhook_name),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_discord_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  text, text, boolean, boolean, int, boolean, boolean
) TO authenticated;

DROP FUNCTION IF EXISTS public.get_discord_settings();

CREATE OR REPLACE FUNCTION public.get_discord_settings()
RETURNS TABLE (
  enabled boolean,
  orders_enabled boolean,
  order_new_enabled boolean,
  order_fulfilled_enabled boolean,
  order_cancelled_enabled boolean,
  blueprints_enabled boolean,
  support_enabled boolean,
  admin_enabled boolean,
  personal_discord_enabled boolean,
  market_coalesce_enabled boolean,
  market_coalesce_minutes int,
  official_webhook_url text,
  official_webhook_name text,
  partnership_application_enabled boolean,
  contributor_application_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_see_url boolean :=
    coalesce(auth.role(), '') = 'service_role'
    OR public.is_super_admin();
BEGIN
  RETURN QUERY
  SELECT
    ds.enabled,
    ds.orders_enabled,
    ds.order_new_enabled,
    ds.order_fulfilled_enabled,
    ds.order_cancelled_enabled,
    ds.blueprints_enabled,
    ds.support_enabled,
    ds.admin_enabled,
    ds.personal_discord_enabled,
    ds.market_coalesce_enabled,
    ds.market_coalesce_minutes,
    CASE WHEN v_can_see_url THEN ds.official_webhook_url ELSE NULL END,
    ds.official_webhook_name,
    ds.partnership_application_enabled,
    ds.contributor_application_enabled
  FROM public.discord_settings ds
  WHERE ds.id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_discord_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_discord_settings() TO service_role;

COMMENT ON FUNCTION public.get_discord_settings() IS
  'Discord integration toggles. official_webhook_url is only returned to super-admins and service_role.';

-- Partnership applications use dedicated Discord event (still create support ticket + in-app notify).
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
    WHEN 'add_new_service_request' THEN 'Add New Service Request'
    WHEN 'other' THEN 'Other'
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

  IF p_category::text = 'partnership_application' THEN
    PERFORM public.queue_discord_message(
      'partnership_application',
      'Partnership Application',
      COALESCE(NULLIF(trim(p_subject), ''), 'A new partnership application was submitted'),
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
  ELSE
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
  END IF;

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(
  support_ticket_category, text, text, uuid
) TO authenticated;

-- Dev Team / contributor applications: dedicated event (was "admin").
CREATE OR REPLACE FUNCTION public.submit_contributor_application(
  p_github_login text,
  p_requested_entry_seat text,
  p_one_fix_or_feature text,
  p_pledge_fair_pricing boolean,
  p_pledge_ease_of_use boolean,
  p_pledge_no_sabotage boolean,
  p_pledge_tools_readiness boolean,
  p_pledge_no_handholding boolean,
  p_discord_handle text DEFAULT NULL,
  p_play_activity text DEFAULT NULL,
  p_interest_areas text[] DEFAULT '{}'::text[],
  p_motivation text DEFAULT NULL,
  p_skills text DEFAULT NULL,
  p_experience_link text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_login text;
  v_seat text;
  v_row public.contributor_applications%ROWTYPE;
  v_display text;
  v_cfg jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND p.role IS NOT NULL AND p.role <> 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved member required');
  END IF;

  v_cfg := public.get_contributor_program_config();
  IF COALESCE((v_cfg->>'enabled')::boolean, true) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contributor program is not accepting applications');
  END IF;

  v_login := public.contributor_normalize_github_login(p_github_login);
  IF v_login IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'GitHub username required');
  END IF;

  v_seat := lower(trim(COALESCE(p_requested_entry_seat, '')));
  IF v_seat NOT IN ('triage', 'contributor') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requested entry seat must be triage or contributor');
  END IF;

  IF NOT (
    COALESCE(p_pledge_fair_pricing, false)
    AND COALESCE(p_pledge_ease_of_use, false)
    AND COALESCE(p_pledge_no_sabotage, false)
    AND COALESCE(p_pledge_tools_readiness, false)
    AND COALESCE(p_pledge_no_handholding, false)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'All pledge checkboxes are required');
  END IF;

  IF p_one_fix_or_feature IS NULL
     OR char_length(trim(p_one_fix_or_feature)) < 20
     OR char_length(trim(p_one_fix_or_feature)) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Describe one fix or feature (20-500 characters)');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contributor_applications a
    WHERE a.user_id = v_uid
      AND a.seat IN ('pending', 'triage', 'contributor', 'reviewer', 'maintainer')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have an active or pending application');
  END IF;

  INSERT INTO public.contributor_applications (
    user_id,
    github_login,
    requested_entry_seat,
    seat,
    discord_handle,
    play_activity,
    interest_areas,
    motivation,
    one_fix_or_feature,
    skills,
    experience_link,
    pledge_fair_pricing,
    pledge_ease_of_use,
    pledge_no_sabotage,
    pledge_tools_readiness,
    pledge_no_handholding
  ) VALUES (
    v_uid,
    v_login,
    v_seat,
    'pending',
    nullif(trim(COALESCE(p_discord_handle, '')), ''),
    nullif(trim(COALESCE(p_play_activity, '')), ''),
    COALESCE(p_interest_areas, '{}'::text[]),
    nullif(trim(COALESCE(p_motivation, '')), ''),
    trim(p_one_fix_or_feature),
    nullif(trim(COALESCE(p_skills, '')), ''),
    nullif(trim(COALESCE(p_experience_link, '')), ''),
    true, true, true, true, true
  )
  RETURNING * INTO v_row;

  BEGIN
    SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.rsi_handle), ''), 'Member')
    INTO v_display
    FROM public.profiles p
    WHERE p.id = v_uid;

    PERFORM public.queue_discord_message(
      'contributor_application',
      'Dev Team Application',
      'A member submitted a contributor team application.',
      3447003,
      jsonb_build_array(
        jsonb_build_object('name', 'Member', 'value', COALESCE(v_display, 'Member'), 'inline', true),
        jsonb_build_object('name', 'GitHub', 'value', v_login, 'inline', true),
        jsonb_build_object('name', 'Requested seat', 'value', v_seat, 'inline', true)
      ),
      NULL,
      v_uid
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'contributor application discord: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'application', public.contributor_application_to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contributor_application(
  text, text, text, boolean, boolean, boolean, boolean, boolean,
  text, text, text[], text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contributor_application(
  text, text, text, boolean, boolean, boolean, boolean, boolean,
  text, text, text[], text, text, text
) TO authenticated;
