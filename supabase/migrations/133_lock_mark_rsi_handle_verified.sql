-- =============================================================================
-- 133: Lock mark_rsi_handle_verified to service_role only
-- =============================================================================
-- Members must verify via the validate-rsi-handle Edge Function (service_role).
-- Direct client RPC calls can no longer stamp rsi_handle_verified.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_rsi_handle_verified(p_user_id uuid, p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Edge Function only (service_role JWT). Never callable as a member session.
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_user_id IS NULL OR p_handle IS NULL OR length(trim(p_handle)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'User and handle are required');
  END IF;

  IF NOT public.is_rsi_handle_available(p_handle, p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle is already verified by another user');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = trim(p_handle),
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) TO service_role;

COMMENT ON FUNCTION public.mark_rsi_handle_verified(uuid, text) IS
  'Marks an RSI handle verified. Callable only with service_role (validate-rsi-handle Edge Function).';
