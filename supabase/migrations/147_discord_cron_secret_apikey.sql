-- Discord cron: send the platform secret on `apikey` (required for sb_secret_* keys).
-- Do not put sb_secret_* on Authorization: Bearer — the gateway rejects non-JWT Bearer values.
-- app_config.supabase_service_key must be the Secret API key from
-- Dashboard → Settings → API Keys → "Publishable and secret API keys" (default),
-- not the Legacy service_role JWT.

CREATE OR REPLACE FUNCTION public.invoke_discord_processor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings discord_settings;
  v_pending_count int;
  v_supabase_url text;
  v_service_key text;
BEGIN
  SELECT * INTO v_settings FROM discord_settings WHERE id = 1;
  IF NOT v_settings.enabled THEN
    RETURN;
  END IF;

  -- Match get_pending_discord_messages readiness (skip still-held coalesce rows).
  SELECT COUNT(*) INTO v_pending_count
  FROM discord_message_queue
  WHERE processed_at IS NULL
    AND (held_until IS NULL OR held_until <= now());

  IF v_pending_count = 0 THEN
    RETURN;
  END IF;

  SELECT value INTO v_supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO v_service_key FROM app_config WHERE key = 'supabase_service_key';

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE NOTICE 'Discord cron: Config not set. Run the INSERT statements for app_config.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-discord',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_service_key
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Discord cron: Triggered send-discord for % pending messages', v_pending_count;
END;
$$;
