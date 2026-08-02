-- Super-admin CRUD for Updates ticker entries + layout categories (colors).
-- Public list remains via SECURITY DEFINER RPCs; no direct table policies.

-- ---------------------------------------------------------------------------
-- Categories (standardized layouts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticker_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  label text NOT NULL,
  accent_hex text NOT NULL,
  entry_kind text NOT NULL DEFAULT 'site'
    CHECK (entry_kind IN ('game', 'site')),
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticker_categories_slug_unique UNIQUE (slug),
  CONSTRAINT ticker_categories_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT ticker_categories_accent_hex CHECK (accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ticker_categories_label_len CHECK (char_length(trim(label)) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS ticker_categories_sort_idx
  ON public.ticker_categories (sort_order ASC, label ASC);

ALTER TABLE public.ticker_categories ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ticker_categories (slug, label, accent_hex, entry_kind, sort_order)
VALUES
  ('site', 'Site Update', '#0ea5e9', 'site', 10),
  ('game', 'Game Update', '#10b981', 'game', 20),
  ('questionnaire', 'Questionnaire', '#8b5cf6', 'site', 30),
  ('dumper_apps', 'Dumper Apps', '#f59e0b', 'site', 40)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.whats_new_entries
  ADD COLUMN IF NOT EXISTS ticker_category_id uuid
    REFERENCES public.ticker_categories (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whats_new_entries_ticker_category_id_idx
  ON public.whats_new_entries (ticker_category_id);

-- Backfill layout category from existing heuristics
UPDATE public.whats_new_entries e
SET ticker_category_id = c.id
FROM public.ticker_categories c
WHERE e.ticker_category_id IS NULL
  AND c.slug = CASE
    WHEN lower(e.category) = 'questionnaire'
      OR lower(e.version) = 'poll'
      OR e.issue_key ILIKE 'questionnaire%'
      THEN 'questionnaire'
    WHEN lower(e.category) IN ('dumper apps', 'dumper')
      OR e.issue_key ILIKE '%dumper%'
      THEN 'dumper_apps'
    WHEN e.kind = 'site'
      OR lower(e.category) = 'site'
      OR e.version ILIKE 'site%'
      THEN 'site'
    ELSE 'game'
  END;

-- Default remaining NULLs to game
UPDATE public.whats_new_entries e
SET ticker_category_id = c.id
FROM public.ticker_categories c
WHERE e.ticker_category_id IS NULL
  AND c.slug = 'game';

CREATE OR REPLACE FUNCTION public.resolve_ticker_category_id(
  p_slug text,
  p_category text,
  p_kind text,
  p_issue_key text,
  p_version text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_slug text;
BEGIN
  v_slug := nullif(lower(trim(COALESCE(p_slug, ''))), '');
  IF v_slug IS NOT NULL THEN
    SELECT c.id INTO v_id FROM public.ticker_categories c WHERE c.slug = v_slug LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  v_slug := CASE
    WHEN lower(COALESCE(p_category, '')) = 'questionnaire'
      OR lower(COALESCE(p_version, '')) = 'poll'
      OR COALESCE(p_issue_key, '') ILIKE 'questionnaire%'
      THEN 'questionnaire'
    WHEN lower(COALESCE(p_category, '')) IN ('dumper apps', 'dumper')
      OR COALESCE(p_issue_key, '') ILIKE '%dumper%'
      THEN 'dumper_apps'
    WHEN lower(COALESCE(p_kind, '')) = 'site'
      OR lower(COALESCE(p_category, '')) = 'site'
      OR COALESCE(p_version, '') ILIKE 'site%'
      THEN 'site'
    ELSE 'game'
  END;

  SELECT c.id INTO v_id FROM public.ticker_categories c WHERE c.slug = v_slug LIMIT 1;
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id FROM public.ticker_categories c WHERE c.slug = 'game' LIMIT 1;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticker_entry_is_active(p_kind text, p_detected_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_detected_at > (now() - CASE
    WHEN lower(COALESCE(p_kind, 'game')) = 'site' THEN interval '3 days'
    ELSE interval '7 days'
  END);
$$;

CREATE OR REPLACE FUNCTION public.list_ticker_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'label', c.label,
        'accentHex', c.accent_hex,
        'entryKind', c.entry_kind,
        'sortOrder', c.sort_order
      )
      ORDER BY c.sort_order ASC, c.label ASC
    )
    FROM public.ticker_categories c
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_ticker_categories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ticker_categories() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_ticker_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_order ASC, label ASC)
    FROM (
      SELECT
        c.sort_order,
        c.label,
        jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'label', c.label,
          'accentHex', c.accent_hex,
          'entryKind', c.entry_kind,
          'sortOrder', c.sort_order,
          'activeCount', (
            SELECT count(*)::int
            FROM public.whats_new_entries e
            WHERE e.ticker_category_id = c.id
              AND public.ticker_entry_is_active(e.kind, e.detected_at)
          ),
          'totalCount', (
            SELECT count(*)::int
            FROM public.whats_new_entries e
            WHERE e.ticker_category_id = c.id
          )
        ) AS row_data
      FROM public.ticker_categories c
    ) s
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_ticker_categories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_ticker_categories() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_ticker_category(p_category jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_slug text;
  v_label text;
  v_hex text;
  v_kind text;
  v_sort int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_category IS NULL OR jsonb_typeof(p_category) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payload');
  END IF;

  v_id := NULLIF(trim(COALESCE(p_category->>'id', '')), '')::uuid;
  v_slug := lower(nullif(trim(COALESCE(p_category->>'slug', '')), ''));
  v_label := nullif(trim(COALESCE(p_category->>'label', '')), '');
  v_hex := upper(nullif(trim(COALESCE(p_category->>'accentHex', '')), ''));
  v_kind := lower(nullif(trim(COALESCE(p_category->>'entryKind', '')), ''));
  BEGIN
    v_sort := COALESCE((p_category->>'sortOrder')::int, 100);
  EXCEPTION WHEN others THEN
    v_sort := 100;
  END;

  IF v_slug IS NULL OR v_slug !~ '^[a-z][a-z0-9_]{1,62}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Slug required: lowercase letter, then letters/numbers/underscores (max 63)'
    );
  END IF;

  IF v_label IS NULL OR char_length(v_label) > 64 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Label required (max 64 chars)');
  END IF;

  IF v_hex IS NULL OR v_hex !~ '^#[0-9A-F]{6}$' THEN
    -- accept without # 
    IF v_hex IS NOT NULL AND v_hex ~ '^[0-9A-F]{6}$' THEN
      v_hex := '#' || v_hex;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Accent color must be a hex like #0EA5E9');
    END IF;
  END IF;

  IF v_kind IS NULL OR v_kind NOT IN ('game', 'site') THEN
    v_kind := 'site';
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.ticker_categories c
    SET
      slug = v_slug,
      label = v_label,
      accent_hex = v_hex,
      entry_kind = v_kind,
      sort_order = v_sort,
      updated_at = now()
    WHERE c.id = v_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Category not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.ticker_categories c WHERE c.slug = v_slug) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slug already in use');
  END IF;

  INSERT INTO public.ticker_categories (slug, label, accent_hex, entry_kind, sort_order)
  VALUES (v_slug, v_label, v_hex, v_kind, v_sort)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_ticker_category(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_ticker_category(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_ticker_category(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_active int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing id');
  END IF;

  SELECT c.label INTO v_label
  FROM public.ticker_categories c
  WHERE c.id = p_id;

  IF v_label IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Category not found');
  END IF;

  SELECT count(*)::int INTO v_active
  FROM public.whats_new_entries e
  WHERE e.ticker_category_id = p_id
    AND public.ticker_entry_is_active(e.kind, e.detected_at);

  IF v_active > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Cannot remove "%s": %s active ticker message%s currently use this category. Wait for them to expire, or edit those messages to a different category first.',
        v_label,
        v_active,
        CASE WHEN v_active = 1 THEN '' ELSE 's' END
      ),
      'activeCount', v_active
    );
  END IF;

  -- Expired/inactive rows lose the FK (ON DELETE SET NULL); safe to drop category.
  DELETE FROM public.ticker_categories WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_ticker_category(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_ticker_category(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public list: include category layout fields
-- ---------------------------------------------------------------------------

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
        'detectedAt', e.detected_at,
        'expiresAt', e.detected_at + CASE
          WHEN e.kind = 'site' THEN interval '3 days'
          ELSE interval '7 days'
        END,
        'items', e.items,
        'kind', e.kind,
        'tickerCategoryId', e.ticker_category_id,
        'tickerCategorySlug', c.slug,
        'tickerCategoryLabel', c.label,
        'accentHex', c.accent_hex
      )
      ORDER BY e.detected_at DESC, e.category ASC, e.action ASC
    )
    FROM public.whats_new_entries e
    LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
    WHERE e.detected_at > (now() - CASE
      WHEN e.kind = 'site' THEN interval '3 days'
      ELSE interval '7 days'
    END)
  ), '[]'::jsonb);
END;
$$;

-- Ingest: resolve ticker_category_id (optional tickerCategorySlug / tickerCategoryId)
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

    v_cat_id := NULLIF(trim(COALESCE(v_row->>'tickerCategoryId', '')), '')::uuid;
    IF v_cat_id IS NULL THEN
      v_cat_id := public.resolve_ticker_category_id(
        v_row->>'tickerCategorySlug',
        v_category,
        v_kind,
        v_issue,
        v_version
      );
    END IF;

    -- Prefer category's entry_kind when slug maps to a known layout
    IF v_cat_id IS NOT NULL THEN
      SELECT c.entry_kind INTO v_kind
      FROM public.ticker_categories c
      WHERE c.id = v_cat_id;
    END IF;

    INSERT INTO public.whats_new_entries (
      issue_key, version, category, action, headline, items, detected_at, kind, ticker_category_id
    ) VALUES (
      v_issue,
      v_version,
      v_category,
      COALESCE(nullif(trim(v_row->>'action'), ''), 'updated'),
      COALESCE(v_headline, v_issue),
      COALESCE(v_row->'items', '[]'::jsonb),
      v_detected,
      v_kind,
      v_cat_id
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

-- ---------------------------------------------------------------------------
-- Entry admin CRUD
-- ---------------------------------------------------------------------------

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

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_at DESC)
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
          'expiresAt', e.detected_at + CASE
            WHEN e.kind = 'site' THEN interval '3 days'
            ELSE interval '7 days'
          END,
          'active', public.ticker_entry_is_active(e.kind, e.detected_at),
          'tickerCategoryId', e.ticker_category_id,
          'tickerCategorySlug', c.slug,
          'tickerCategoryLabel', c.label,
          'accentHex', c.accent_hex
        ) AS row_data
      FROM public.whats_new_entries e
      LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
      WHERE p_include_expired
         OR public.ticker_entry_is_active(e.kind, e.detected_at)
      ORDER BY e.detected_at DESC
      LIMIT 300
    ) s
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_whats_new_entries(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_whats_new_entries(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_whats_new_entry(p_entry jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_issue text;
  v_version text;
  v_category text;
  v_action text;
  v_headline text;
  v_kind text;
  v_items jsonb;
  v_detected timestamptz;
  v_cat_id uuid;
  v_existing_id uuid;
  v_cat_kind text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payload');
  END IF;

  v_id := NULLIF(trim(COALESCE(p_entry->>'id', '')), '')::uuid;
  v_issue := nullif(trim(COALESCE(p_entry->>'issueKey', '')), '');
  v_version := nullif(trim(COALESCE(p_entry->>'version', '')), '');
  v_category := nullif(trim(COALESCE(p_entry->>'category', '')), '');
  v_action := nullif(trim(COALESCE(p_entry->>'action', '')), '');
  v_headline := nullif(trim(COALESCE(p_entry->>'headline', '')), '');
  v_kind := lower(nullif(trim(COALESCE(p_entry->>'kind', '')), ''));
  v_items := COALESCE(p_entry->'items', '[]'::jsonb);
  v_cat_id := NULLIF(trim(COALESCE(p_entry->>'tickerCategoryId', '')), '')::uuid;

  IF v_headline IS NULL OR char_length(v_headline) > 160 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Headline required (max 160 chars)');
  END IF;

  v_headline := regexp_replace(
    v_headline,
    '^(SITE UPDATE|GAME UPDATE|QUESTIONNAIRE|DUMPER APPS|POLL RESULTS)\s*:\s*',
    '',
    'i'
  );
  v_headline := nullif(trim(v_headline), '');
  IF v_headline IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Headline required');
  END IF;

  IF v_cat_id IS NULL THEN
    v_cat_id := public.resolve_ticker_category_id(
      p_entry->>'tickerCategorySlug',
      v_category,
      v_kind,
      v_issue,
      v_version
    );
  ELSIF NOT EXISTS (SELECT 1 FROM public.ticker_categories c WHERE c.id = v_cat_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid ticker category');
  END IF;

  SELECT c.entry_kind, c.label INTO v_cat_kind, v_category
  FROM public.ticker_categories c
  WHERE c.id = v_cat_id;

  -- Topic/tag: keep free-text category if provided; else use layout label
  v_category := COALESCE(
    nullif(trim(COALESCE(p_entry->>'category', '')), ''),
    v_category,
    'General'
  );

  IF v_kind IS NULL OR v_kind NOT IN ('game', 'site') THEN
    v_kind := COALESCE(v_cat_kind, 'site');
  END IF;

  IF v_issue IS NULL THEN
    v_issue := 'site:' || substr(md5(v_headline || clock_timestamp()::text), 1, 12);
  END IF;

  IF v_version IS NULL THEN
    v_version := CASE
      WHEN v_kind = 'game' THEN 'manual'
      ELSE 'site-' || to_char(timezone('utc', now()), 'YYYY-MM-DD')
    END;
  END IF;

  IF v_action IS NULL THEN
    v_action := 'updated';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN
    v_items := '[]'::jsonb;
  END IF;

  BEGIN
    v_detected := COALESCE((p_entry->>'detectedAt')::timestamptz, now());
  EXCEPTION WHEN others THEN
    v_detected := now();
  END;

  IF v_id IS NOT NULL THEN
    UPDATE public.whats_new_entries e
    SET
      issue_key = v_issue,
      version = v_version,
      category = v_category,
      action = v_action,
      headline = v_headline,
      items = v_items,
      kind = v_kind,
      detected_at = v_detected,
      ticker_category_id = v_cat_id
    WHERE e.id = v_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Entry not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;

  SELECT e.id INTO v_existing_id
  FROM public.whats_new_entries e
  WHERE e.issue_key = v_issue AND e.version = v_version
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.whats_new_entries e
    SET
      category = v_category,
      action = v_action,
      headline = v_headline,
      items = v_items,
      kind = v_kind,
      detected_at = v_detected,
      ticker_category_id = v_cat_id
    WHERE e.id = v_existing_id;

    RETURN jsonb_build_object('success', true, 'id', v_existing_id, 'updatedExisting', true);
  END IF;

  INSERT INTO public.whats_new_entries (
    issue_key, version, category, action, headline, items, detected_at, kind, ticker_category_id
  ) VALUES (
    v_issue, v_version, v_category, v_action, v_headline, v_items, v_detected, v_kind, v_cat_id
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_whats_new_entry(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_whats_new_entry(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_whats_new_entry(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing id');
  END IF;

  DELETE FROM public.whats_new_entries WHERE id = p_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entry not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_whats_new_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_whats_new_entry(uuid) TO authenticated;

-- Auto-resolve layout category for direct inserts (e.g. questionnaire poll results)
CREATE OR REPLACE FUNCTION public.whats_new_entries_assign_ticker_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticker_category_id IS NULL THEN
    NEW.ticker_category_id := public.resolve_ticker_category_id(
      NULL,
      NEW.category,
      NEW.kind,
      NEW.issue_key,
      NEW.version
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whats_new_entries_assign_ticker_category ON public.whats_new_entries;
CREATE TRIGGER trg_whats_new_entries_assign_ticker_category
  BEFORE INSERT OR UPDATE OF category, kind, issue_key, version, ticker_category_id
  ON public.whats_new_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.whats_new_entries_assign_ticker_category();
