-- =============================================================================
-- 130: Discord webhook hardening
-- =============================================================================
-- 1) Drop open INSERT RLS on discord_webhooks (anon + authenticated).
--    Personal registration already uses SECURITY DEFINER RPCs
--    (sync_my_discord_event_webhooks / register_discord_webhook).
-- 2) Mask official_webhook_url from get_discord_settings for non–super-admins.
--    Super-admins and service_role still receive the URL (admin modal + send-discord).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Close open table INSERT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "discord_webhooks_insert_anon" ON public.discord_webhooks;
DROP POLICY IF EXISTS "discord_webhooks_insert_authenticated" ON public.discord_webhooks;

-- Legacy anon execute on register RPC (if still present from early migrations)
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.register_discord_webhook(text, text, text[], text) FROM anon;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Mask staff webhook URL for non–super-admin callers
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_discord_settings();

CREATE OR REPLACE FUNCTION public.get_discord_settings()
RETURNS TABLE (
  enabled boolean,
  orders_enabled boolean,
  order_new_enabled boolean,
  order_fulfilled_enabled boolean,
  order_cancelled_enabled boolean,
  blueprints_enabled boolean,
  support_enabled boolean,
  admin_enabled boolean,
  personal_discord_enabled boolean,
  market_coalesce_enabled boolean,
  market_coalesce_minutes int,
  official_webhook_url text,
  official_webhook_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Invoker JWT role (not the definer). service_role = Edge/cron; else check profile.
  v_can_see_url boolean :=
    coalesce(auth.role(), '') = 'service_role'
    OR public.is_super_admin();
BEGIN
  RETURN QUERY
  SELECT
    ds.enabled,
    ds.orders_enabled,
    ds.order_new_enabled,
    ds.order_fulfilled_enabled,
    ds.order_cancelled_enabled,
    ds.blueprints_enabled,
    ds.support_enabled,
    ds.admin_enabled,
    ds.personal_discord_enabled,
    ds.market_coalesce_enabled,
    ds.market_coalesce_minutes,
    CASE WHEN v_can_see_url THEN ds.official_webhook_url ELSE NULL END,
    ds.official_webhook_name
  FROM public.discord_settings ds
  WHERE ds.id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_discord_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_discord_settings() TO service_role;

COMMENT ON FUNCTION public.get_discord_settings() IS
  'Discord integration toggles. official_webhook_url is only returned to super-admins and service_role.';
