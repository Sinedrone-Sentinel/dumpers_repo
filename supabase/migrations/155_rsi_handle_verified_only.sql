-- =============================================================================
-- 155: RSI handle is verified-only (no staged / unverified handles on profiles)
-- =============================================================================
-- - Client cannot set rsi_handle via PostgREST (privileged path only)
-- - issue_rsi_verify_challenge no longer writes profiles.rsi_handle
-- - Changing away from a verified handle clears it immediately
-- - One-shot: wipe all unverified rsi_handle values
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clear every unverified handle now (keep verified rows intact)
-- -----------------------------------------------------------------------------
SELECT public.profiles_begin_privileged_update();

UPDATE public.profiles
SET
  rsi_handle = NULL,
  rsi_handle_verified = false,
  rsi_handle_verified_at = NULL,
  updated_at = now()
WHERE COALESCE(rsi_handle_verified, false) = false
  AND rsi_handle IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Trigger: block direct client writes to rsi_handle entirely
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_protect_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ok boolean := public.profiles_privileged_update_allowed();
BEGIN
  IF NOT v_ok THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify profile role via direct update';
    END IF;

    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
      RAISE EXCEPTION 'Cannot modify profile approval fields via direct update';
    END IF;

    -- RSI handle + verification flags: DEFINER / service_role only
    IF NEW.rsi_handle IS DISTINCT FROM OLD.rsi_handle
       OR NEW.rsi_handle_verified IS DISTINCT FROM OLD.rsi_handle_verified
       OR NEW.rsi_handle_verified_at IS DISTINCT FROM OLD.rsi_handle_verified_at THEN
      RAISE EXCEPTION 'Cannot modify RSI handle or verification via direct update';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- clear_my_rsi_handle — member starts a change / abandons staged verify
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_my_rsi_handle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = NULL,
    rsi_handle_verified = false,
    rsi_handle_verified_at = NULL,
    updated_at = now()
  WHERE id = v_uid;

  DELETE FROM public.rsi_verify_challenges WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_my_rsi_handle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_my_rsi_handle() TO authenticated;

COMMENT ON FUNCTION public.clear_my_rsi_handle() IS
  'Clears the caller''s RSI handle and verification so they can verify a new (or re-verify an old) handle.';

-- -----------------------------------------------------------------------------
-- issue_rsi_verify_challenge — challenge only; never stage unverified handle
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
  v_current_handle text;
  v_current_verified boolean;
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

  SELECT rsi_handle, COALESCE(rsi_handle_verified, false)
  INTO v_current_handle, v_current_verified
  FROM public.profiles
  WHERE id = v_uid;

  -- Already verified for this exact handle — no challenge needed.
  IF v_current_verified AND lower(COALESCE(v_current_handle, '')) = lower(v_handle) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_verified', true,
      'handle', v_handle
    );
  END IF;

  -- Changing away from a verified handle: wipe it until the new one verifies.
  IF v_current_verified
     OR v_current_handle IS NOT NULL THEN
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

  -- Intentionally do NOT write profiles.rsi_handle until mark_rsi_handle_verified.

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'handle', v_handle,
    'expires_at', v_expires,
    'cleared_previous', true
  );
END;
$$;

COMMENT ON FUNCTION public.issue_rsi_verify_challenge(text) IS
  'Issues a 30-minute RSI bio verification code. Does not set profiles.rsi_handle until verification succeeds; clears any prior handle when starting a new challenge.';

-- -----------------------------------------------------------------------------
-- Discord onboarding notice: only show verified handles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_welcome_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_already_seen boolean;
  v_display_name text;
  v_email text;
  v_rsi_handle text;
  v_rsi_verified boolean;
  v_discord_color int := 5865242;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    has_seen_welcome,
    COALESCE(display_name, ''),
    COALESCE(email, ''),
    COALESCE(rsi_handle, ''),
    COALESCE(rsi_handle_verified, false)
  INTO v_already_seen, v_display_name, v_email, v_rsi_handle, v_rsi_verified
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT COALESCE(v_already_seen, false) THEN
    PERFORM public.queue_discord_message(
      'admin',
      'New User Joined',
      'A new member has completed onboarding.',
      v_discord_color,
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Display Name',
          'value', COALESCE(NULLIF(v_display_name, ''), 'Not set'),
          'inline', true
        ),
        jsonb_build_object(
          'name', 'RSI Handle',
          'value', CASE
            WHEN v_rsi_verified AND nullif(v_rsi_handle, '') IS NOT NULL
              THEN v_rsi_handle
            ELSE 'Not verified'
          END,
          'inline', true
        ),
        jsonb_build_object(
          'name', 'Email',
          'value', COALESCE(NULLIF(v_email, ''), 'Unknown'),
          'inline', false
        )
      )
    );
  END IF;

  UPDATE public.profiles
  SET has_seen_welcome = true
  WHERE id = v_user_id;
END;
$$;
