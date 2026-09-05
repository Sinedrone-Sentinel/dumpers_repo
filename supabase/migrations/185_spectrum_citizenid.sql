-- 185: RSI Spectrum store + Citizen iD link (not extra profiles columns).
-- Spectrum = CIG Spectrum social layer. Citizen iD is the feed.
-- Grace clock stays NULL until super-admin starts it (bio verify still works).

-- -----------------------------------------------------------------------------
-- Site setting: legacy grace end (NULL = Link not launched)
-- -----------------------------------------------------------------------------
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS spectrum_legacy_grace_ends_at timestamptz;

-- -----------------------------------------------------------------------------
-- spectrum_citizens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spectrum_citizens (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  citizenid_sub text UNIQUE,
  rsi_handle text,
  rsi_citizen_id text,
  rsi_spectrum_id text,
  rsi_display_name text,
  enlisted_at date,
  avatar_url text,
  oauth_avatar_url text,
  primary_org_sid text,
  account_type text NOT NULL DEFAULT 'citizen'
    CHECK (account_type IN ('citizen', 'organization')),
  cid_verified boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'bio'
    CHECK (source IN ('bio', 'citizenid')),
  claims jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spectrum_citizens_handle_idx
  ON public.spectrum_citizens (lower(rsi_handle))
  WHERE rsi_handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS spectrum_citizens_primary_org_idx
  ON public.spectrum_citizens (primary_org_sid)
  WHERE primary_org_sid IS NOT NULL;

ALTER TABLE public.spectrum_citizens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spectrum_citizens_no_client_write ON public.spectrum_citizens;
CREATE POLICY spectrum_citizens_no_client_write
  ON public.spectrum_citizens
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.spectrum_citizens IS
  'RSI Spectrum identity snapshot. Writes via DEFINER / service_role only.';

-- -----------------------------------------------------------------------------
-- spectrum_citizen_orgs (public affiliations only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spectrum_citizen_orgs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_sid text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_sid)
);

CREATE INDEX IF NOT EXISTS spectrum_citizen_orgs_sid_idx
  ON public.spectrum_citizen_orgs (org_sid);

CREATE INDEX IF NOT EXISTS spectrum_citizen_orgs_primary_idx
  ON public.spectrum_citizen_orgs (user_id)
  WHERE is_primary;

ALTER TABLE public.spectrum_citizen_orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spectrum_citizen_orgs_select ON public.spectrum_citizen_orgs;
CREATE POLICY spectrum_citizen_orgs_select
  ON public.spectrum_citizen_orgs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS spectrum_citizen_orgs_no_write ON public.spectrum_citizen_orgs;
CREATE POLICY spectrum_citizen_orgs_no_write
  ON public.spectrum_citizen_orgs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- OAuth pending + refresh tokens (Edge / service_role only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spectrum_oauth_pending (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS spectrum_oauth_pending_user_idx
  ON public.spectrum_oauth_pending (user_id);

ALTER TABLE public.spectrum_oauth_pending ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.spectrum_oauth_tokens (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spectrum_oauth_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.spectrum_oauth_pending FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.spectrum_oauth_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.spectrum_oauth_pending TO service_role;
GRANT ALL ON TABLE public.spectrum_oauth_tokens TO service_role;

-- -----------------------------------------------------------------------------
-- Backfill bio stubs
-- -----------------------------------------------------------------------------
INSERT INTO public.spectrum_citizens (user_id, rsi_handle, source, cid_verified)
SELECT p.id, NULLIF(trim(p.rsi_handle), ''), 'bio', false
FROM public.profiles p
WHERE COALESCE(p.rsi_handle_verified, false) = true
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spectrum_grace_ends_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT spectrum_legacy_grace_ends_at FROM public.site_settings WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION public.spectrum_grace_ends_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spectrum_grace_ends_at() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.citizenid_new_bio_blocked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.spectrum_grace_ends_at() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.citizenid_new_bio_blocked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.citizenid_new_bio_blocked() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_rsi_verified_for_gates(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      COALESCE(p.rsi_handle_verified, false)
      AND (
        public.spectrum_grace_ends_at() IS NULL
        OR now() < public.spectrum_grace_ends_at()
        OR EXISTS (
          SELECT 1
          FROM public.spectrum_citizens s
          WHERE s.user_id = p.id
            AND s.citizenid_sub IS NOT NULL
        )
      )
    FROM public.profiles p
    WHERE p.id = p_user_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_rsi_verified_for_gates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_rsi_verified_for_gates(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_citizenid_legacy_grace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ends timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Super-admin required');
  END IF;

  v_ends := now() + interval '90 days';
  UPDATE public.site_settings
  SET spectrum_legacy_grace_ends_at = COALESCE(spectrum_legacy_grace_ends_at, v_ends),
      updated_at = now()
  WHERE id = 1;

  SELECT spectrum_legacy_grace_ends_at INTO v_ends
  FROM public.site_settings WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'ends_at', v_ends);
END;
$$;

REVOKE ALL ON FUNCTION public.start_citizenid_legacy_grace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_citizenid_legacy_grace() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_spectrum()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.spectrum_citizens%ROWTYPE;
  v_orgs jsonb;
  v_grace timestamptz;
  v_verified boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_row FROM public.spectrum_citizens WHERE user_id = v_uid;
  v_grace := public.spectrum_grace_ends_at();
  v_verified := public.is_rsi_verified_for_gates(v_uid);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'org_sid', o.org_sid,
    'is_primary', o.is_primary
  ) ORDER BY o.is_primary DESC, o.org_sid), '[]'::jsonb)
  INTO v_orgs
  FROM public.spectrum_citizen_orgs o
  WHERE o.user_id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'linked', v_row.citizenid_sub IS NOT NULL,
    'source', v_row.source,
    'rsi_handle', v_row.rsi_handle,
    'primary_org_sid', v_row.primary_org_sid,
    'avatar_url', v_row.avatar_url,
    'orgs', COALESCE(v_orgs, '[]'::jsonb),
    'grace_ends_at', v_grace,
    'gates_ok', v_verified,
    'needs_link', COALESCE((
      SELECT COALESCE(p.rsi_handle_verified, false)
        AND v_row.citizenid_sub IS NULL
      FROM public.profiles p WHERE p.id = v_uid
    ), false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_spectrum() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_spectrum() TO authenticated;

-- -----------------------------------------------------------------------------
-- Upsert from Citizen iD (service_role / Edge only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_spectrum_from_citizenid(
  p_user_id uuid,
  p_citizenid_sub text,
  p_rsi_handle text,
  p_rsi_citizen_id text DEFAULT NULL,
  p_rsi_spectrum_id text DEFAULT NULL,
  p_rsi_display_name text DEFAULT NULL,
  p_enlisted_at date DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_primary_org_sid text DEFAULT NULL,
  p_public_org_sids text[] DEFAULT ARRAY[]::text[],
  p_account_type text DEFAULT 'citizen',
  p_cid_verified boolean DEFAULT true,
  p_claims jsonb DEFAULT '{}'::jsonb,
  p_oauth_avatar_url text DEFAULT NULL,
  p_refresh_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handle text := nullif(trim(p_rsi_handle), '');
  v_sub text := nullif(trim(p_citizenid_sub), '');
  v_primary text := nullif(upper(trim(COALESCE(p_primary_org_sid, ''))), '');
  v_type text := CASE
    WHEN lower(COALESCE(p_account_type, 'citizen')) LIKE '%organization%' THEN 'organization'
    ELSE 'citizen'
  END;
  v_sid text;
  v_sids text[] := ARRAY[]::text[];
  v_existing_handle text;
  v_existing_verified boolean;
  v_mark jsonb;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_user_id IS NULL OR v_sub IS NULL OR v_handle IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User, Citizen iD, and RSI handle are required');
  END IF;

  IF NOT COALESCE(p_cid_verified, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Citizen iD RSI is not verified');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.spectrum_citizens
    WHERE citizenid_sub = v_sub AND user_id IS DISTINCT FROM p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This Citizen iD is already linked to another member');
  END IF;

  SELECT rsi_handle, COALESCE(rsi_handle_verified, false)
  INTO v_existing_handle, v_existing_verified
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF v_existing_verified
     AND nullif(trim(COALESCE(v_existing_handle, '')), '') IS NOT NULL
     AND lower(v_existing_handle) IS DISTINCT FROM lower(v_handle) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Citizen iD handle does not match your verified RSI Handle. Clear your handle first if you meant to switch.'
    );
  END IF;

  IF p_public_org_sids IS NOT NULL THEN
    FOREACH v_sid IN ARRAY p_public_org_sids LOOP
      v_sid := nullif(upper(trim(v_sid)), '');
      IF v_sid IS NOT NULL AND NOT (v_sid = ANY (v_sids)) THEN
        v_sids := array_append(v_sids, v_sid);
      END IF;
    END LOOP;
  END IF;

  IF v_primary IS NOT NULL AND NOT (v_primary = ANY (v_sids)) THEN
    v_sids := array_prepend(v_primary, v_sids);
  END IF;

  INSERT INTO public.spectrum_citizens (
    user_id, citizenid_sub, rsi_handle, rsi_citizen_id, rsi_spectrum_id,
    rsi_display_name, enlisted_at, avatar_url, oauth_avatar_url, primary_org_sid,
    account_type, cid_verified, source, claims, linked_at, last_sync_at, updated_at
  )
  VALUES (
    p_user_id, v_sub, v_handle, nullif(trim(p_rsi_citizen_id), ''),
    nullif(trim(p_rsi_spectrum_id), ''), nullif(trim(p_rsi_display_name), ''),
    p_enlisted_at, nullif(trim(p_avatar_url), ''),
    COALESCE(nullif(trim(p_oauth_avatar_url), ''), (
      SELECT oauth_avatar_url FROM public.spectrum_citizens WHERE user_id = p_user_id
    )),
    v_primary, v_type, true, 'citizenid', COALESCE(p_claims, '{}'::jsonb),
    COALESCE((SELECT linked_at FROM public.spectrum_citizens WHERE user_id = p_user_id), now()),
    now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    citizenid_sub = EXCLUDED.citizenid_sub,
    rsi_handle = EXCLUDED.rsi_handle,
    rsi_citizen_id = EXCLUDED.rsi_citizen_id,
    rsi_spectrum_id = EXCLUDED.rsi_spectrum_id,
    rsi_display_name = EXCLUDED.rsi_display_name,
    enlisted_at = EXCLUDED.enlisted_at,
    avatar_url = EXCLUDED.avatar_url,
    oauth_avatar_url = COALESCE(EXCLUDED.oauth_avatar_url, public.spectrum_citizens.oauth_avatar_url),
    primary_org_sid = EXCLUDED.primary_org_sid,
    account_type = EXCLUDED.account_type,
    cid_verified = true,
    source = 'citizenid',
    claims = EXCLUDED.claims,
    linked_at = COALESCE(public.spectrum_citizens.linked_at, now()),
    last_sync_at = now(),
    updated_at = now();

  DELETE FROM public.spectrum_citizen_orgs WHERE user_id = p_user_id;
  IF cardinality(v_sids) > 0 THEN
    INSERT INTO public.spectrum_citizen_orgs (user_id, org_sid, is_primary)
    SELECT p_user_id, sid, (sid = v_primary)
    FROM unnest(v_sids) AS sid;
  END IF;

  v_mark := public.mark_rsi_handle_verified(p_user_id, v_handle);
  IF COALESCE(v_mark->>'success', 'false') <> 'true' THEN
    RETURN v_mark;
  END IF;

  IF nullif(trim(p_avatar_url), '') IS NOT NULL THEN
    UPDATE public.profiles
    SET avatar_url = trim(p_avatar_url), updated_at = now()
    WHERE id = p_user_id;
  END IF;

  IF nullif(trim(p_refresh_token), '') IS NOT NULL THEN
    INSERT INTO public.spectrum_oauth_tokens (user_id, refresh_token, updated_at)
    VALUES (p_user_id, trim(p_refresh_token), now())
    ON CONFLICT (user_id) DO UPDATE SET
      refresh_token = EXCLUDED.refresh_token,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_spectrum_from_citizenid(
  uuid, text, text, text, text, text, date, text, text, text[], text, boolean, jsonb, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_spectrum_from_citizenid(
  uuid, text, text, text, text, text, date, text, text, text[], text, boolean, jsonb, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.unlink_my_citizenid()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_oauth text;
  v_live int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT count(*)::int INTO v_live
  FROM public.custom_orders
  WHERE status IN ('accepted', 'in_progress', 'ready_for_pickup')
    AND (requester_id = v_uid OR assignee_id = v_uid);

  IF v_live > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Finish or delete your account to close accepted orders before removing Citizen iD.'
    );
  END IF;

  SELECT oauth_avatar_url INTO v_oauth
  FROM public.spectrum_citizens
  WHERE user_id = v_uid;

  DELETE FROM public.spectrum_oauth_pending WHERE user_id = v_uid;
  DELETE FROM public.spectrum_oauth_tokens WHERE user_id = v_uid;
  DELETE FROM public.spectrum_citizen_orgs WHERE user_id = v_uid;
  DELETE FROM public.spectrum_citizens WHERE user_id = v_uid;

  PERFORM public.profiles_begin_privileged_update();
  UPDATE public.profiles
  SET
    rsi_handle = NULL,
    rsi_handle_verified = false,
    rsi_handle_verified_at = NULL,
    avatar_url = COALESCE(v_oauth, avatar_url),
    updated_at = now()
  WHERE id = v_uid;

  DELETE FROM public.rsi_verify_challenges WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true, 'oauth_avatar_url', v_oauth);
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_my_citizenid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_my_citizenid() TO authenticated;

CREATE OR REPLACE FUNCTION public.take_citizenid_refresh_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT refresh_token INTO v_token
  FROM public.spectrum_oauth_tokens
  WHERE user_id = p_user_id;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.take_citizenid_refresh_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.take_citizenid_refresh_token(uuid) TO service_role;

-- Block new bio challenges after grace is started
CREATE OR REPLACE FUNCTION public.issue_rsi_verify_challenge(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_handle text := nullif(trim(p_handle), '');
  v_code text;
  v_expires timestamptz := now() + interval '30 minutes';
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_part text := '';
  v_current_handle text;
  v_current_verified boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF public.citizenid_new_bio_blocked() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Verify your RSI Handle with Link Citizen iD in Settings'
    );
  END IF;

  IF v_handle IS NULL OR length(v_handle) < 2 OR length(v_handle) > 64 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid RSI handle');
  END IF;

  IF NOT public.is_rsi_handle_available(v_handle, v_uid) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This RSI Handle is already verified by another user'
    );
  END IF;

  SELECT rsi_handle, COALESCE(rsi_handle_verified, false)
  INTO v_current_handle, v_current_verified
  FROM public.profiles
  WHERE id = v_uid;

  IF v_current_verified AND lower(COALESCE(v_current_handle, '')) = lower(v_handle) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_verified', true,
      'handle', v_handle
    );
  END IF;

  IF v_current_verified OR v_current_handle IS NOT NULL THEN
    PERFORM public.profiles_begin_privileged_update();
    UPDATE public.profiles
    SET
      rsi_handle = NULL,
      rsi_handle_verified = false,
      rsi_handle_verified_at = NULL,
      updated_at = now()
    WHERE id = v_uid;
  END IF;

  FOR v_i IN 1..6 LOOP
    v_part := v_part || substr(
      v_alphabet,
      1 + floor(random() * length(v_alphabet))::int,
      1
    );
  END LOOP;
  v_code := 'DR-' || v_part;

  INSERT INTO public.rsi_verify_challenges (user_id, handle, code, expires_at, created_at)
  VALUES (v_uid, v_handle, v_code, v_expires, now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    handle = EXCLUDED.handle,
    code = EXCLUDED.code,
    expires_at = EXCLUDED.expires_at,
    created_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'handle', v_handle,
    'expires_at', v_expires,
    'cleared_previous', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._friend_is_rsi_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_rsi_verified_for_gates(p_user_id);
$$;
