-- Org Total: read-only aggregate of approved members' personal_resource_inventory

CREATE OR REPLACE FUNCTION public.get_org_total_inventory()
RETURNS TABLE (
  resource_key text,
  quantity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.get_current_user_role(), 'pending') = 'pending' THEN
    RAISE EXCEPTION 'Approved membership required to view org totals';
  END IF;

  RETURN QUERY
  SELECT
    pri.resource_key,
    ROUND(SUM(pri.quantity)::numeric, 3) AS quantity
  FROM public.personal_resource_inventory pri
  INNER JOIN public.profiles p ON p.id = pri.user_id
  WHERE COALESCE(p.role, 'pending') <> 'pending'
  GROUP BY pri.resource_key
  ORDER BY pri.resource_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_total_inventory() TO authenticated;

COMMENT ON FUNCTION public.get_org_total_inventory() IS
  'Sum of personal_resource_inventory across approved members. Read-only org-wide rollup for Resource Tracker.';
