-- =============================================================================
-- 191: Demote officers who never linked Citizen iD after the 90-day grace
-- =============================================================================
-- When spectrum_legacy_grace_ends_at is set and now() is at or past that
-- instant, every role=officer without a spectrum_citizens.citizenid_sub
-- becomes member. Super-admin is never selected. rsi_handle_verified is
-- left unchanged (rank is separate from verify gates).
-- service_role / pg_cron only — do not reuse admin_set_user_role.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.citizenid_demote_unlinked_officers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ends timestamptz;
  v_row record;
  v_count int := 0;
  v_discord_color int := 15677476; -- DISCORD_COLORS.admin (0xef4444)
BEGIN
  v_ends := public.spectrum_grace_ends_at();
  IF v_ends IS NULL OR now() < v_ends THEN
    RETURN jsonb_build_object(
      'success', true,
      'demoted', 0,
      'skipped', 'grace_active_or_unset'
    );
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  FOR v_row IN
    SELECT p.id, p.display_name, p.rsi_handle
    FROM public.profiles p
    WHERE p.role = 'officer'
      AND NOT EXISTS (
        SELECT 1
        FROM public.spectrum_citizens s
        WHERE s.user_id = p.id
          AND s.citizenid_sub IS NOT NULL
      )
  LOOP
    UPDATE public.profiles
    SET
      role = 'member',
      updated_at = now()
    WHERE id = v_row.id
      AND role = 'officer';

    IF FOUND THEN
      v_count := v_count + 1;
      PERFORM public.queue_discord_message(
        'admin',
        'Officer Demoted',
        'An officer was demoted to member because they did not link Citizen iD before the grace period ended.',
        v_discord_color,
        jsonb_build_array(
          jsonb_build_object(
            'name', 'Display Name',
            'value', COALESCE(NULLIF(TRIM(v_row.display_name), ''), 'Not set'),
            'inline', true
          ),
          jsonb_build_object(
            'name', 'RSI Handle',
            'value', COALESCE(NULLIF(TRIM(v_row.rsi_handle), ''), 'Not set'),
            'inline', true
          )
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'demoted', v_count);
END;
$fn$;

REVOKE ALL ON FUNCTION public.citizenid_demote_unlinked_officers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.citizenid_demote_unlinked_officers() FROM authenticated;
REVOKE ALL ON FUNCTION public.citizenid_demote_unlinked_officers() FROM anon;
GRANT EXECUTE ON FUNCTION public.citizenid_demote_unlinked_officers() TO service_role;

COMMENT ON FUNCTION public.citizenid_demote_unlinked_officers() IS
  'After Citizen iD grace ends, demote officers who never linked. Super-admin is never auto-demoted. service_role / cron only.';

-- Immediate pass on apply (no-op until grace has started and expired).
SELECT public.citizenid_demote_unlinked_officers();

-- Daily sweep at 04:05 UTC (after order-timeout-checks at 04:00).
DO $citizenid_demote_cron$
BEGIN
  BEGIN
    PERFORM cron.unschedule('citizenid-demote-unlinked-officers');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'citizenid-demote-unlinked-officers',
    '5 4 * * *',
    $cmd$SELECT public.citizenid_demote_unlinked_officers()$cmd$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''citizenid-demote-unlinked-officers'', ''5 4 * * *'', $cmd$SELECT public.citizenid_demote_unlinked_officers()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule Citizen iD officer demote cron: %', SQLERRM;
END;
$citizenid_demote_cron$;
