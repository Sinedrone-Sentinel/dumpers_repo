-- What's New ticker: parse-time digest rows with 7-day TTL (detected_at + 7 days).
-- Local parse appends JSONL → ingest_whats_new_entries → wipe pending file.
-- Dedupe: same issue_key + same game version → skip (safe to re-parse mid-patch).
-- New patch version may re-add the same issue (e.g. ongoing CIG misspellings) — intentional.
-- Daily cron drops expired rows.

CREATE TABLE IF NOT EXISTS public.whats_new_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable issue identity within a patch (e.g. "blueprints:added", "misspellings:corrected")
  issue_key text NOT NULL,
  -- RSI launcher / LIVE version string (e.g. "4.9.0-live.12344265")
  version text NOT NULL,
  category text NOT NULL,
  action text NOT NULL,
  headline text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whats_new_entries_issue_version_unique UNIQUE (issue_key, version)
);

CREATE INDEX IF NOT EXISTS whats_new_entries_detected_at_idx
  ON public.whats_new_entries (detected_at DESC);

CREATE INDEX IF NOT EXISTS whats_new_entries_version_idx
  ON public.whats_new_entries (version);

ALTER TABLE public.whats_new_entries ENABLE ROW LEVEL SECURITY;

-- No direct table policies — access via SECURITY DEFINER RPCs only.

CREATE OR REPLACE FUNCTION public.list_active_whats_new()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'issueKey', e.issue_key,
        'version', e.version,
        'category', e.category,
        'action', e.action,
        'headline', e.headline,
        'items', e.items,
        'detectedAt', e.detected_at,
        'expiresAt', e.detected_at + interval '7 days'
      )
      ORDER BY e.detected_at DESC, e.category ASC, e.action ASC
    )
    FROM public.whats_new_entries e
    WHERE e.detected_at > (now() - interval '7 days')
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_active_whats_new() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ingest_whats_new_entries(p_entries jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_issue text;
  v_version text;
  v_headline text;
  v_inserted int := 0;
  v_skipped int := 0;
  v_detected timestamptz;
  v_rowcount int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'p_entries must be a JSON array';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_issue := nullif(trim(COALESCE(v_row->>'issueKey', v_row->>'entryKey', '')), '');
    v_version := nullif(trim(COALESCE(v_row->>'version', v_row->>'launcherVersion', '')), '');
    v_headline := nullif(trim(COALESCE(v_row->>'headline', '')), '');

    IF v_issue IS NULL OR v_version IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Same issue + same version already present → do not add (re-parse / mid-patch safety).
    IF EXISTS (
      SELECT 1
      FROM public.whats_new_entries e
      WHERE e.issue_key = v_issue
        AND e.version = v_version
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Extra guard: identical headline already stored for this version (string compare).
    IF v_headline IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.whats_new_entries e
      WHERE e.version = v_version
        AND e.headline = v_headline
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_detected := COALESCE((v_row->>'detectedAt')::timestamptz, now());
    EXCEPTION WHEN others THEN
      v_detected := now();
    END;

    INSERT INTO public.whats_new_entries (
      issue_key, version, category, action, headline, items, detected_at
    ) VALUES (
      v_issue,
      v_version,
      COALESCE(nullif(trim(v_row->>'category'), ''), 'General'),
      COALESCE(nullif(trim(v_row->>'action'), ''), 'updated'),
      COALESCE(v_headline, v_issue),
      COALESCE(v_row->'items', '[]'::jsonb),
      v_detected
    )
    ON CONFLICT (issue_key, version) DO NOTHING;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount > 0 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingest_whats_new_entries(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cleanup_expired_whats_new()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.whats_new_entries
  WHERE detected_at <= (now() - interval '7 days');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_whats_new() TO service_role;

-- Daily cleanup (pg_cron). Safe to re-run; skips if extension missing.
-- Use distinct dollar-tags — nested $$ would terminate the DO body early.
DO $whats_new_cron$
BEGIN
  PERFORM cron.schedule(
    'cleanup-expired-whats-new',
    '15 4 * * *',
    $cmd$SELECT public.cleanup_expired_whats_new()$cmd$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''cleanup-expired-whats-new'', ''15 4 * * *'', $cmd$SELECT public.cleanup_expired_whats_new()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule whats_new cleanup cron: %', SQLERRM;
END;
$whats_new_cron$;
