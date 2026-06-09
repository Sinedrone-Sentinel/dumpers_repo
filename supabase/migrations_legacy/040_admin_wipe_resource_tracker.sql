-- Super-admin one-time wipe of all personal resource stock

CREATE OR REPLACE FUNCTION public.admin_wipe_resource_tracker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  DELETE FROM public.personal_resource_inventory
  WHERE true;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_wipe_resource_tracker() TO authenticated;

COMMENT ON FUNCTION public.admin_wipe_resource_tracker() IS
  'Deletes all rows from personal_resource_inventory. Super-admin only.';
