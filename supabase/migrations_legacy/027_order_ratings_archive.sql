-- Order ratings and per-party archive after pickup is confirmed

DO $$ BEGIN
  ALTER TYPE public.custom_order_status ADD VALUE IF NOT EXISTS 'archived';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.custom_orders
  ADD COLUMN IF NOT EXISTS requester_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfiller_archived_at timestamptz;

CREATE TABLE IF NOT EXISTS public.custom_order_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rater_role text NOT NULL CHECK (rater_role IN ('requester', 'fulfiller')),
  stars smallint NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rater_id)
);

CREATE INDEX IF NOT EXISTS custom_order_ratings_order_idx
  ON public.custom_order_ratings (order_id);

CREATE INDEX IF NOT EXISTS custom_order_ratings_ratee_idx
  ON public.custom_order_ratings (ratee_id);

ALTER TABLE public.custom_order_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_order_ratings_preview_all" ON public.custom_order_ratings;
CREATE POLICY "custom_order_ratings_preview_all"
  ON public.custom_order_ratings
  FOR ALL
  TO authenticated
  USING (public.can_access_preview_features())
  WITH CHECK (public.can_access_preview_features());

CREATE OR REPLACE FUNCTION public.archive_custom_order_with_rating(
  p_order_id uuid,
  p_stars smallint,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.custom_orders%ROWTYPE;
  ratee_id uuid;
  rater_role text;
BEGIN
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5 stars';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_row.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed orders can be archived';
  END IF;

  IF auth.uid() = order_row.requester_id THEN
    IF order_row.requester_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'You have already archived this order';
    END IF;

    ratee_id := order_row.assignee_id;
    rater_role := 'requester';

    IF ratee_id IS NULL THEN
      RAISE EXCEPTION 'This order has no fulfiller to rate';
    END IF;

    INSERT INTO public.custom_order_ratings (order_id, rater_id, ratee_id, rater_role, stars, comment)
    VALUES (p_order_id, auth.uid(), ratee_id, rater_role, p_stars, NULLIF(trim(p_comment), ''));

    UPDATE public.custom_orders
    SET requester_archived_at = now(), updated_at = now()
    WHERE id = p_order_id;

  ELSIF auth.uid() = order_row.assignee_id THEN
    IF order_row.fulfiller_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'You have already archived this order';
    END IF;

    ratee_id := order_row.requester_id;
    rater_role := 'fulfiller';

    INSERT INTO public.custom_order_ratings (order_id, rater_id, ratee_id, rater_role, stars, comment)
    VALUES (p_order_id, auth.uid(), ratee_id, rater_role, p_stars, NULLIF(trim(p_comment), ''));

    UPDATE public.custom_orders
    SET fulfiller_archived_at = now(), updated_at = now()
    WHERE id = p_order_id;

  ELSE
    RAISE EXCEPTION 'Only the requester or fulfiller can archive this order';
  END IF;

  SELECT * INTO order_row
  FROM public.custom_orders
  WHERE id = p_order_id;

  IF order_row.requester_archived_at IS NOT NULL
     AND order_row.fulfiller_archived_at IS NOT NULL THEN
    UPDATE public.custom_orders
    SET status = 'archived', updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      p_order_id,
      auth.uid(),
      'archived',
      jsonb_build_object('stars', p_stars)
    );
  ELSE
    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      p_order_id,
      auth.uid(),
      'party_archived',
      jsonb_build_object('stars', p_stars, 'rater_role', rater_role)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_custom_order_with_rating(uuid, smallint, text) TO authenticated;
