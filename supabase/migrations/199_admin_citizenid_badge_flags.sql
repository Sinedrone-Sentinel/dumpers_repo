-- =============================================================================
-- 199: Admin Panel — Citizen iD badge flags for any role
-- =============================================================================
-- Members buckets hide officers and super-admins. The RSI tag still needs to
-- know who linked Citizen iD. Officers pass the user ids on the current page
-- and get back the ones with spectrum_citizens.citizenid_sub set.
-- Apply 198_admin_citizenid_members.sql first (admin_require_officer).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_citizenid_linked_user_ids(p_user_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM public.admin_require_officer();

  SELECT COALESCE(array_agg(asked.id), ARRAY[]::uuid[])
  INTO v_ids
  FROM (
    SELECT DISTINCT u.id
    FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS u(id)
    WHERE u.id IS NOT NULL
    LIMIT 50
  ) asked
  JOIN public.spectrum_citizens s
    ON s.user_id = asked.id
   AND s.citizenid_sub IS NOT NULL;

  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_citizenid_linked_user_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_citizenid_linked_user_ids(uuid[]) TO authenticated;
