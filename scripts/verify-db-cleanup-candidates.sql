-- Pre-flight / post-flight check for migration 114_cleanup_legacy_db_objects.sql
-- Run in Supabase SQL Editor BEFORE applying migration 114 (pre) or AFTER (post).

-- Objects migration 114 REMOVES (pre: should exist; post: should be gone)
SELECT 'drops_on_114' AS check_group, p.proname AS name, 'function' AS kind
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'check_suspicious_pair',
    'process_discord_queue_simple',
    'get_blueprint_owner_count',
    'rpc_can_access_preview_features',
    'get_starstrings_sync_status',
    'fulfill_custom_order',
    'get_blueprints_sync_status'
  )
ORDER BY p.proname;

SELECT
  to_regclass('public.blueprints_sync_meta') IS NOT NULL AS blueprints_sync_meta_exists,
  to_regclass('public.shops') IS NOT NULL AS shops_exists,
  to_regclass('public.game_components') IS NOT NULL AS game_components_exists,
  to_regclass('public.rsi_orgs') IS NOT NULL AS rsi_orgs_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ghost_mode'
  ) AS ghost_mode_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preview_features_enabled'
  ) AS preview_features_enabled_exists;

-- Must STAY (pre and post)
SELECT
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_access_preview_features'
  ) AS can_access_preview_features_required,
  to_regclass('public.discord_settings') IS NOT NULL AS discord_settings_exists,
  to_regclass('public.discord_webhooks') IS NOT NULL AS member_discord_webhooks_exists,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'org-logo') AS org_logo_bucket_exists;

-- Core app tables (must exist pre and post)
SELECT 'core_table' AS kind, t.tablename AS name
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'profiles',
    'acquired_blueprints',
    'custom_orders',
    'mining_ledgers',
    'dumper_active_missions',
    'user_api_keys',
    'game_mining'
  )
ORDER BY t.tablename;
