-- =============================================================================
-- 198: Admin Panel — Citizen iD members vs legacy RSI verified
-- =============================================================================
-- Officers and super-admins can list members in three buckets and read one
-- member's Citizen iD snapshot. Refresh tokens stay in spectrum_oauth_tokens
-- and are not returned. Members cannot call these.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_require_officer()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('officer', 'super-admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_require_officer() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_members_by_verification(
  p_bucket text,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket text := lower(btrim(COALESCE(p_bucket, '')));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_users jsonb;
  v_total integer;
  v_citizenid integer;
  v_rsi integer;
  v_unverified integer;
BEGIN
  PERFORM public.admin_require_officer();

  IF v_bucket NOT IN ('citizenid', 'rsi_verified', 'unverified') THEN
    RAISE EXCEPTION 'Unknown member list';
  END IF;

  SELECT
    count(*) FILTER (WHERE s.user_id IS NOT NULL),
    count(*) FILTER (
      WHERE s.user_id IS NULL AND COALESCE(p.rsi_handle_verified, false)
    ),
    count(*) FILTER (
      WHERE s.user_id IS NULL AND NOT COALESCE(p.rsi_handle_verified, false)
    )
  INTO v_citizenid, v_rsi, v_unverified
  FROM public.profiles p
  LEFT JOIN public.spectrum_citizens s
    ON s.user_id = p.id
   AND s.citizenid_sub IS NOT NULL
  WHERE p.role = 'member';

  SELECT count(*)
  INTO v_total
  FROM public.profiles p
  LEFT JOIN public.spectrum_citizens s
    ON s.user_id = p.id
   AND s.citizenid_sub IS NOT NULL
  WHERE p.role = 'member'
    AND (
      (v_bucket = 'citizenid' AND s.user_id IS NOT NULL)
      OR (
        v_bucket = 'rsi_verified'
        AND s.user_id IS NULL
        AND COALESCE(p.rsi_handle_verified, false)
      )
      OR (
        v_bucket = 'unverified'
        AND s.user_id IS NULL
        AND NOT COALESCE(p.rsi_handle_verified, false)
      )
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.created_at DESC, row.id), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT
      p.id,
      p.email,
      p.display_name,
      p.avatar_url,
      p.rsi_handle,
      p.rsi_handle_verified,
      p.rsi_handle_verified_at,
      p.role,
      p.created_at
    FROM public.profiles p
    LEFT JOIN public.spectrum_citizens s
      ON s.user_id = p.id
     AND s.citizenid_sub IS NOT NULL
    WHERE p.role = 'member'
      AND (
        (v_bucket = 'citizenid' AND s.user_id IS NOT NULL)
        OR (
          v_bucket = 'rsi_verified'
          AND s.user_id IS NULL
          AND COALESCE(p.rsi_handle_verified, false)
        )
        OR (
          v_bucket = 'unverified'
          AND s.user_id IS NULL
          AND NOT COALESCE(p.rsi_handle_verified, false)
        )
      )
    ORDER BY p.created_at DESC, p.id
    LIMIT v_limit
    OFFSET v_offset
  ) row;

  RETURN jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'counts', jsonb_build_object(
      'citizenid', COALESCE(v_citizenid, 0),
      'rsi_verified', COALESCE(v_rsi, 0),
      'unverified', COALESCE(v_unverified, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_members_by_verification(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_members_by_verification(text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_citizenid_claim_is_secret(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(COALESCE(p_key, '')) ~ '(token|secret|password|verifier|nonce|at_hash|c_hash|s_hash)';
$$;

REVOKE ALL ON FUNCTION public.admin_citizenid_claim_is_secret(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_citizenid_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.spectrum_citizens%ROWTYPE;
  v_orgs jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
BEGIN
  PERFORM public.admin_require_officer();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  SELECT * INTO v_row
  FROM public.spectrum_citizens
  WHERE user_id = p_user_id
    AND citizenid_sub IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This member is not linked with Citizen iD';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'org_sid', o.org_sid,
    'is_primary', o.is_primary
  ) ORDER BY o.is_primary DESC, o.org_sid), '[]'::jsonb)
  INTO v_orgs
  FROM public.spectrum_citizen_orgs o
  WHERE o.user_id = p_user_id;

  FOR v_key, v_val IN
    SELECT key, value FROM jsonb_each(COALESCE(v_row.claims, '{}'::jsonb))
  LOOP
    IF public.admin_citizenid_claim_is_secret(v_key) THEN
      CONTINUE;
    END IF;
    IF lower(v_key) IN (
      'iss', 'aud', 'exp', 'iat', 'nbf', 'azp', 'auth_time', 'idp', 'amr', 'sid',
      'sub',
      'urn:user:rsi:username',
      'urn:user:rsi:citizenid',
      'urn:user:rsi:spectrumid',
      'urn:user:rsi:displayname',
      'urn:user:rsi:enlistedat',
      'urn:user:rsi:avatar:url',
      'urn:user:rsi:orgs:primary',
      'urn:user:rsi:orgs:public'
    ) THEN
      CONTINUE;
    END IF;
    v_extra := v_extra || jsonb_build_object(v_key, v_val);
  END LOOP;

  RETURN jsonb_build_object(
    'rsi_handle', v_row.rsi_handle,
    'rsi_display_name', v_row.rsi_display_name,
    'rsi_citizen_id', v_row.rsi_citizen_id,
    'rsi_spectrum_id', v_row.rsi_spectrum_id,
    'enlisted_at', v_row.enlisted_at,
    'account_type', v_row.account_type,
    'cid_verified', v_row.cid_verified,
    'primary_org_sid', v_row.primary_org_sid,
    'orgs', COALESCE(v_orgs, '[]'::jsonb),
    'avatar_url', v_row.avatar_url,
    'citizenid_sub', v_row.citizenid_sub,
    'linked_at', v_row.linked_at,
    'last_sync_at', v_row.last_sync_at,
    'extra', v_extra
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_citizenid_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_citizenid_stats(uuid) TO authenticated;
