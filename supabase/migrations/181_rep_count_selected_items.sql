-- 181: Reputation progress counts selected items, not child-order rows.
-- A WTS/WTB checkout can include several crafts on one child deal (one chat,
-- one 72h timer). Pending (n/5) should match the item-by-item selection rules:
-- SUM(blueprint quantity) + each resource line. Empty/legacy orders count as 1.

CREATE OR REPLACE FUNCTION public.order_rep_item_count(p_order_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT GREATEST(
    COALESCE((
      SELECT SUM(b.quantity)::int
      FROM public.custom_order_blueprints b
      WHERE b.order_id = p_order_id
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::int
      FROM public.custom_order_resource_lines r
      WHERE r.order_id = p_order_id
    ), 0),
    1
  );
$fn$;

REVOKE ALL ON FUNCTION public.order_rep_item_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_rep_item_count(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.order_rep_item_count(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.order_rep_item_count(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_pending_buyer_rep(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND role IN ('officer', 'super-admin')
    ) THEN false
    ELSE (
      SELECT COALESCE(SUM(public.order_rep_item_count(o.id)), 0)
      FROM public.custom_orders o
      WHERE o.status IN ('completed', 'archived')
        AND (
          (o.listing_type = 'wtb' AND o.requester_id = p_user_id)
          OR (o.listing_type = 'wts' AND o.assignee_id = p_user_id)
        )
    ) < 5
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.has_pending_fulfiller_rep(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND role IN ('officer', 'super-admin')
    ) THEN false
    ELSE (
      SELECT COALESCE(SUM(public.order_rep_item_count(o.id)), 0)
      FROM public.custom_orders o
      WHERE o.status IN ('completed', 'archived')
        AND (
          (o.listing_type = 'wtb' AND o.assignee_id = p_user_id)
          OR (o.listing_type = 'wts' AND o.requester_id = p_user_id)
        )
    ) < 5
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.user_buyer_reputation(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN (
      SELECT COALESCE(SUM(public.order_rep_item_count(o.id)), 0)
      FROM public.custom_orders o
      WHERE o.status IN ('completed', 'archived')
        AND (
          (o.listing_type = 'wtb' AND o.requester_id = p_user_id)
          OR (o.listing_type = 'wts' AND o.assignee_id = p_user_id)
        )
    ) < 5 THEN NULL
    ELSE (
      SELECT ROUND(AVG(r.stars))::int
      FROM public.custom_order_ratings r
      WHERE r.ratee_id = p_user_id AND r.rater_role = 'fulfiller'
    )
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.user_fulfiller_reputation(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN (
      SELECT COALESCE(SUM(public.order_rep_item_count(o.id)), 0)
      FROM public.custom_orders o
      WHERE o.status IN ('completed', 'archived')
        AND (
          (o.listing_type = 'wtb' AND o.assignee_id = p_user_id)
          OR (o.listing_type = 'wts' AND o.requester_id = p_user_id)
        )
    ) < 5 THEN NULL
    ELSE (
      SELECT ROUND(AVG(r.stars))::int
      FROM public.custom_order_ratings r
      WHERE r.ratee_id = p_user_id AND r.rater_role = 'requester'
    )
  END;
$fn$;


DROP FUNCTION IF EXISTS public.get_member_reputations(uuid[]);

CREATE OR REPLACE FUNCTION public.get_member_reputations(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  buyer_completed_count int,
  buyer_rating_count int,
  buyer_reputation int,
  buyer_is_pending boolean,
  fulfiller_completed_count int,
  fulfiller_rating_count int,
  fulfiller_reputation int,
  fulfiller_is_pending boolean,
  fulfiller_avg_delivery_seconds int,
  fulfiller_delivery_sample_count int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH users AS (
    SELECT DISTINCT uid FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS uid WHERE uid IS NOT NULL
  ),
  buyer_completed AS (
    SELECT o.requester_id AS user_id, SUM(public.order_rep_item_count(o.id))::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.requester_id
    WHERE o.status IN ('completed', 'archived') AND o.listing_type = 'wtb'
    GROUP BY o.requester_id
    UNION ALL
    SELECT o.assignee_id AS user_id, SUM(public.order_rep_item_count(o.id))::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.assignee_id
    WHERE o.status IN ('completed', 'archived') AND o.listing_type = 'wts' AND o.assignee_id IS NOT NULL
    GROUP BY o.assignee_id
  ),
  buyer_completed_agg AS (
    SELECT user_id, SUM(cnt)::int AS cnt FROM buyer_completed GROUP BY user_id
  ),
  fulfiller_completed AS (
    SELECT o.assignee_id AS user_id, SUM(public.order_rep_item_count(o.id))::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.assignee_id
    WHERE o.status IN ('completed', 'archived') AND o.listing_type = 'wtb' AND o.assignee_id IS NOT NULL
    GROUP BY o.assignee_id
    UNION ALL
    SELECT o.requester_id AS user_id, SUM(public.order_rep_item_count(o.id))::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.requester_id
    WHERE o.status IN ('completed', 'archived') AND o.listing_type = 'wts'
    GROUP BY o.requester_id
  ),
  fulfiller_completed_agg AS (
    SELECT user_id, SUM(cnt)::int AS cnt FROM fulfiller_completed GROUP BY user_id
  ),
  fulfiller_delivery AS (
    SELECT
      o.assignee_id AS user_id,
      ROUND(AVG(EXTRACT(EPOCH FROM (o.ready_at - o.accepted_at))))::int AS avg_seconds,
      COUNT(*)::int AS sample_count
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.assignee_id
    WHERE o.status IN ('completed', 'archived')
      AND o.listing_type = 'wtb'
      AND o.assignee_id IS NOT NULL
      AND o.accepted_at IS NOT NULL
      AND o.ready_at IS NOT NULL
      AND o.ready_at >= o.accepted_at
    GROUP BY o.assignee_id
    UNION ALL
    SELECT
      o.requester_id AS user_id,
      ROUND(AVG(EXTRACT(EPOCH FROM (o.ready_at - o.accepted_at))))::int AS avg_seconds,
      COUNT(*)::int AS sample_count
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.requester_id
    WHERE o.status IN ('completed', 'archived')
      AND o.listing_type = 'wts'
      AND o.accepted_at IS NOT NULL
      AND o.ready_at IS NOT NULL
      AND o.ready_at >= o.accepted_at
    GROUP BY o.requester_id
  ),
  fulfiller_delivery_agg AS (
    SELECT
      user_id,
      ROUND(
        SUM(avg_seconds * sample_count)::numeric / NULLIF(SUM(sample_count), 0)
      )::int AS avg_seconds,
      SUM(sample_count)::int AS sample_count
    FROM fulfiller_delivery
    GROUP BY user_id
  ),
  buyer_ratings AS (
    SELECT r.ratee_id AS user_id, COUNT(*)::int AS cnt, ROUND(AVG(r.stars))::int AS avg_stars
    FROM public.custom_order_ratings r
    INNER JOIN users u ON u.uid = r.ratee_id
    WHERE r.rater_role = 'fulfiller'
    GROUP BY r.ratee_id
  ),
  fulfiller_ratings AS (
    SELECT r.ratee_id AS user_id, COUNT(*)::int AS cnt, ROUND(AVG(r.stars))::int AS avg_stars
    FROM public.custom_order_ratings r
    INNER JOIN users u ON u.uid = r.ratee_id
    WHERE r.rater_role = 'requester'
    GROUP BY r.ratee_id
  )
  SELECT
    u.uid AS user_id,
    COALESCE(bc.cnt, 0) AS buyer_completed_count,
    COALESCE(br.cnt, 0) AS buyer_rating_count,
    CASE WHEN COALESCE(bc.cnt, 0) < 5 OR COALESCE(br.cnt, 0) < 1 THEN NULL ELSE br.avg_stars END AS buyer_reputation,
    (COALESCE(bc.cnt, 0) < 5 OR COALESCE(br.cnt, 0) < 1) AS buyer_is_pending,
    COALESCE(fc.cnt, 0) AS fulfiller_completed_count,
    COALESCE(fr.cnt, 0) AS fulfiller_rating_count,
    CASE WHEN COALESCE(fc.cnt, 0) < 5 OR COALESCE(fr.cnt, 0) < 1 THEN NULL ELSE fr.avg_stars END AS fulfiller_reputation,
    (COALESCE(fc.cnt, 0) < 5 OR COALESCE(fr.cnt, 0) < 1) AS fulfiller_is_pending,
    CASE
      WHEN COALESCE(fc.cnt, 0) >= 5 AND COALESCE(fd.sample_count, 0) > 0 THEN fd.avg_seconds
      ELSE NULL
    END AS fulfiller_avg_delivery_seconds,
    COALESCE(fd.sample_count, 0) AS fulfiller_delivery_sample_count
  FROM users u
  LEFT JOIN buyer_completed_agg bc ON bc.user_id = u.uid
  LEFT JOIN fulfiller_completed_agg fc ON fc.user_id = u.uid
  LEFT JOIN fulfiller_delivery_agg fd ON fd.user_id = u.uid
  LEFT JOIN buyer_ratings br ON br.user_id = u.uid
  LEFT JOIN fulfiller_ratings fr ON fr.user_id = u.uid;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_reputations(uuid[]) TO authenticated;
