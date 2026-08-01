-- =============================================================================
-- 136: RSI handle bio-code verification challenge
-- =============================================================================
-- Existence-only verify is not enough. Members request a short-lived code, paste
-- it into their public RSI citizen bio, then validate-rsi-handle scrapes the bio
-- and stamps verification (service_role mark_rsi_handle_verified).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rsi_verify_challenges (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rsi_verify_challenges_code_format
    CHECK (code ~ '^DR-[A-Z0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS rsi_verify_challenges_expires_idx
  ON public.rsi_verify_challenges (expires_at);

ALTER TABLE public.rsi_verify_challenges ENABLE ROW LEVEL SECURITY;

-- No direct client table access — RPCs only.
REVOKE ALL ON TABLE public.rsi_verify_challenges FROM PUBLIC;
REVOKE ALL ON TABLE public.rsi_verify_challenges FROM anon, authenticated;

COMMENT ON TABLE public.rsi_verify_challenges IS
  'Short-lived RSI bio verification codes. Members read via issue/get RPCs; Edge uses service helpers.';

-- -----------------------------------------------------------------------------
-- issue_rsi_verify_challenge — member requests a new code for a handle
-- -----------------------------------------------------------------------------
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
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

  -- Already verified for this handle — no challenge needed.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid
      AND rsi_handle_verified = true
      AND lower(rsi_handle) = lower(v_handle)
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_verified', true,
      'handle', v_handle
    );
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

  -- Persist unverified handle so the profile stays in sync while they edit bio.
  UPDATE public.profiles
  SET
    rsi_handle = v_handle,
    updated_at = now()
  WHERE id = v_uid
    AND COALESCE(rsi_handle_verified, false) = false;

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'handle', v_handle,
    'expires_at', v_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_rsi_verify_challenge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_rsi_verify_challenge(text) TO authenticated;

COMMENT ON FUNCTION public.issue_rsi_verify_challenge(text) IS
  'Issues a 30-minute RSI bio verification code for the caller. Replaces any prior challenge.';

-- -----------------------------------------------------------------------------
-- get_my_rsi_verify_challenge — member can re-display active code
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_rsi_verify_challenge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.rsi_verify_challenges%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_row
  FROM public.rsi_verify_challenges
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'active', false);
  END IF;

  IF v_row.expires_at <= now() THEN
    DELETE FROM public.rsi_verify_challenges WHERE user_id = v_uid;
    RETURN jsonb_build_object('success', true, 'active', false, 'expired', true);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'active', true,
    'code', v_row.code,
    'handle', v_row.handle,
    'expires_at', v_row.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_rsi_verify_challenge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rsi_verify_challenge() TO authenticated;

-- -----------------------------------------------------------------------------
-- service_get_rsi_verify_challenge — Edge Function only
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_get_rsi_verify_challenge(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.rsi_verify_challenges%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User required');
  END IF;

  SELECT * INTO v_row
  FROM public.rsi_verify_challenges
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active verification code — request a new code first');
  END IF;

  IF v_row.expires_at <= now() THEN
    DELETE FROM public.rsi_verify_challenges WHERE user_id = p_user_id;
    RETURN jsonb_build_object('success', false, 'error', 'Verification code expired — request a new code');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', v_row.code,
    'handle', v_row.handle,
    'expires_at', v_row.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_get_rsi_verify_challenge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_get_rsi_verify_challenge(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_rsi_verify_challenge(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- service_clear_rsi_verify_challenge — Edge Function after success
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_clear_rsi_verify_challenge(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.rsi_verify_challenges WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.service_clear_rsi_verify_challenge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_clear_rsi_verify_challenge(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_clear_rsi_verify_challenge(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- admin_force_rsi_handle_verified — officer escape hatch when scrape fails
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_force_rsi_handle_verified(
  p_user_id uuid,
  p_handle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handle text := nullif(trim(p_handle), '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('officer', 'super-admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  IF p_user_id IS NULL OR v_handle IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User and handle are required');
  END IF;

  IF NOT public.is_rsi_handle_available(v_handle, p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This RSI Handle is already verified by another user'
    );
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = v_handle,
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  DELETE FROM public.rsi_verify_challenges WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) IS
  'Officer/super-admin manual RSI verify when public bio scrape fails. Prefer normal bio-code flow.';
