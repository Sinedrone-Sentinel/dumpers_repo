-- 056 Officer rep immunity
-- Officers and super-admins are exempt from pending reputation order limits

CREATE OR REPLACE FUNCTION public.has_pending_buyer_rep(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND role IN ('officer', 'super-admin')
    ) THEN false
    ELSE (
      SELECT COUNT(*)::int
      FROM public.custom_orders
      WHERE requester_id = p_user_id
        AND status IN ('completed', 'archived')
    ) < 5
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_pending_fulfiller_rep(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND role IN ('officer', 'super-admin')
    ) THEN false
    ELSE (
      SELECT COUNT(*)::int
      FROM public.custom_orders
      WHERE assignee_id = p_user_id
        AND status IN ('completed', 'archived')
    ) < 5
  END;
$$;
