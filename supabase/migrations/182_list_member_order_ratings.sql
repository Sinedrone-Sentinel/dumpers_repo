-- 182: List star ratings + optional comments for a member's buyer or fulfiller rep.

CREATE OR REPLACE FUNCTION public.list_member_order_ratings(
  p_user_id uuid,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_rater_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF NOT public.can_access_preview_features() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not permitted');
  END IF;
  IF p_user_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('buyer', 'fulfiller') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid request');
  END IF;

  v_rater_role := CASE WHEN p_kind = 'buyer' THEN 'fulfiller' ELSE 'requester' END;

  RETURN jsonb_build_object(
    'success', true,
    'ratings', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          r.stars,
          r.comment,
          r.is_auto,
          r.created_at,
          o.title AS order_title,
          COALESCE(
            NULLIF(BTRIM(p.rsi_handle), ''),
            NULLIF(BTRIM(p.display_name), ''),
            'Member'
          ) AS rater_name
        FROM public.custom_order_ratings r
        INNER JOIN public.custom_orders o ON o.id = r.order_id
        INNER JOIN public.profiles p ON p.id = r.rater_id
        WHERE r.ratee_id = p_user_id
          AND r.rater_role = v_rater_role
        ORDER BY r.created_at DESC
        LIMIT 100
      ) x
    ), '[]'::jsonb)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_member_order_ratings(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_member_order_ratings(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_member_order_ratings(uuid, text) TO authenticated;
