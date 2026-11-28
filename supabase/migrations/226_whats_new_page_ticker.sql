-- =============================================================================
-- 226: What's New page ticker stays until a super-admin deletes it
-- =============================================================================
-- Patch day writes one row (issue_key patch:whats-new) instead of a line per
-- catalog. never_expires keeps it through cleanup. replaceByIssueKey on ingest
-- drops the previous row for that key so a new patch updates the headline.
-- Apply after 225_flight_gear_list_finished.sql.
-- =============================================================================

ALTER TABLE public.whats_new_entries
  ADD COLUMN IF NOT EXISTS never_expires boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whats_new_entries.never_expires IS
  'When true, cleanup_expired_whats_new leaves the row. Super-admin delete still removes it.';

CREATE OR REPLACE FUNCTION public.cleanup_expired_whats_new()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.whats_new_entries e
  WHERE NOT e.never_expires
    AND e.detected_at <= (
      now() - make_interval(
        days => public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override)
      )
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_active_whats_new()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
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
        'detectedAt', e.detected_at,
        'expiresAt', CASE
          WHEN e.never_expires THEN NULL
          ELSE e.detected_at + make_interval(
            days => public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override)
          )
        END,
        'items', e.items,
        'kind', e.kind,
        'tickerCategoryId', e.ticker_category_id,
        'tickerCategorySlug', c.slug,
        'tickerCategoryLabel', c.label,
        'accentHex', c.accent_hex,
        'ttlDays', public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override),
        'ttlDaysOverride', e.ttl_days_override,
        'neverExpires', e.never_expires
      )
      ORDER BY e.detected_at DESC, e.category ASC, e.action ASC
    )
    FROM public.whats_new_entries e
    LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
    WHERE e.never_expires
      OR public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind, e.ttl_days_override)
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.list_active_whats_new() IS
  'Active Updates ticker rows (anon/authenticated). Filter-only; expired cleanup via cron / admin list. never_expires rows stay.';

GRANT EXECUTE ON FUNCTION public.list_active_whats_new() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_whats_new_entries(p_include_expired boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.cleanup_expired_whats_new();

  RETURN COALESCE((
    SELECT jsonb_agg(s.row_data ORDER BY s.sort_at DESC)
    FROM (
      SELECT
        e.detected_at AS sort_at,
        jsonb_build_object(
          'id', e.id,
          'issueKey', e.issue_key,
          'version', e.version,
          'category', e.category,
          'action', e.action,
          'headline', e.headline,
          'items', e.items,
          'kind', e.kind,
          'detectedAt', e.detected_at,
          'expiresAt', CASE
            WHEN e.never_expires THEN NULL
            ELSE e.detected_at + make_interval(
              days => public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override)
            )
          END,
          'active', e.never_expires OR public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind, e.ttl_days_override),
          'ttlDays', public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override),
          'ttlDaysOverride', e.ttl_days_override,
          'neverExpires', e.never_expires,
          'tickerCategoryId', e.ticker_category_id,
          'tickerCategorySlug', c.slug,
          'tickerCategoryLabel', c.label,
          'accentHex', c.accent_hex
        ) AS row_data
      FROM public.whats_new_entries e
      LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
      ORDER BY e.detected_at DESC
      LIMIT 300
    ) s
  ), '[]'::jsonb);
END;
$$;

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
  v_kind text;
  v_category text;
  v_cat_id uuid;
  v_inserted int := 0;
  v_skipped int := 0;
  v_detected timestamptz;
  v_rowcount int;
  v_ttl_override integer;
  v_replace boolean;
  v_never boolean;
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
    v_kind := lower(nullif(trim(COALESCE(v_row->>'kind', '')), ''));
    v_category := COALESCE(nullif(trim(v_row->>'category'), ''), 'General');
    v_replace := lower(COALESCE(v_row->>'replaceByIssueKey', v_row->>'replace_by_issue_key', '')) IN ('true', 't', '1');
    v_never := lower(COALESCE(v_row->>'neverExpires', v_row->>'never_expires', '')) IN ('true', 't', '1');
    IF v_kind IS NULL OR v_kind NOT IN ('game', 'site') THEN
      v_kind := 'game';
    END IF;

    IF v_issue IS NULL OR v_version IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_replace THEN
      DELETE FROM public.whats_new_entries WHERE issue_key = v_issue;
    END IF;

    IF NOT v_replace AND EXISTS (
      SELECT 1
      FROM public.whats_new_entries e
      WHERE e.issue_key = v_issue
        AND e.version = v_version
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF NOT v_replace AND v_headline IS NOT NULL AND EXISTS (
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

    v_cat_id := NULLIF(trim(COALESCE(v_row->>'tickerCategoryId', '')), '')::uuid;
    v_ttl_override := NULL;
    IF v_row ? 'ttlDaysOverride' OR v_row ? 'ttl_days_override' THEN
      BEGIN
        v_ttl_override := NULLIF(trim(COALESCE(v_row->>'ttlDaysOverride', v_row->>'ttl_days_override', '')), '')::integer;
      EXCEPTION WHEN others THEN
        v_ttl_override := NULL;
      END;
      IF v_ttl_override IS NOT NULL AND (v_ttl_override < 1 OR v_ttl_override > 366) THEN
        v_ttl_override := NULL;
      END IF;
    END IF;

    IF v_cat_id IS NULL THEN
      v_cat_id := public.resolve_ticker_category_id(
        v_row->>'tickerCategorySlug',
        v_category,
        v_kind,
        v_issue,
        v_version
      );
    END IF;

    IF v_cat_id IS NOT NULL THEN
      SELECT c.entry_kind INTO v_kind
      FROM public.ticker_categories c
      WHERE c.id = v_cat_id;
    END IF;

    INSERT INTO public.whats_new_entries (
      issue_key, version, category, action, headline, items, detected_at, kind, ticker_category_id, ttl_days_override, never_expires
    ) VALUES (
      v_issue,
      v_version,
      v_category,
      COALESCE(nullif(trim(v_row->>'action'), ''), 'updated'),
      COALESCE(v_headline, v_issue),
      COALESCE(v_row->'items', '[]'::jsonb),
      v_detected,
      v_kind,
      v_cat_id,
      v_ttl_override,
      v_never
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

REVOKE ALL ON FUNCTION public.ingest_whats_new_entries(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_whats_new_entries(jsonb) TO authenticated, service_role;
