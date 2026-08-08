-- =============================================================================
-- 162: Member Left Discord + harden account self-delete cleanup
-- =============================================================================
-- Staff admin webhook: "Member Left the Site" when a member self-deletes
-- (no analytics / order counts / invoke metrics).
--
-- Also fixes two FKs that could block DELETE FROM profiles:
--   discord_webhooks.registered_by_user_id  (NO ACTION)
--   discord_settings.updated_by             (NO ACTION)
-- Explicit webhook delete + settings null before profile delete (defense in depth).
-- Discord enqueue failures must never block account deletion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FK hardening
-- -----------------------------------------------------------------------------
ALTER TABLE public.discord_webhooks
  DROP CONSTRAINT IF EXISTS discord_webhooks_registered_by_user_id_fkey;

ALTER TABLE public.discord_webhooks
  ADD CONSTRAINT discord_webhooks_registered_by_user_id_fkey
  FOREIGN KEY (registered_by_user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.discord_settings
  DROP CONSTRAINT IF EXISTS discord_settings_updated_by_fkey;

ALTER TABLE public.discord_settings
  ADD CONSTRAINT discord_settings_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Queue helper (DEFINER only; never grant to authenticated)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_member_left_discord(
  p_display_name text,
  p_rsi_handle text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discord_color int := 10070709; -- muted gray
BEGIN
  RETURN public.queue_discord_message(
    'admin',
    'Member Left the Site',
    'A member has deleted their account.',
    v_discord_color,
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Display Name',
        'value', COALESCE(NULLIF(TRIM(p_display_name), ''), 'Not set'),
        'inline', true
      ),
      jsonb_build_object(
        'name', 'RSI Handle',
        'value', COALESCE(NULLIF(TRIM(p_rsi_handle), ''), 'Not set'),
        'inline', true
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.queue_member_left_discord(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_member_left_discord(text, text) TO service_role;

COMMENT ON FUNCTION public.queue_member_left_discord(text, text) IS
  'Enqueue staff Discord when a member self-deletes (identity only; no metrics).';

-- -----------------------------------------------------------------------------
-- delete_own_account — notify + unblock Discord FKs + delete profile
-- Cascades cover member tables; analytics SET NULL; auth.users cleaned by Edge.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  v_display_name text;
  v_rsi_handle text;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.banned_users WHERE id = caller_id) THEN
    RAISE EXCEPTION 'Banned accounts cannot be deleted through settings';
  END IF;

  SELECT role, display_name, rsi_handle
    INTO caller_role, v_display_name, v_rsi_handle
  FROM public.profiles
  WHERE id = caller_id;

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

  -- Staff alert before rows disappear (never block delete on Discord failure)
  BEGIN
    PERFORM public.queue_member_left_discord(v_display_name, v_rsi_handle);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'queue_member_left_discord failed for %: %', caller_id, SQLERRM;
  END;

  PERFORM public.profiles_begin_privileged_update();
  UPDATE public.profiles SET approved_by = NULL WHERE approved_by = caller_id;

  -- Unblock / remove Discord ownership before profile row goes away
  UPDATE public.discord_settings SET updated_by = NULL WHERE updated_by = caller_id;
  DELETE FROM public.discord_webhooks WHERE registered_by_user_id = caller_id;

  DELETE FROM public.profiles WHERE id = caller_id;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', caller_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

COMMENT ON FUNCTION public.delete_own_account() IS
  'Member self-delete: staff Discord (Member Left the Site), Discord webhook cleanup, then DELETE profiles (cascades). Edge delete-account removes auth.users + storage screenshots.';
