-- Site ticker entries expire in 3 days; game-content digests stay at 7 days.
-- Poll results and category/version markers count as site updates.

ALTER TABLE public.whats_new_entries
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'game';

ALTER TABLE public.whats_new_entries
  DROP CONSTRAINT IF EXISTS whats_new_entries_kind_check;

ALTER TABLE public.whats_new_entries
  ADD CONSTRAINT whats_new_entries_kind_check
  CHECK (kind IN ('game', 'site'));

COMMENT ON COLUMN public.whats_new_entries.kind IS
  'game = patch/parse digests (7-day TTL); site = product/UI announcements & poll results (3-day TTL)';

-- Existing poll rows → site TTL
UPDATE public.whats_new_entries
SET kind = 'site'
WHERE kind = 'game'
  AND (
    version = 'poll'
    OR lower(category) IN ('questionnaire', 'site')
  );

-- Keep poll / Site category inserts as kind=site even if callers omit the column.
CREATE OR REPLACE FUNCTION public.whats_new_entries_assign_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version = 'poll'
     OR lower(COALESCE(NEW.category, '')) IN ('questionnaire', 'site') THEN
    NEW.kind := 'site';
  ELSIF NEW.kind IS NULL OR NEW.kind NOT IN ('game', 'site') THEN
    NEW.kind := 'game';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whats_new_entries_assign_kind ON public.whats_new_entries;
CREATE TRIGGER trg_whats_new_entries_assign_kind
  BEFORE INSERT OR UPDATE OF version, category, kind
  ON public.whats_new_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.whats_new_entries_assign_kind();

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
        'kind', e.kind,
        'detectedAt', e.detected_at,
        'expiresAt', e.detected_at + CASE
          WHEN e.kind = 'site' THEN interval '3 days'
          ELSE interval '7 days'
        END
      )
      ORDER BY e.detected_at DESC, e.category ASC, e.action ASC
    )
    FROM public.whats_new_entries e
    WHERE e.detected_at > (now() - CASE
      WHEN e.kind = 'site' THEN interval '3 days'
      ELSE interval '7 days'
    END)
  ), '[]'::jsonb);
END;
$$;

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
  WHERE (kind = 'site' AND detected_at <= (now() - interval '3 days'))
     OR (kind = 'game' AND detected_at <= (now() - interval '7 days'));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
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
    v_kind := lower(nullif(trim(COALESCE(v_row->>'kind', '')), ''));
    IF v_kind IS NULL OR v_kind NOT IN ('game', 'site') THEN
      v_kind := 'game';
    END IF;

    IF v_issue IS NULL OR v_version IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.whats_new_entries e
      WHERE e.issue_key = v_issue
        AND e.version = v_version
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

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
      issue_key, version, category, action, headline, items, detected_at, kind
    ) VALUES (
      v_issue,
      v_version,
      COALESCE(nullif(trim(v_row->>'category'), ''), 'General'),
      COALESCE(nullif(trim(v_row->>'action'), ''), 'updated'),
      COALESCE(v_headline, v_issue),
      COALESCE(v_row->'items', '[]'::jsonb),
      v_detected,
      v_kind
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

-- Purge anything already past its kind-specific TTL
SELECT public.cleanup_expired_whats_new();

-- Member-facing site announcements (public ticker — no sensitive ops detail)
INSERT INTO public.whats_new_entries (
  issue_key, version, category, action, headline, items, detected_at, kind
) VALUES
(
  'site:dumper-apps-auto-update',
  'site',
  'Dumper Apps',
  'added',
  'Dumper Apps auto-update',
  jsonb_build_array(
    jsonb_build_object(
      'key', 'auto-update',
      'label', 'Keep App Up to Date',
      'summary',
      'Leave this on (default Yes). When a newer Dumper Apps build is available, the app can download it and restart for you.'
    ),
    jsonb_build_object(
      'key', 'manual',
      'label', 'Need the latest copy?',
      'summary',
      'Download the Windows portable exe from Mission Tracker → BP Dumper if you are still on an older build.'
    )
  ),
  now(),
  'site'
),
(
  'site:avatar-menu-layout',
  'site',
  'Site',
  'changed',
  'Avatar menu layout',
  jsonb_build_array(
    jsonb_build_object(
      'key', 'account',
      'label', 'Account',
      'summary', 'Settings, Dumper Apps, Webhooks, and Partnership (when verified) stay together.'
    ),
    jsonb_build_object(
      'key', 'help',
      'label', 'Help',
      'summary', 'Support is under Help for members and officers.'
    ),
    jsonb_build_object(
      'key', 'roles',
      'label', 'Role sections',
      'summary',
      'Officer and Site admin tools appear in their own sections when your role includes them.'
    )
  ),
  now(),
  'site'
)
ON CONFLICT (issue_key, version) DO NOTHING;
