-- Buyer min fulfiller reputation + reputation helpers (5 completed before visible)

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS min_fulfiller_reputation smallint
    CHECK (min_fulfiller_reputation IS NULL OR (min_fulfiller_reputation >= 1 AND min_fulfiller_reputation <= 5));

COMMENT ON COLUMN public.custom_orders.min_fulfiller_reputation IS
  'Minimum rounded fulfiller star rating (1-5). Unrated fulfillers (<5 completions) are exempt.';

CREATE OR REPLACE FUNCTION public.user_buyer_reputation(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (
      SELECT COUNT(*)::int
      FROM public.custom_orders
      WHERE requester_id = p_user_id
        AND status IN ('completed', 'archived')
    ) < 5 THEN NULL
    ELSE (
      SELECT ROUND(AVG(r.stars))::int
      FROM public.custom_order_ratings r
      WHERE r.ratee_id = p_user_id
        AND r.rater_role = 'fulfiller'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_fulfiller_reputation(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (
      SELECT COUNT(*)::int
      FROM public.custom_orders
      WHERE assignee_id = p_user_id
        AND status IN ('completed', 'archived')
    ) < 5 THEN NULL
    ELSE (
      SELECT ROUND(AVG(r.stars))::int
      FROM public.custom_order_ratings r
      WHERE r.ratee_id = p_user_id
        AND r.rater_role = 'requester'
    )
  END;
$$;

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
  fulfiller_is_pending boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH users AS (
    SELECT DISTINCT uid
    FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS uid
    WHERE uid IS NOT NULL
  ),
  buyer_completed AS (
    SELECT o.requester_id AS user_id, COUNT(*)::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.requester_id
    WHERE o.status IN ('completed', 'archived')
    GROUP BY o.requester_id
  ),
  fulfiller_completed AS (
    SELECT o.assignee_id AS user_id, COUNT(*)::int AS cnt
    FROM public.custom_orders o
    INNER JOIN users u ON u.uid = o.assignee_id
    WHERE o.status IN ('completed', 'archived')
    GROUP BY o.assignee_id
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
    CASE
      WHEN COALESCE(bc.cnt, 0) < 5 OR COALESCE(br.cnt, 0) < 1 THEN NULL
      ELSE br.avg_stars
    END AS buyer_reputation,
    (COALESCE(bc.cnt, 0) < 5 OR COALESCE(br.cnt, 0) < 1) AS buyer_is_pending,
    COALESCE(fc.cnt, 0) AS fulfiller_completed_count,
    COALESCE(fr.cnt, 0) AS fulfiller_rating_count,
    CASE
      WHEN COALESCE(fc.cnt, 0) < 5 OR COALESCE(fr.cnt, 0) < 1 THEN NULL
      ELSE fr.avg_stars
    END AS fulfiller_reputation,
    (COALESCE(fc.cnt, 0) < 5 OR COALESCE(fr.cnt, 0) < 1) AS fulfiller_is_pending
  FROM users u
  LEFT JOIN buyer_completed bc ON bc.user_id = u.uid
  LEFT JOIN fulfiller_completed fc ON fc.user_id = u.uid
  LEFT JOIN buyer_ratings br ON br.user_id = u.uid
  LEFT JOIN fulfiller_ratings fr ON fr.user_id = u.uid;
$$;

GRANT EXECUTE ON FUNCTION public.user_buyer_reputation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_fulfiller_reputation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_reputations(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_custom_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  item_row record;
  bp_row record;
  stock_qty numeric;
  assignee_name text;
  site_org_id uuid;
  price_label text;
  fulfiller_rep int;
  fulfiller_completed int;
BEGIN
  IF NOT public.can_fulfill_orders() THEN
    RAISE EXCEPTION 'Permission denied: fulfillment access required';
  END IF;

  site_org_id := public.get_site_org_id();

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be accepted';
  END IF;

  IF order_row.requester_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot accept your own order';
  END IF;

  IF order_row.min_fulfiller_reputation IS NOT NULL THEN
    SELECT COUNT(*)::int INTO fulfiller_completed
    FROM public.custom_orders
    WHERE assignee_id = auth.uid()
      AND status IN ('completed', 'archived');

    IF fulfiller_completed >= 5 THEN
      fulfiller_rep := public.user_fulfiller_reputation(auth.uid());

      IF fulfiller_rep IS NOT NULL
         AND fulfiller_rep < order_row.min_fulfiller_reputation THEN
        RAISE EXCEPTION
          'Your fulfiller reputation (%) is below the required %',
          fulfiller_rep,
          order_row.min_fulfiller_reputation;
      END IF;
    END IF;
  END IF;

  FOR bp_row IN
    SELECT blueprint_id
    FROM public.custom_order_blueprints
    WHERE order_id = p_order_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.acquired_blueprints ab
      WHERE ab.user_id = auth.uid()
        AND ab.blueprint_id = bp_row.blueprint_id
    ) THEN
      RAISE EXCEPTION 'You must own blueprint % to accept this order', bp_row.blueprint_id;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.custom_order_blueprints WHERE order_id = p_order_id
  ) AND order_row.blueprint_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.acquired_blueprints ab
      WHERE ab.user_id = auth.uid()
        AND ab.blueprint_id = order_row.blueprint_id
    ) THEN
      RAISE EXCEPTION 'You must own this blueprint to accept the order';
    END IF;
  END IF;

  FOR item_row IN
    SELECT resource_key, quantity
    FROM public.custom_order_items
    WHERE order_id = p_order_id
  LOOP
    SELECT quantity INTO stock_qty
    FROM public.personal_resource_inventory
    WHERE user_id = auth.uid()
      AND resource_key = item_row.resource_key;

    IF stock_qty IS NULL OR stock_qty < item_row.quantity THEN
      RAISE EXCEPTION 'Insufficient personal stock for %', item_row.resource_key;
    END IF;
  END LOOP;

  UPDATE public.custom_orders
  SET
    status = 'accepted',
    assignee_id = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  SELECT COALESCE(rsi_handle, display_name, email, 'A member')
  INTO assignee_name
  FROM public.profiles
  WHERE id = auth.uid();

  price_label := public.format_dfp_auec(order_row.total_dfp_auec);

  INSERT INTO public.order_events (order_id, actor_id, event_type, details)
  VALUES (
    p_order_id,
    auth.uid(),
    'accepted',
    jsonb_build_object(
      'assignee_id', auth.uid(),
      'org_id', site_org_id,
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  PERFORM public.create_user_notification(
    order_row.requester_id,
    'order_accepted',
    'Order accepted',
    assignee_name || ' accepted your order: ' || order_row.title || ' · ' || price_label,
    jsonb_build_object(
      'order_id', p_order_id,
      'assignee_id', auth.uid(),
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );

  PERFORM public.create_user_notification(
    auth.uid(),
    'order_accepted_price',
    'You accepted an order',
    'Customer expects ' || price_label || ' for: ' || order_row.title,
    jsonb_build_object(
      'order_id', p_order_id,
      'total_dfp_auec', order_row.total_dfp_auec
    )
  );
END;
$$;
