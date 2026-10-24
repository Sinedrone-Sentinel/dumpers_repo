-- Friends who own a blueprint. Handles only, and only accepted friends.
-- The browser cannot read acquired_blueprints for other members.

CREATE OR REPLACE FUNCTION public.get_friends_blueprint_owners(p_blueprint_ids text[])
RETURNS TABLE (
  blueprint_id text,
  rsi_handle text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ab.blueprint_id,
    public.friend_rsi_label(ab.user_id) AS rsi_handle
  FROM public.acquired_blueprints ab
  INNER JOIN public.profiles p ON p.id = ab.user_id
  INNER JOIN public.friendships f
    ON f.status = 'accepted'
   AND f.user_low = LEAST(auth.uid(), ab.user_id)
   AND f.user_high = GREATEST(auth.uid(), ab.user_id)
  WHERE auth.uid() IS NOT NULL
    AND ab.user_id <> auth.uid()
    AND ab.blueprint_id = ANY(p_blueprint_ids)
    AND COALESCE(p.role, 'pending') <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_users b WHERE b.id = p.id
    )
  ORDER BY ab.blueprint_id, rsi_handle;
$$;

REVOKE ALL ON FUNCTION public.get_friends_blueprint_owners(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friends_blueprint_owners(text[]) TO authenticated;

COMMENT ON FUNCTION public.get_friends_blueprint_owners(text[]) IS
  'RSI handles of accepted friends who own each blueprint. Pending and banned friends are left out.';
