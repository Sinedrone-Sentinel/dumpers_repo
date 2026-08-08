-- =============================================================================
-- 163: Contributor Team program + per-entry ticker TTL override
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ticker: per-entry TTL override (1-366 days) for long-lived calls
-- -----------------------------------------------------------------------------
ALTER TABLE public.whats_new_entries
  ADD COLUMN IF NOT EXISTS ttl_days_override integer;

ALTER TABLE public.whats_new_entries
  DROP CONSTRAINT IF EXISTS whats_new_entries_ttl_days_override_check;

ALTER TABLE public.whats_new_entries
  ADD CONSTRAINT whats_new_entries_ttl_days_override_check
  CHECK (ttl_days_override IS NULL OR (ttl_days_override >= 1 AND ttl_days_override <= 366));

COMMENT ON COLUMN public.whats_new_entries.ttl_days_override IS
  'When set, used instead of ticker category ttl_days (e.g. 365 for Join the Dev Team).';

CREATE OR REPLACE FUNCTION public.ticker_entry_effective_ttl_days(
  p_category_id uuid,
  p_kind text,
  p_ttl_days_override integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ttl_days_override IS NOT NULL AND p_ttl_days_override BETWEEN 1 AND 366 THEN
    RETURN p_ttl_days_override;
  END IF;
  RETURN public.ticker_entry_ttl_days(p_category_id, p_kind);
END;
$$;

CREATE OR REPLACE FUNCTION public.ticker_entry_is_active(
  p_detected_at timestamptz,
  p_category_id uuid,
  p_kind text,
  p_ttl_days_override integer
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_detected_at > (
    now() - make_interval(
      days => public.ticker_entry_effective_ttl_days(p_category_id, p_kind, p_ttl_days_override)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.ticker_entry_is_active(
  p_detected_at timestamptz,
  p_category_id uuid,
  p_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.ticker_entry_is_active(p_detected_at, p_category_id, p_kind, NULL::integer);
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_whats_new()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.whats_new_entries e
  WHERE e.detected_at <= (
    now() - make_interval(
      days => public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override)
    )
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_active_whats_new()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  PERFORM public.cleanup_expired_whats_new();
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'issueKey', e.issue_key,
        'version', e.version,
        'category', e.category,
        'action', e.action,
        'headline', e.headline,
        'detectedAt', e.detected_at,
        'expiresAt', e.detected_at + make_interval(
          days => public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override)
        ),
        'items', e.items,
        'kind', e.kind,
        'tickerCategoryId', e.ticker_category_id,
        'tickerCategorySlug', c.slug,
        'tickerCategoryLabel', c.label,
        'accentHex', c.accent_hex,
        'ttlDays', public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override),
        'ttlDaysOverride', e.ttl_days_override
      )
      ORDER BY e.detected_at DESC, e.category ASC, e.action ASC
    )
    FROM public.whats_new_entries e
    LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
    WHERE public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind, e.ttl_days_override)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_whats_new_entries(p_include_expired boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.cleanup_expired_whats_new();

  RETURN COALESCE((
    SELECT jsonb_agg(s.row_data ORDER BY s.sort_at DESC)
    FROM (
      SELECT
        e.detected_at AS sort_at,
        jsonb_build_object(
          'id', e.id,
          'issueKey', e.issue_key,
          'version', e.version,
          'category', e.category,
          'action', e.action,
          'headline', e.headline,
          'items', e.items,
          'kind', e.kind,
          'detectedAt', e.detected_at,
          'expiresAt', e.detected_at + make_interval(
            days => public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override)
          ),
          'active', public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind, e.ttl_days_override),
          'ttlDays', public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override),
          'ttlDaysOverride', e.ttl_days_override,
          'tickerCategoryId', e.ticker_category_id,
          'tickerCategorySlug', c.slug,
          'tickerCategoryLabel', c.label,
          'accentHex', c.accent_hex
        ) AS row_data
      FROM public.whats_new_entries e
      LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
      ORDER BY e.detected_at DESC
      LIMIT 300
    ) s
  ), '[]'::jsonb);
END;
$$;


-- -----------------------------------------------------------------------------
-- Contributor Team program (part 2): settings, tables, member RPCs
-- -----------------------------------------------------------------------------

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS contributor_program_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS github_owner text,
  ADD COLUMN IF NOT EXISTS github_repo text,
  ADD COLUMN IF NOT EXISTS github_codeowners_handle text;

UPDATE public.site_settings
SET
  github_owner = COALESCE(NULLIF(trim(github_owner), ''), 'Sinedrone-Sentinel'),
  github_repo = COALESCE(NULLIF(trim(github_repo), ''), 'dumpers_repo'),
  github_codeowners_handle = COALESCE(NULLIF(trim(github_codeowners_handle), ''), 'Sinedrone-Sentinel')
WHERE id = 1;

COMMENT ON COLUMN public.site_settings.contributor_program_enabled IS
  'When false, contributor applications and upgrades are blocked.';
COMMENT ON COLUMN public.site_settings.github_owner IS 'Public repo owner for Contributor Team GitHub automation.';
COMMENT ON COLUMN public.site_settings.github_repo IS 'Public repo name for Contributor Team GitHub automation.';
COMMENT ON COLUMN public.site_settings.github_codeowners_handle IS 'CODEOWNERS lead handle shown in admin UI.';

CREATE TABLE IF NOT EXISTS public.contributor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  github_login text NOT NULL,
  requested_entry_seat text NOT NULL
    CHECK (requested_entry_seat IN ('triage', 'contributor')),
  seat text NOT NULL DEFAULT 'pending'
    CHECK (seat IN ('pending', 'denied', 'triage', 'contributor', 'reviewer', 'maintainer', 'left', 'revoked')),
  github_permission text
    CHECK (github_permission IS NULL OR github_permission IN ('triage', 'push', 'maintain')),
  discord_handle text,
  play_activity text,
  interest_areas text[] NOT NULL DEFAULT '{}'::text[],
  motivation text,
  one_fix_or_feature text NOT NULL,
  skills text,
  experience_link text,
  pledge_fair_pricing boolean NOT NULL,
  pledge_ease_of_use boolean NOT NULL,
  pledge_no_sabotage boolean NOT NULL,
  pledge_tools_readiness boolean NOT NULL,
  pledge_no_handholding boolean NOT NULL,
  pledge_accepted_at timestamptz NOT NULL DEFAULT now(),
  github_sync_status text NOT NULL DEFAULT 'none'
    CHECK (github_sync_status IN ('none', 'pending', 'ok', 'error')),
  github_pending_action text
    CHECK (github_pending_action IS NULL OR github_pending_action IN ('invite', 'update', 'remove')),
  github_sync_error text,
  github_synced_at timestamptz,
  admin_notes text,
  deny_reason text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  last_upgrade_denied_at timestamptz,
  left_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contributor_applications_one_open_per_user
  ON public.contributor_applications (user_id)
  WHERE seat IN ('pending', 'triage', 'contributor', 'reviewer', 'maintainer');

CREATE INDEX IF NOT EXISTS contributor_applications_seat_created_idx
  ON public.contributor_applications (seat, created_at DESC);

CREATE INDEX IF NOT EXISTS contributor_applications_github_login_idx
  ON public.contributor_applications (lower(github_login));

CREATE TABLE IF NOT EXISTS public.contributor_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.contributor_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_seat text NOT NULL
    CHECK (from_seat IN ('triage', 'contributor', 'reviewer')),
  to_seat text NOT NULL
    CHECK (to_seat IN ('contributor', 'reviewer', 'maintainer')),
  justification text NOT NULL,
  evidence_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  admin_notes text,
  evaluation_brief text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contributor_upgrade_requests_one_pending_per_user
  ON public.contributor_upgrade_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS contributor_upgrade_requests_status_created_idx
  ON public.contributor_upgrade_requests (status, created_at DESC);

ALTER TABLE public.contributor_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributor_upgrade_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.contributor_applications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contributor_upgrade_requests FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.contributor_normalize_github_login(p_login text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    lower(regexp_replace(trim(COALESCE(p_login, '')), '^@', '')),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.contributor_next_seat(p_seat text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_seat, '')))
    WHEN 'triage' THEN 'contributor'
    WHEN 'contributor' THEN 'reviewer'
    WHEN 'reviewer' THEN 'maintainer'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.contributor_seat_github_permission(p_seat text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_seat, '')))
    WHEN 'triage' THEN 'triage'
    WHEN 'contributor' THEN 'push'
    WHEN 'reviewer' THEN 'push'
    WHEN 'maintainer' THEN 'maintain'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.contributor_upgrade_guidelines_text(p_from text, p_to text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_from = 'triage' AND p_to = 'contributor' THEN
    RETURN 'Active on the team ~2+ weeks; helpful triage/comments; ready for local tooling (Node/Git; StarBreaker if doing data); clear intent to ship PRs; ideally comfortable with GitHub PRs elsewhere.';
  ELSIF p_from = 'contributor' AND p_to = 'reviewer' THEN
    RETURN 'Several meaningful merged PRs (~3+ over time, quality over spam); DCO/CI clean habits; useful review comments on others'' PRs; trustworthy tone with members and project values.';
  ELSIF p_from = 'reviewer' AND p_to = 'maintainer' THEN
    RETURN 'Sustained helpful reviews and solid PRs over months; judgment you would trust near merge/process; rare — lead discretion.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.contributor_application_to_jsonb(p_row public.contributor_applications)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'userId', p_row.user_id,
    'githubLogin', p_row.github_login,
    'requestedEntrySeat', p_row.requested_entry_seat,
    'seat', p_row.seat,
    'githubPermission', p_row.github_permission,
    'discordHandle', p_row.discord_handle,
    'playActivity', p_row.play_activity,
    'interestAreas', to_jsonb(COALESCE(p_row.interest_areas, '{}'::text[])),
    'motivation', p_row.motivation,
    'oneFixOrFeature', p_row.one_fix_or_feature,
    'skills', p_row.skills,
    'experienceLink', p_row.experience_link,
    'pledgeFairPricing', p_row.pledge_fair_pricing,
    'pledgeEaseOfUse', p_row.pledge_ease_of_use,
    'pledgeNoSabotage', p_row.pledge_no_sabotage,
    'pledgeToolsReadiness', p_row.pledge_tools_readiness,
    'pledgeNoHandholding', p_row.pledge_no_handholding,
    'pledgeAcceptedAt', p_row.pledge_accepted_at,
    'githubSyncStatus', p_row.github_sync_status,
    'githubPendingAction', p_row.github_pending_action,
    'githubSyncError', p_row.github_sync_error,
    'githubSyncedAt', p_row.github_synced_at,
    'adminNotes', p_row.admin_notes,
    'denyReason', p_row.deny_reason,
    'reviewedBy', p_row.reviewed_by,
    'reviewedAt', p_row.reviewed_at,
    'lastUpgradeDeniedAt', p_row.last_upgrade_denied_at,
    'leftAt', p_row.left_at,
    'revokedAt', p_row.revoked_at,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.get_contributor_program_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.site_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.site_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'enabled', true,
      'githubOwner', NULL,
      'githubRepo', NULL,
      'githubCodeownersHandle', NULL,
      'repoUrl', NULL
    );
  END IF;
  RETURN jsonb_build_object(
    'enabled', COALESCE(v_row.contributor_program_enabled, true),
    'githubOwner', v_row.github_owner,
    'githubRepo', v_row.github_repo,
    'githubCodeownersHandle', v_row.github_codeowners_handle,
    'repoUrl', CASE
      WHEN v_row.github_owner IS NOT NULL AND v_row.github_repo IS NOT NULL
        THEN 'https://github.com/' || v_row.github_owner || '/' || v_row.github_repo
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_contributor_program_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contributor_program_config() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_contributor_program_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_owner text;
  v_repo text;
  v_codeowners text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payload');
  END IF;

  IF p_config ? 'enabled' THEN
    v_enabled := (p_config->>'enabled')::boolean;
  END IF;
  v_owner := nullif(trim(COALESCE(p_config->>'githubOwner', p_config->>'github_owner', '')), '');
  v_repo := nullif(trim(COALESCE(p_config->>'githubRepo', p_config->>'github_repo', '')), '');
  v_codeowners := nullif(trim(COALESCE(p_config->>'githubCodeownersHandle', p_config->>'github_codeowners_handle', '')), '');

  INSERT INTO public.site_settings (id, contributor_program_enabled, github_owner, github_repo, github_codeowners_handle, updated_at)
  VALUES (1, COALESCE(v_enabled, true), v_owner, v_repo, v_codeowners, now())
  ON CONFLICT (id) DO UPDATE SET
    contributor_program_enabled = COALESCE(v_enabled, public.site_settings.contributor_program_enabled),
    github_owner = COALESCE(v_owner, public.site_settings.github_owner),
    github_repo = COALESCE(v_repo, public.site_settings.github_repo),
    github_codeowners_handle = COALESCE(v_codeowners, public.site_settings.github_codeowners_handle),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'config', public.get_contributor_program_config());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_contributor_program_config(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_contributor_program_config(jsonb) TO authenticated;


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
      'admin',
      'Contributor Application',
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


CREATE OR REPLACE FUNCTION public.list_my_contributor_application()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.contributor_applications%ROWTYPE;
  v_next text;
  v_pending jsonb := NULL;
  v_guidelines text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT * INTO v_app
  FROM public.contributor_applications a
  WHERE a.user_id = v_uid
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'application', NULL,
      'nextSeat', NULL,
      'nextSeatGuidelines', NULL,
      'pendingUpgrade', NULL,
      'config', public.get_contributor_program_config()
    );
  END IF;

  v_next := public.contributor_next_seat(v_app.seat);
  IF v_next IS NOT NULL THEN
    v_guidelines := public.contributor_upgrade_guidelines_text(v_app.seat, v_next);
  END IF;

  SELECT jsonb_build_object(
    'id', u.id,
    'fromSeat', u.from_seat,
    'toSeat', u.to_seat,
    'justification', u.justification,
    'evidenceLinks', COALESCE(u.evidence_links, '[]'::jsonb),
    'status', u.status,
    'createdAt', u.created_at,
    'updatedAt', u.updated_at
  )
  INTO v_pending
  FROM public.contributor_upgrade_requests u
  WHERE u.user_id = v_uid AND u.status = 'pending'
  ORDER BY u.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'application', public.contributor_application_to_jsonb(v_app),
    'nextSeat', v_next,
    'nextSeatGuidelines', v_guidelines,
    'pendingUpgrade', v_pending,
    'config', public.get_contributor_program_config()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_contributor_application() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_contributor_application() TO authenticated;

CREATE OR REPLACE FUNCTION public.request_contributor_upgrade(
  p_justification text,
  p_evidence_links jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.contributor_applications%ROWTYPE;
  v_next text;
  v_req public.contributor_upgrade_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT * INTO v_app
  FROM public.contributor_applications a
  WHERE a.user_id = v_uid
    AND a.seat IN ('triage', 'contributor', 'reviewer', 'maintainer')
  ORDER BY a.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active contributor seat');
  END IF;

  v_next := public.contributor_next_seat(v_app.seat);
  IF v_next IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already at the top of the ladder');
  END IF;

  IF v_app.last_upgrade_denied_at IS NOT NULL
     AND v_app.last_upgrade_denied_at > (now() - interval '14 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please wait 14 days after a denied upgrade before requesting again');
  END IF;

  IF p_justification IS NULL OR char_length(trim(p_justification)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justification required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contributor_upgrade_requests u
    WHERE u.user_id = v_uid AND u.status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have a pending upgrade request');
  END IF;

  IF p_evidence_links IS NULL OR jsonb_typeof(p_evidence_links) <> 'array' THEN
    p_evidence_links := '[]'::jsonb;
  END IF;

  INSERT INTO public.contributor_upgrade_requests (
    application_id,
    user_id,
    from_seat,
    to_seat,
    justification,
    evidence_links
  ) VALUES (
    v_app.id,
    v_uid,
    v_app.seat,
    v_next,
    trim(p_justification),
    p_evidence_links
  )
  RETURNING * INTO v_req;

  RETURN jsonb_build_object(
    'success', true,
    'upgradeRequest', jsonb_build_object(
      'id', v_req.id,
      'fromSeat', v_req.from_seat,
      'toSeat', v_req.to_seat,
      'status', v_req.status,
      'createdAt', v_req.created_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_contributor_upgrade(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_contributor_upgrade(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_my_upgrade_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  UPDATE public.contributor_upgrade_requests u
  SET status = 'cancelled', updated_at = now()
  WHERE u.user_id = v_uid AND u.status = 'pending'
  RETURNING u.id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending upgrade request');
  END IF;

  RETURN jsonb_build_object('success', true, 'cancelledId', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_my_upgrade_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_my_upgrade_request() TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_contributor_team()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.contributor_applications%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT * INTO v_app
  FROM public.contributor_applications a
  WHERE a.user_id = v_uid
    AND a.seat IN ('triage', 'contributor', 'reviewer', 'maintainer')
  ORDER BY a.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not on the contributor team');
  END IF;

  UPDATE public.contributor_upgrade_requests u
  SET status = 'cancelled', updated_at = now()
  WHERE u.user_id = v_uid AND u.status = 'pending';

  UPDATE public.contributor_applications a
  SET
    seat = 'left',
    left_at = now(),
    github_pending_action = 'remove',
    github_sync_status = 'pending',
    updated_at = now()
  WHERE a.id = v_app.id
  RETURNING * INTO v_app;

  RETURN jsonb_build_object(
    'success', true,
    'application', public.contributor_application_to_jsonb(v_app)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_contributor_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_contributor_team() TO authenticated;

REVOKE ALL ON FUNCTION public.contributor_normalize_github_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contributor_next_seat(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contributor_seat_github_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contributor_upgrade_guidelines_text(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contributor_application_to_jsonb(public.contributor_applications) FROM PUBLIC;



-- -----------------------------------------------------------------------------
-- Contributor Team program (part 3): admin RPCs + whats_new TTL ingest patch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_contributor_applications(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := nullif(lower(trim(COALESCE(p_status, ''))), '');
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_at DESC)
    FROM (
      SELECT
        a.created_at AS sort_at,
        jsonb_build_object(
          'application', public.contributor_application_to_jsonb(a),
          'profile', jsonb_build_object(
            'displayName', p.display_name,
            'email', p.email,
            'rsiHandle', p.rsi_handle,
            'rsiHandleVerified', p.rsi_handle_verified,
            'role', p.role,
            'memberSince', p.created_at
          )
        ) AS row_data
      FROM public.contributor_applications a
      JOIN public.profiles p ON p.id = a.user_id
      WHERE v_status IS NULL OR a.seat = v_status
      ORDER BY a.created_at DESC
      LIMIT 500
    ) s
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_contributor_applications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_contributor_applications(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_upgrade_requests(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := nullif(lower(trim(COALESCE(p_status, ''))), '');
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_at DESC)
    FROM (
      SELECT
        u.created_at AS sort_at,
        jsonb_build_object(
          'upgradeRequest', jsonb_build_object(
            'id', u.id,
            'applicationId', u.application_id,
            'userId', u.user_id,
            'fromSeat', u.from_seat,
            'toSeat', u.to_seat,
            'justification', u.justification,
            'evidenceLinks', COALESCE(u.evidence_links, '[]'::jsonb),
            'status', u.status,
            'adminNotes', u.admin_notes,
            'evaluationBrief', u.evaluation_brief,
            'reviewedBy', u.reviewed_by,
            'reviewedAt', u.reviewed_at,
            'createdAt', u.created_at,
            'updatedAt', u.updated_at
          ),
          'application', public.contributor_application_to_jsonb(a),
          'profile', jsonb_build_object(
            'displayName', p.display_name,
            'rsiHandle', p.rsi_handle,
            'rsiHandleVerified', p.rsi_handle_verified
          )
        ) AS row_data
      FROM public.contributor_upgrade_requests u
      JOIN public.contributor_applications a ON a.id = u.application_id
      JOIN public.profiles p ON p.id = u.user_id
      WHERE v_status IS NULL OR u.status = v_status
      ORDER BY u.created_at DESC
      LIMIT 500
    ) s
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_upgrade_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_upgrade_requests(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_active_contributors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_at DESC)
    FROM (
      SELECT
        a.updated_at AS sort_at,
        jsonb_build_object(
          'application', public.contributor_application_to_jsonb(a),
          'profile', jsonb_build_object(
            'displayName', p.display_name,
            'rsiHandle', p.rsi_handle,
            'rsiHandleVerified', p.rsi_handle_verified,
            'email', p.email
          )
        ) AS row_data
      FROM public.contributor_applications a
      JOIN public.profiles p ON p.id = a.user_id
      WHERE a.seat IN ('triage', 'contributor', 'reviewer', 'maintainer')
      ORDER BY a.seat, a.updated_at DESC
    ) s
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_active_contributors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_active_contributors() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_review_contributor_application(
  p_id uuid,
  p_approve boolean,
  p_review_notes text,
  p_grant_seat text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.contributor_applications%ROWTYPE;
  v_grant text;
  v_perm text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_app FROM public.contributor_applications a WHERE a.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  IF v_app.seat <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application is not pending review');
  END IF;

  IF NOT COALESCE(p_approve, false) THEN
    IF p_review_notes IS NULL OR char_length(trim(p_review_notes)) < 3 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Deny reason required');
    END IF;

    UPDATE public.contributor_applications a
    SET
      seat = 'denied',
      deny_reason = trim(p_review_notes),
      admin_notes = nullif(trim(COALESCE(p_review_notes, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
    WHERE a.id = p_id
    RETURNING * INTO v_app;

    RETURN jsonb_build_object('success', true, 'application', public.contributor_application_to_jsonb(v_app));
  END IF;

  v_grant := lower(trim(COALESCE(nullif(trim(COALESCE(p_grant_seat, '')), ''), v_app.requested_entry_seat)));
  IF v_grant NOT IN ('triage', 'contributor') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grant seat must be triage or contributor');
  END IF;

  v_perm := public.contributor_seat_github_permission(v_grant);

  UPDATE public.contributor_applications a
  SET
    seat = v_grant,
    github_permission = v_perm,
    github_pending_action = 'invite',
    github_sync_status = 'pending',
    github_sync_error = NULL,
    admin_notes = nullif(trim(COALESCE(p_review_notes, '')), ''),
    deny_reason = NULL,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE a.id = p_id
  RETURNING * INTO v_app;

  RETURN jsonb_build_object('success', true, 'application', public.contributor_application_to_jsonb(v_app));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_contributor_application(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_contributor_application(uuid, boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_upgrade_request(
  p_id uuid,
  p_approve boolean,
  p_review_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.contributor_upgrade_requests%ROWTYPE;
  v_app public.contributor_applications%ROWTYPE;
  v_expected_next text;
  v_perm text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_req FROM public.contributor_upgrade_requests u WHERE u.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Upgrade request not found');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Upgrade request is not pending');
  END IF;

  SELECT * INTO v_app FROM public.contributor_applications a WHERE a.id = v_req.application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  v_expected_next := public.contributor_next_seat(v_app.seat);
  IF v_expected_next IS NULL OR v_req.to_seat <> v_expected_next OR v_req.from_seat <> v_app.seat THEN
    RETURN jsonb_build_object('success', false, 'error', 'Upgrade request does not match linear ladder');
  END IF;

  IF NOT COALESCE(p_approve, false) THEN
    UPDATE public.contributor_upgrade_requests u
    SET
      status = 'denied',
      admin_notes = nullif(trim(COALESCE(p_review_notes, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
    WHERE u.id = p_id
    RETURNING * INTO v_req;

    UPDATE public.contributor_applications a
    SET last_upgrade_denied_at = now(), updated_at = now()
    WHERE a.id = v_app.id;

    RETURN jsonb_build_object('success', true, 'upgradeRequestId', v_req.id, 'status', v_req.status);
  END IF;

  v_perm := public.contributor_seat_github_permission(v_req.to_seat);

  UPDATE public.contributor_applications a
  SET
    seat = v_req.to_seat,
    github_permission = v_perm,
    github_pending_action = 'update',
    github_sync_status = 'pending',
    github_sync_error = NULL,
    updated_at = now()
  WHERE a.id = v_app.id
  RETURNING * INTO v_app;

  UPDATE public.contributor_upgrade_requests u
  SET
    status = 'approved',
    admin_notes = nullif(trim(COALESCE(p_review_notes, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE u.id = p_id
  RETURNING * INTO v_req;

  RETURN jsonb_build_object(
    'success', true,
    'application', public.contributor_application_to_jsonb(v_app),
    'upgradeRequestId', v_req.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_upgrade_request(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_upgrade_request(uuid, boolean, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_grant_next_seat(
  p_application_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.contributor_applications%ROWTYPE;
  v_next text;
  v_perm text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_app FROM public.contributor_applications a WHERE a.id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  IF v_app.seat NOT IN ('triage', 'contributor', 'reviewer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat cannot be advanced from current state');
  END IF;

  v_next := public.contributor_next_seat(v_app.seat);
  IF v_next IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already at top of ladder');
  END IF;

  v_perm := public.contributor_seat_github_permission(v_next);

  UPDATE public.contributor_applications a
  SET
    seat = v_next,
    github_permission = v_perm,
    github_pending_action = 'update',
    github_sync_status = 'pending',
    github_sync_error = NULL,
    admin_notes = COALESCE(nullif(trim(COALESCE(p_notes, '')), ''), a.admin_notes),
    updated_at = now()
  WHERE a.id = p_application_id
  RETURNING * INTO v_app;

  RETURN jsonb_build_object('success', true, 'application', public.contributor_application_to_jsonb(v_app));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_next_seat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_next_seat(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_contributor(
  p_application_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.contributor_applications%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_app FROM public.contributor_applications a WHERE a.id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  UPDATE public.contributor_upgrade_requests u
  SET status = 'cancelled', updated_at = now()
  WHERE u.application_id = p_application_id AND u.status = 'pending';

  UPDATE public.contributor_applications a
  SET
    seat = 'revoked',
    revoked_at = now(),
    github_pending_action = 'remove',
    github_sync_status = 'pending',
    github_sync_error = NULL,
    admin_notes = COALESCE(nullif(trim(COALESCE(p_notes, '')), ''), a.admin_notes),
    updated_at = now()
  WHERE a.id = p_application_id
  RETURNING * INTO v_app;

  RETURN jsonb_build_object('success', true, 'application', public.contributor_application_to_jsonb(v_app));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_contributor(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_contributor(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mark_contributor_github_sync(
  p_application_id uuid,
  p_status text,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.contributor_applications%ROWTYPE;
  v_status text := lower(trim(COALESCE(p_status, '')));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_status NOT IN ('pending', 'ok', 'error') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status must be pending, ok, or error');
  END IF;

  SELECT * INTO v_app FROM public.contributor_applications a WHERE a.id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  UPDATE public.contributor_applications a
  SET
    github_sync_status = v_status,
    github_sync_error = CASE WHEN v_status = 'error' THEN nullif(trim(COALESCE(p_error, '')), '') ELSE NULL END,
    github_synced_at = CASE WHEN v_status = 'ok' THEN now() ELSE a.github_synced_at END,
    github_pending_action = CASE WHEN v_status = 'ok' THEN NULL ELSE a.github_pending_action END,
    updated_at = now()
  WHERE a.id = p_application_id
  RETURNING * INTO v_app;

  RETURN jsonb_build_object('success', true, 'application', public.contributor_application_to_jsonb(v_app));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_contributor_github_sync(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_contributor_github_sync(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_build_contributor_evaluation_brief(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.contributor_applications%ROWTYPE;
  v_prof public.profiles%ROWTYPE;
  v_cfg jsonb;
  v_owner text;
  v_repo text;
  v_md text;
  v_upgrade jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_prof FROM public.profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  v_app := NULL;
  SELECT * INTO v_app
  FROM public.contributor_applications a
  WHERE a.user_id = p_user_id
  ORDER BY a.created_at DESC
  LIMIT 1;

  v_cfg := public.get_contributor_program_config();
  v_owner := v_cfg->>'githubOwner';
  v_repo := v_cfg->>'githubRepo';

  SELECT jsonb_build_object(
    'id', u.id,
    'fromSeat', u.from_seat,
    'toSeat', u.to_seat,
    'justification', u.justification,
    'evidenceLinks', COALESCE(u.evidence_links, '[]'::jsonb),
    'status', u.status,
    'createdAt', u.created_at
  )
  INTO v_upgrade
  FROM public.contributor_upgrade_requests u
  WHERE u.user_id = p_user_id
  ORDER BY u.created_at DESC
  LIMIT 1;

  v_md := '# Contributor evaluation brief' || E'\n\n';
  v_md := v_md || '## Profile' || E'\n';
  v_md := v_md || '- Display name: ' || COALESCE(v_prof.display_name, '(none)') || E'\n';
  v_md := v_md || '- RSI handle: ' || COALESCE(v_prof.rsi_handle, '(none)') || E'\n';
  v_md := v_md || '- RSI verified: ' || CASE WHEN v_prof.rsi_handle_verified THEN 'yes' ELSE 'no' END || E'\n';
  v_md := v_md || '- Member since: ' || COALESCE(to_char(v_prof.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), '?') || E'\n\n';

  IF v_app.id IS NOT NULL THEN
    v_md := v_md || '## Application' || E'\n';
    v_md := v_md || '- GitHub: ' || v_app.github_login || E'\n';
    v_md := v_md || '- Requested entry: ' || v_app.requested_entry_seat || E'\n';
    v_md := v_md || '- Current seat: ' || v_app.seat || E'\n';
    v_md := v_md || '- One fix/feature: ' || v_app.one_fix_or_feature || E'\n';
    v_md := v_md || '- Motivation: ' || COALESCE(v_app.motivation, '(none)') || E'\n';
    v_md := v_md || '- Interest areas: ' || COALESCE(array_to_string(v_app.interest_areas, ', '), '(none)') || E'\n\n';
  ELSE
    v_md := v_md || '## Application' || E'\n- (none on file)' || E'\n\n';
  END IF;

  IF v_upgrade IS NOT NULL THEN
    v_md := v_md || '## Latest upgrade request' || E'\n';
    v_md := v_md || '- ' || (v_upgrade->>'fromSeat') || ' -> ' || (v_upgrade->>'toSeat') || ' (' || (v_upgrade->>'status') || ')' || E'\n';
    v_md := v_md || '- Justification: ' || COALESCE(v_upgrade->>'justification', '') || E'\n\n';
  END IF;

  IF v_owner IS NOT NULL AND v_repo IS NOT NULL AND v_app.github_login IS NOT NULL THEN
    v_md := v_md || '## GitHub PR search' || E'\n';
    v_md := v_md || 'https://github.com/' || v_owner || '/' || v_repo || '/pulls?q=is%3Apr+author%3A' || v_app.github_login || E'\n';
  END IF;

  RETURN jsonb_build_object('success', true, 'markdown', v_md, 'profile', jsonb_build_object(
    'displayName', v_prof.display_name,
    'rsiHandleVerified', v_prof.rsi_handle_verified
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_build_contributor_evaluation_brief(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_build_contributor_evaluation_brief(uuid) TO authenticated;



-- -----------------------------------------------------------------------------
-- whats_new admin ingest TTL override patch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_upsert_whats_new_entry(p_entry jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_issue text;
  v_version text;
  v_category text;
  v_action text;
  v_headline text;
  v_kind text;
  v_items jsonb;
  v_detected timestamptz;
  v_cat_id uuid;
  v_existing_id uuid;
  v_cat_kind text;
  v_ttl_override integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payload');
  END IF;

  v_id := NULLIF(trim(COALESCE(p_entry->>'id', '')), '')::uuid;
  v_issue := nullif(trim(COALESCE(p_entry->>'issueKey', '')), '');
  v_version := nullif(trim(COALESCE(p_entry->>'version', '')), '');
  v_category := nullif(trim(COALESCE(p_entry->>'category', '')), '');
  v_action := nullif(trim(COALESCE(p_entry->>'action', '')), '');
  v_headline := nullif(trim(COALESCE(p_entry->>'headline', '')), '');
  v_kind := lower(nullif(trim(COALESCE(p_entry->>'kind', '')), ''));
  v_items := COALESCE(p_entry->'items', '[]'::jsonb);

  IF p_entry ? 'ttlDaysOverride' OR p_entry ? 'ttl_days_override' THEN
    BEGIN
      v_ttl_override := NULLIF(trim(COALESCE(p_entry->>'ttlDaysOverride', p_entry->>'ttl_days_override', '')), '')::integer;
    EXCEPTION WHEN others THEN
      v_ttl_override := NULL;
    END;
    IF v_ttl_override IS NOT NULL AND (v_ttl_override < 1 OR v_ttl_override > 366) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ttlDaysOverride must be between 1 and 366');
    END IF;
  ELSE
    v_ttl_override := NULL;
  END IF;

  v_cat_id := NULLIF(trim(COALESCE(p_entry->>'tickerCategoryId', '')), '')::uuid;

  IF v_headline IS NULL OR char_length(v_headline) > 160 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Headline required (max 160 chars)');
  END IF;

  v_headline := regexp_replace(
    v_headline,
    '^(SITE UPDATE|GAME UPDATE|QUESTIONNAIRE|DUMPER APPS|POLL RESULTS)\s*:\s*',
    '',
    'i'
  );
  v_headline := nullif(trim(v_headline), '');
  IF v_headline IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Headline required');
  END IF;

  IF v_cat_id IS NULL THEN
    v_cat_id := public.resolve_ticker_category_id(
      p_entry->>'tickerCategorySlug',
      v_category,
      v_kind,
      v_issue,
      v_version
    );
  ELSIF NOT EXISTS (SELECT 1 FROM public.ticker_categories c WHERE c.id = v_cat_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid ticker category');
  END IF;

  SELECT c.entry_kind, c.label INTO v_cat_kind, v_category
  FROM public.ticker_categories c
  WHERE c.id = v_cat_id;

  -- Topic/tag: keep free-text category if provided; else use layout label
  v_category := COALESCE(
    nullif(trim(COALESCE(p_entry->>'category', '')), ''),
    v_category,
    'General'
  );

  IF v_kind IS NULL OR v_kind NOT IN ('game', 'site') THEN
    v_kind := COALESCE(v_cat_kind, 'site');
  END IF;

  IF v_issue IS NULL THEN
    v_issue := 'site:' || substr(md5(v_headline || clock_timestamp()::text), 1, 12);
  END IF;

  IF v_version IS NULL THEN
    v_version := CASE
      WHEN v_kind = 'game' THEN 'manual'
      ELSE 'site-' || to_char(timezone('utc', now()), 'YYYY-MM-DD')
    END;
  END IF;

  IF v_action IS NULL THEN
    v_action := 'updated';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN
    v_items := '[]'::jsonb;
  END IF;

  BEGIN
    v_detected := COALESCE((p_entry->>'detectedAt')::timestamptz, now());
  EXCEPTION WHEN others THEN
    v_detected := now();
  END;

  IF v_id IS NOT NULL THEN
    UPDATE public.whats_new_entries e
    SET
      issue_key = v_issue,
      version = v_version,
      category = v_category,
      action = v_action,
      headline = v_headline,
      items = v_items,
      kind = v_kind,
      detected_at = v_detected,
      ticker_category_id = v_cat_id,
      ttl_days_override = v_ttl_override
    WHERE e.id = v_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Entry not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;

  SELECT e.id INTO v_existing_id
  FROM public.whats_new_entries e
  WHERE e.issue_key = v_issue AND e.version = v_version
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.whats_new_entries e
    SET
      category = v_category,
      action = v_action,
      headline = v_headline,
      items = v_items,
      kind = v_kind,
      detected_at = v_detected,
      ticker_category_id = v_cat_id,
      ttl_days_override = v_ttl_override
    WHERE e.id = v_existing_id;

    RETURN jsonb_build_object('success', true, 'id', v_existing_id, 'updatedExisting', true);
  END IF;

  INSERT INTO public.whats_new_entries (
    issue_key, version, category, action, headline, items, detected_at, kind, ticker_category_id, ttl_days_override
  ) VALUES (
    v_issue, v_version, v_category, v_action, v_headline, v_items, v_detected, v_kind, v_cat_id, v_ttl_override
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_whats_new_entry(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_whats_new_entry(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ingest_whats_new_entries(p_entries jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_issue text;
  v_version text;
  v_headline text;
  v_kind text;
  v_category text;
  v_cat_id uuid;
  v_inserted int := 0;
  v_skipped int := 0;
  v_detected timestamptz;
  v_rowcount int;
  v_ttl_override integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'p_entries must be a JSON array';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_issue := nullif(trim(COALESCE(v_row->>'issueKey', v_row->>'entryKey', '')), '');
    v_version := nullif(trim(COALESCE(v_row->>'version', v_row->>'launcherVersion', '')), '');
    v_headline := nullif(trim(COALESCE(v_row->>'headline', '')), '');
    v_kind := lower(nullif(trim(COALESCE(v_row->>'kind', '')), ''));
    v_category := COALESCE(nullif(trim(v_row->>'category'), ''), 'General');
    IF v_kind IS NULL OR v_kind NOT IN ('game', 'site') THEN
      v_kind := 'game';
    END IF;

    IF v_issue IS NULL OR v_version IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.whats_new_entries e
      WHERE e.issue_key = v_issue
        AND e.version = v_version
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_headline IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.whats_new_entries e
      WHERE e.version = v_version
        AND e.headline = v_headline
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_detected := COALESCE((v_row->>'detectedAt')::timestamptz, now());
    EXCEPTION WHEN others THEN
      v_detected := now();
    END;

    v_cat_id := NULLIF(trim(COALESCE(v_row->>'tickerCategoryId', '')), '')::uuid;
    v_ttl_override := NULL;
    IF v_row ? 'ttlDaysOverride' OR v_row ? 'ttl_days_override' THEN
      BEGIN
        v_ttl_override := NULLIF(trim(COALESCE(v_row->>'ttlDaysOverride', v_row->>'ttl_days_override', '')), '')::integer;
      EXCEPTION WHEN others THEN
        v_ttl_override := NULL;
      END;
      IF v_ttl_override IS NOT NULL AND (v_ttl_override < 1 OR v_ttl_override > 366) THEN
        v_ttl_override := NULL;
      END IF;
    END IF;

    IF v_cat_id IS NULL THEN
      v_cat_id := public.resolve_ticker_category_id(
        v_row->>'tickerCategorySlug',
        v_category,
        v_kind,
        v_issue,
        v_version
      );
    END IF;

    -- Prefer category's entry_kind when slug maps to a known layout
    IF v_cat_id IS NOT NULL THEN
      SELECT c.entry_kind INTO v_kind
      FROM public.ticker_categories c
      WHERE c.id = v_cat_id;
    END IF;

    INSERT INTO public.whats_new_entries (
      issue_key, version, category, action, headline, items, detected_at, kind, ticker_category_id, ttl_days_override
    ) VALUES (
      v_issue,
      v_version,
      v_category,
      COALESCE(nullif(trim(v_row->>'action'), ''), 'updated'),
      COALESCE(v_headline, v_issue),
      COALESCE(v_row->'items', '[]'::jsonb),
      v_detected,
      v_kind,
      v_cat_id,
      v_ttl_override
    )
    ON CONFLICT (issue_key, version) DO NOTHING;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount > 0 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_whats_new_entries(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_whats_new_entries(jsonb) TO authenticated, service_role;
