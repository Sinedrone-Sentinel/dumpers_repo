-- =============================================================================
-- 160: Staff Discord when an RSI handle becomes verified
-- =============================================================================
-- Fires once on false → true from mark_rsi_handle_verified (Edge) and
-- admin_force_rsi_handle_verified (officer escape hatch).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.queue_rsi_verified_discord(
  p_user_id uuid,
  p_display_name text,
  p_email text,
  p_rsi_handle text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discord_color int := 5763719; -- green-ish success
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.queue_discord_message(
    'admin',
    'RSI Handle Verified',
    'A member verified their RSI handle.',
    v_discord_color,
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Display Name',
        'value', COALESCE(NULLIF(TRIM(p_display_name), ''), 'Not set'),
        'inline', true
      ),
      jsonb_build_object(
        'name', 'RSI Handle',
        'value', COALESCE(NULLIF(TRIM(p_rsi_handle), ''), 'Unknown'),
        'inline', true
      ),
      jsonb_build_object(
        'name', 'Email',
        'value', COALESCE(NULLIF(TRIM(p_email), ''), 'Unknown'),
        'inline', false
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.queue_rsi_verified_discord(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_rsi_verified_discord(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_rsi_handle_verified(p_user_id uuid, p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_verified boolean;
  v_display_name text;
  v_email text;
  v_handle text := trim(p_handle);
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_user_id IS NULL OR v_handle IS NULL OR length(v_handle) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'User and handle are required');
  END IF;

  IF NOT public.is_rsi_handle_available(v_handle, p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle is already verified by another user');
  END IF;

  SELECT
    COALESCE(rsi_handle_verified, false),
    display_name,
    email
  INTO v_was_verified, v_display_name, v_email
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = v_handle,
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT v_was_verified THEN
    BEGIN
      PERFORM public.queue_rsi_verified_discord(
        p_user_id,
        v_display_name,
        v_email,
        v_handle
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'queue_rsi_verified_discord failed for %: %', p_user_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) TO service_role;

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
  v_was_verified boolean;
  v_display_name text;
  v_email text;
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

  SELECT
    COALESCE(rsi_handle_verified, false),
    display_name,
    email
  INTO v_was_verified, v_display_name, v_email
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = v_handle,
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  DELETE FROM public.rsi_verify_challenges WHERE user_id = p_user_id;

  IF NOT v_was_verified THEN
    BEGIN
      PERFORM public.queue_rsi_verified_discord(
        p_user_id,
        v_display_name,
        v_email,
        v_handle
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'queue_rsi_verified_discord failed for %: %', p_user_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) TO authenticated;
