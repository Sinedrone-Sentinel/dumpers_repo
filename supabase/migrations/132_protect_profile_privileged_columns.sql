-- =============================================================================
-- 132: Lock privileged profile columns against client UPDATE
-- =============================================================================
-- Blocks direct PostgREST updates to role / approved_* / rsi_handle_verified*.
-- Trusted SECURITY DEFINER paths must call profiles_begin_privileged_update().
-- service_role (Edge Functions) is always allowed.
-- Officer blast-radius policy profiles_update_officers is dropped; role changes
-- go through admin_set_user_role().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bypass helpers (transaction-local GUC)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_privileged_update_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN true;
  END IF;
  IF current_setting('app.profiles_privileged_ok', true) = '1' THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_begin_privileged_update()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.profiles_privileged_ok', '1', true);
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_begin_privileged_update() FROM PUBLIC;
-- Only definer functions / owners need this; do not grant to authenticated.

-- -----------------------------------------------------------------------------
-- BEFORE UPDATE guard
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

    -- Changing RSI handle clears verification (client may update handle only).
    IF NEW.rsi_handle IS DISTINCT FROM OLD.rsi_handle THEN
      NEW.rsi_handle_verified := false;
      NEW.rsi_handle_verified_at := NULL;
    ELSIF NEW.rsi_handle_verified IS DISTINCT FROM OLD.rsi_handle_verified
       OR NEW.rsi_handle_verified_at IS DISTINCT FROM OLD.rsi_handle_verified_at THEN
      RAISE EXCEPTION 'Cannot modify RSI verification fields via direct update';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_privileged_columns();

-- Officers/super-admins must not UPDATE arbitrary profile rows via PostgREST.
DROP POLICY IF EXISTS "profiles_update_officers" ON public.profiles;

-- Own-row updates remain (prefs, rsi_handle text, etc.) — privileged cols guarded by trigger.

-- -----------------------------------------------------------------------------
-- admin_set_user_role — replaces AdminPanel direct .update({ role })
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('pending', 'member', 'officer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  -- Never assign super-admin through this RPC
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_target_role = 'super-admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change super-admin role');
  END IF;

  IF p_user_id = v_caller_id AND p_role IS DISTINCT FROM v_target_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change your own role');
  END IF;

  -- Officers: pending/member → member or officer only from member→officer / pending→member
  -- Match AdminPanel: officer can promote pending→member and member→officer; only
  -- super-admin demotes officer→member.
  IF v_caller_role = 'officer' THEN
    IF p_role = 'officer' AND v_target_role <> 'member' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Officers can only promote members to officer');
    END IF;
    IF p_role = 'member' AND v_target_role NOT IN ('pending', 'member') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Officers cannot demote officers');
    END IF;
    IF p_role = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Officers cannot set pending');
    END IF;
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    role = p_role,
    approved_at = CASE
      WHEN p_role IN ('member', 'officer') THEN now()
      ELSE approved_at
    END,
    approved_by = CASE
      WHEN p_role IN ('member', 'officer') THEN v_caller_id
      ELSE approved_by
    END,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'role', p_role);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Patch trusted RPCs that touch privileged columns
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_rsi_handle_verified(p_user_id uuid, p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_rsi_handle_available(p_handle, p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle is already verified by another user');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = p_handle,
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Keep existing grants (authenticated still has execute — P0 #7 follow-up).
GRANT EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_rsi_verification(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_display_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super-admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Super-admin access required');
  END IF;

  SELECT id, display_name INTO v_profile_id, v_display_name
  FROM public.profiles
  WHERE lower(rsi_handle) = lower(p_handle)
    AND rsi_handle_verified = true;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No verified user found with that RSI Handle');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle_verified = false,
    rsi_handle_verified_at = NULL,
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', v_profile_id,
    'display_name', v_display_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.officer_revoke_rsi_verification(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_profile_id uuid;
  v_display_name text;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  SELECT id, display_name INTO v_profile_id, v_display_name
  FROM public.profiles
  WHERE lower(rsi_handle) = lower(p_handle)
    AND rsi_handle_verified = true;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No verified user found with that RSI Handle');
  END IF;

  IF v_user_role = 'officer' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_profile_id AND role = 'super-admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot revoke super-admin RSI Handle');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle_verified = false,
    rsi_handle_verified_at = NULL,
    rsi_handle = NULL,
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN jsonb_build_object('success', true, 'display_name', v_display_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.officer_revoke_rsi_verification(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.banned_users WHERE id = caller_id) THEN
    RAISE EXCEPTION 'Banned accounts cannot be deleted through settings';
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF caller_role = 'super-admin' THEN
    RAISE EXCEPTION 'Super-admin accounts cannot self-delete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.custom_orders
    WHERE status IN ('accepted', 'in_progress', 'ready_for_pickup')
      AND (requester_id = caller_id OR assignee_id = caller_id)
  ) THEN
    RAISE EXCEPTION 'Complete or cancel active orders before deleting your account';
  END IF;

  PERFORM public.profiles_begin_privileged_update();
  UPDATE public.profiles SET approved_by = NULL WHERE approved_by = caller_id;

  DELETE FROM public.acquired_blueprints WHERE user_id = caller_id;
  DELETE FROM public.profiles WHERE id = caller_id;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', caller_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
