-- Supabase safe-update blocks DELETE without WHERE; use WHERE true for full wipe.

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
