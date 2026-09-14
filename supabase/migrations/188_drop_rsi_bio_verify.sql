-- 188: Drop bio-code RSI verify. Member verify is Citizen iD only.
-- Keep mark_rsi_handle_verified (Citizen iD upsert) and officer revoke / force.

CREATE OR REPLACE FUNCTION public.unlink_my_citizenid()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
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

  RETURN jsonb_build_object('success', true, 'oauth_avatar_url', v_oauth);
END;
$body$;

REVOKE ALL ON FUNCTION public.unlink_my_citizenid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_my_citizenid() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_force_rsi_handle_verified(
  p_user_id uuid,
  p_handle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
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

    BEGIN
      PERFORM public.process_stashed_friend_invites_for_user(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_stashed_friend_invites_for_user failed for %: %', p_user_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$body$;

REVOKE ALL ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.issue_rsi_verify_challenge(text);
DROP FUNCTION IF EXISTS public.get_my_rsi_verify_challenge();
DROP FUNCTION IF EXISTS public.service_get_rsi_verify_challenge(uuid);
DROP FUNCTION IF EXISTS public.service_clear_rsi_verify_challenge(uuid);
DROP FUNCTION IF EXISTS public.clear_my_rsi_handle();
DROP FUNCTION IF EXISTS public.citizenid_new_bio_blocked();

DROP TABLE IF EXISTS public.rsi_verify_challenges;
