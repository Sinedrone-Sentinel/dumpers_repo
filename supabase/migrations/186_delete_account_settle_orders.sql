-- 186: Account delete settles live accepted deals (auto 5-star + rep item count).
-- Pending WTS/WTB listings are cancelled with no rating.
-- requester_id / rater_id become SET NULL so credit survives profile delete.

-- -----------------------------------------------------------------------------
-- FKs so completed/archived orders and auto ratings outlive the leaver
-- -----------------------------------------------------------------------------
ALTER TABLE public.custom_orders
  ALTER COLUMN requester_id DROP NOT NULL;

ALTER TABLE public.custom_orders
  DROP CONSTRAINT IF EXISTS custom_orders_requester_id_fkey;

ALTER TABLE public.custom_orders
  ADD CONSTRAINT custom_orders_requester_id_fkey
  FOREIGN KEY (requester_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE public.custom_order_ratings
  ALTER COLUMN rater_id DROP NOT NULL;

ALTER TABLE public.custom_order_ratings
  DROP CONSTRAINT IF EXISTS custom_order_ratings_rater_id_fkey;

ALTER TABLE public.custom_order_ratings
  ADD CONSTRAINT custom_order_ratings_rater_id_fkey
  FOREIGN KEY (rater_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_live_orders_for_account_delete(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.custom_orders%ROWTYPE;
  v_other uuid;
  v_role text;
BEGIN
  FOR v_order IN
    SELECT *
    FROM public.custom_orders
    WHERE status IN ('accepted', 'in_progress', 'ready_for_pickup')
      AND (requester_id = p_user_id OR assignee_id = p_user_id)
  LOOP
    IF v_order.requester_id = p_user_id THEN
      v_other := v_order.assignee_id;
      v_role := 'requester';
    ELSE
      v_other := v_order.requester_id;
      v_role := 'fulfiller';
    END IF;

    IF v_other IS NOT NULL THEN
      PERFORM public.auto_apply_order_rating(
        v_order.id,
        p_user_id,
        v_other,
        v_role,
        5
      );
    END IF;

    UPDATE public.custom_orders
    SET
      status = 'archived',
      requester_archived_at = COALESCE(requester_archived_at, now()),
      fulfiller_archived_at = COALESCE(fulfiller_archived_at, now()),
      updated_at = now()
    WHERE id = v_order.id;
  END LOOP;

  UPDATE public.custom_orders
  SET status = 'cancelled', updated_at = now()
  WHERE requester_id = p_user_id
    AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_live_orders_for_account_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_live_orders_for_account_delete(uuid) TO service_role;

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

  PERFORM public.settle_live_orders_for_account_delete(caller_id);

  BEGIN
    PERFORM public.queue_member_left_discord(v_display_name, v_rsi_handle);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'queue_member_left_discord failed for %: %', caller_id, SQLERRM;
  END;

  PERFORM public.profiles_begin_privileged_update();
  UPDATE public.profiles SET approved_by = NULL WHERE approved_by = caller_id;

  UPDATE public.discord_settings SET updated_by = NULL WHERE updated_by = caller_id;
  DELETE FROM public.discord_webhooks WHERE registered_by_user_id = caller_id;

  DELETE FROM public.profiles WHERE id = caller_id;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', caller_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

COMMENT ON FUNCTION public.delete_own_account() IS
  'Member self-delete: settle live deals (auto 5-star other party), cancel pending listings, Discord left-site, DELETE profiles (cascades Spectrum).';
