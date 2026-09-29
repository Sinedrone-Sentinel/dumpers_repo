-- 204: Automatic ratings on WTS deals landed in the wrong reputation.
--
-- Buyer rep = ratings with rater_role 'fulfiller'; fulfiller (seller) rep = rater_role 'requester'.
-- Manual archive (078) flips rater_role on WTS because the poster is the seller there.
-- auto_apply_order_rating wrote the caller's position instead, so on WTS a buyer's
-- no-show 1-star counted against their seller rep, and auto 5-stars swapped sides.
--
-- p_rater_role stays the rater's position on the order ('requester' = poster,
-- 'fulfiller' = assignee) so every caller keeps working; the stored rater_role is
-- now the reputation bucket, matching manual archive.

CREATE OR REPLACE FUNCTION public.auto_apply_order_rating(
  p_order_id uuid,
  p_rater_id uuid,
  p_ratee_id uuid,
  p_rater_role text,
  p_stars smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_type text;
  v_bucket text;
BEGIN
  SELECT COALESCE(listing_type, 'wtb') INTO v_listing_type
  FROM public.custom_orders
  WHERE id = p_order_id;

  v_bucket := CASE
    WHEN v_listing_type = 'wts' AND p_rater_role = 'requester' THEN 'fulfiller'
    WHEN v_listing_type = 'wts' THEN 'requester'
    ELSE p_rater_role
  END;

  INSERT INTO public.custom_order_ratings (
    order_id, rater_id, ratee_id, rater_role, stars, is_auto
  )
  VALUES (p_order_id, p_rater_id, p_ratee_id, v_bucket, p_stars, true)
  ON CONFLICT (order_id, rater_id) DO NOTHING;

  IF p_rater_role = 'requester' THEN
    UPDATE public.custom_orders
    SET requester_archived_at = COALESCE(requester_archived_at, now()), updated_at = now()
    WHERE id = p_order_id;
  ELSE
    UPDATE public.custom_orders
    SET fulfiller_archived_at = COALESCE(fulfiller_archived_at, now()), updated_at = now()
    WHERE id = p_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_apply_order_rating(uuid, uuid, uuid, text, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_apply_order_rating(uuid, uuid, uuid, text, smallint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_apply_order_rating(uuid, uuid, uuid, text, smallint) TO service_role;

-- Every automatic rating written before this migration used the position, so on
-- WTS deals each one sits in the opposite reputation. Manual ratings are untouched.
UPDATE public.custom_order_ratings r
SET rater_role = CASE r.rater_role WHEN 'requester' THEN 'fulfiller' ELSE 'requester' END
FROM public.custom_orders o
WHERE o.id = r.order_id
  AND o.listing_type = 'wts'
  AND r.is_auto = true;

-- 186 passed an integer literal; auto_apply_order_rating only accepts smallint.
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
        5::smallint
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