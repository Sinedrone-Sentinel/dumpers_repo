-- Per-category TTL in days (editable). Replaces fixed site=3 / game=7 for expiry.

ALTER TABLE public.ticker_categories
  ADD COLUMN IF NOT EXISTS ttl_days integer;

UPDATE public.ticker_categories
SET ttl_days = CASE
  WHEN entry_kind = 'game' THEN 7
  ELSE 3
END
WHERE ttl_days IS NULL;

ALTER TABLE public.ticker_categories
  ALTER COLUMN ttl_days SET DEFAULT 3;

ALTER TABLE public.ticker_categories
  ALTER COLUMN ttl_days SET NOT NULL;

ALTER TABLE public.ticker_categories
  DROP CONSTRAINT IF EXISTS ticker_categories_ttl_days_check;

ALTER TABLE public.ticker_categories
  ADD CONSTRAINT ticker_categories_ttl_days_check
  CHECK (ttl_days >= 1 AND ttl_days <= 90);

COMMENT ON COLUMN public.ticker_categories.ttl_days IS
  'How long messages in this layout category stay on the ticker (1–90 days).';

-- Built-in layouts cannot be deleted (open questionnaires depend on slug=questionnaire).
ALTER TABLE public.ticker_categories
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

UPDATE public.ticker_categories
SET is_system = true
WHERE slug IN ('site', 'game', 'questionnaire', 'dumper_apps');

CREATE OR REPLACE FUNCTION public.ticker_entry_ttl_days(p_category_id uuid, p_kind text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  IF p_category_id IS NOT NULL THEN
    SELECT c.ttl_days INTO v_days
    FROM public.ticker_categories c
    WHERE c.id = p_category_id;
    IF v_days IS NOT NULL THEN
      RETURN v_days;
    END IF;
  END IF;

  RETURN CASE
    WHEN lower(COALESCE(p_kind, 'game')) = 'site' THEN 3
    ELSE 7
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticker_entry_is_active(
  p_detected_at timestamptz,
  p_category_id uuid,
  p_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_detected_at > (
    now() - make_interval(days => public.ticker_entry_ttl_days(p_category_id, p_kind))
  );
$$;

-- Drop old 2-arg signature from migration 151
DROP FUNCTION IF EXISTS public.ticker_entry_is_active(text, timestamptz);

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
  WHERE e.detected_at <= (
    now() - make_interval(days => public.ticker_entry_ttl_days(e.ticker_category_id, e.kind))
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
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
        'ttlDays', c.ttl_days,
        'sortOrder', c.sort_order,
        'isSystem', c.is_system
      )
      ORDER BY c.sort_order ASC, c.label ASC
    )
    FROM public.ticker_categories c
  ), '[]'::jsonb);
END;
$$;

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
          'ttlDays', c.ttl_days,
          'sortOrder', c.sort_order,
          'isSystem', c.is_system,
          -- Open questionnaires use this layout on the ticker but are not whats_new rows.
          'activeCount', (
            SELECT count(*)::int
            FROM public.whats_new_entries e
            WHERE e.ticker_category_id = c.id
              AND public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind)
          ) + CASE
            WHEN c.slug = 'questionnaire' THEN (
              SELECT count(*)::int
              FROM public.questionnaires q
              WHERE public.questionnaire_is_offerable(q)
            )
            ELSE 0
          END,
          'openQuestionnaireCount', CASE
            WHEN c.slug = 'questionnaire' THEN (
              SELECT count(*)::int
              FROM public.questionnaires q
              WHERE public.questionnaire_is_offerable(q)
            )
            ELSE 0
          END,
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
  v_ttl int;
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
  BEGIN
    v_ttl := COALESCE((p_category->>'ttlDays')::int, 3);
  EXCEPTION WHEN others THEN
    v_ttl := 3;
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
    IF v_hex IS NOT NULL AND v_hex ~ '^[0-9A-F]{6}$' THEN
      v_hex := '#' || v_hex;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Accent color must be a hex like #0EA5E9');
    END IF;
  END IF;

  IF v_kind IS NULL OR v_kind NOT IN ('game', 'site') THEN
    v_kind := CASE WHEN v_slug = 'game' THEN 'game' ELSE 'site' END;
  END IF;

  IF v_ttl IS NULL OR v_ttl < 1 OR v_ttl > 90 THEN
    RETURN jsonb_build_object('success', false, 'error', 'TTL must be between 1 and 90 days');
  END IF;

  IF v_id IS NOT NULL THEN
    -- Built-in categories keep a stable slug (ticker + poll plumbing depend on it)
    IF EXISTS (
      SELECT 1 FROM public.ticker_categories c WHERE c.id = v_id AND c.is_system
    ) THEN
      SELECT c.slug INTO v_slug FROM public.ticker_categories c WHERE c.id = v_id;
    END IF;

    UPDATE public.ticker_categories c
    SET
      slug = v_slug,
      label = v_label,
      accent_hex = v_hex,
      entry_kind = v_kind,
      ttl_days = v_ttl,
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

  INSERT INTO public.ticker_categories (slug, label, accent_hex, entry_kind, ttl_days, sort_order)
  VALUES (v_slug, v_label, v_hex, v_kind, v_ttl, v_sort)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_ticker_category(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_slug text;
  v_system boolean;
  v_active int;
  v_open_q int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing id');
  END IF;

  SELECT c.label, c.slug, c.is_system
  INTO v_label, v_slug, v_system
  FROM public.ticker_categories c
  WHERE c.id = p_id;

  IF v_label IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Category not found');
  END IF;

  IF COALESCE(v_system, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Cannot remove "%s": built-in categories are required by the ticker (you can still edit label, color, and TTL).',
        v_label
      )
    );
  END IF;

  SELECT count(*)::int INTO v_active
  FROM public.whats_new_entries e
  WHERE e.ticker_category_id = p_id
    AND public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind);

  IF v_slug = 'questionnaire' THEN
    SELECT count(*)::int INTO v_open_q
    FROM public.questionnaires q
    WHERE public.questionnaire_is_offerable(q);
  END IF;

  IF v_active + v_open_q > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Cannot remove "%s": %s active ticker item%s currently use this category%s. Wait for them to expire/close, or reassign messages first.',
        v_label,
        v_active + v_open_q,
        CASE WHEN v_active + v_open_q = 1 THEN '' ELSE 's' END,
        CASE
          WHEN v_open_q > 0 THEN format(' (%s open questionnaire%s)', v_open_q, CASE WHEN v_open_q = 1 THEN '' ELSE 's' END)
          ELSE ''
        END
      ),
      'activeCount', v_active + v_open_q
    );
  END IF;

  DELETE FROM public.ticker_categories WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

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
        'expiresAt', e.detected_at + make_interval(
          days => public.ticker_entry_ttl_days(e.ticker_category_id, e.kind)
        ),
        'items', e.items,
        'kind', e.kind,
        'tickerCategoryId', e.ticker_category_id,
        'tickerCategorySlug', c.slug,
        'tickerCategoryLabel', c.label,
        'accentHex', c.accent_hex,
        'ttlDays', public.ticker_entry_ttl_days(e.ticker_category_id, e.kind)
      )
      ORDER BY e.detected_at DESC, e.category ASC, e.action ASC
    )
    FROM public.whats_new_entries e
    LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
    WHERE public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind)
  ), '[]'::jsonb);
END;
$$;

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
          'expiresAt', e.detected_at + make_interval(
            days => public.ticker_entry_ttl_days(e.ticker_category_id, e.kind)
          ),
          'active', true,
          'ttlDays', public.ticker_entry_ttl_days(e.ticker_category_id, e.kind),
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

-- Poll results: short public title + explicit questionnaire layout category
CREATE OR REPLACE FUNCTION public.publish_questionnaire_results_to_ticker(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.questionnaires%ROWTYPE;
  v_response_count int;
  v_items jsonb := '[]'::jsonb;
  v_qrow record;
  v_opt record;
  v_text_count int;
  v_opt_total int;
  v_pct numeric;
  v_issue text;
  v_headline text;
  v_cat_id uuid;
BEGIN
  SELECT * INTO v_q
  FROM public.questionnaires
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT COALESCE(v_q.public_results, false) THEN
    RETURN false;
  END IF;

  IF v_q.results_published_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF v_q.activated_at IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*)::int INTO v_response_count
  FROM public.questionnaire_responses r
  WHERE r.questionnaire_id = p_id;

  FOR v_qrow IN
    SELECT qq.id, qq.prompt, qq.question_type, qq.sort_order, qq.config
    FROM public.questionnaire_questions qq
    WHERE qq.questionnaire_id = p_id
    ORDER BY qq.sort_order
  LOOP
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'key', v_qrow.id::text,
        'label', v_qrow.prompt,
        'summary', CASE v_qrow.question_type
          WHEN 'radio' THEN 'Single choice'
          WHEN 'checkbox' THEN 'Multi choice'
          ELSE 'Written answers'
        END
      )
    );

    IF v_qrow.question_type = 'radio' THEN
      SELECT COALESCE(sum(c.cnt), 0)::int INTO v_opt_total
      FROM (
        SELECT count(*)::int AS cnt
        FROM public.questionnaire_answers a
        WHERE a.question_id = v_qrow.id
          AND nullif(trim(a.value->>'option'), '') IS NOT NULL
        GROUP BY a.value->>'option'
      ) c;

      FOR v_opt IN
        SELECT
          COALESCE(opt_label, '(blank)') AS option_label,
          count(*)::int AS cnt
        FROM (
          SELECT nullif(trim(a.value->>'option'), '') AS opt_label
          FROM public.questionnaire_answers a
          WHERE a.question_id = v_qrow.id
        ) s
        WHERE opt_label IS NOT NULL
        GROUP BY opt_label
        ORDER BY count(*) DESC, opt_label ASC
      LOOP
        v_pct := CASE
          WHEN v_opt_total > 0 THEN round((v_opt.cnt::numeric * 100) / v_opt_total, 1)
          ELSE 0
        END;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'key', v_qrow.id::text || ':' || v_opt.option_label,
            'label', '  · ' || v_opt.option_label,
            'summary', v_opt.cnt::text || ' (' || v_pct::text || '%)'
          )
        );
      END LOOP;

    ELSIF v_qrow.question_type = 'checkbox' THEN
      FOR v_opt IN
        SELECT
          COALESCE(opt_label, '(blank)') AS option_label,
          count(*)::int AS cnt
        FROM (
          SELECT nullif(trim(opt_el), '') AS opt_label
          FROM public.questionnaire_answers a
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(a.value->'options') = 'array' THEN a.value->'options'
              ELSE '[]'::jsonb
            END
          ) AS opt_el
          WHERE a.question_id = v_qrow.id
        ) s
        WHERE opt_label IS NOT NULL
        GROUP BY opt_label
        ORDER BY count(*) DESC, opt_label ASC
      LOOP
        v_pct := CASE
          WHEN v_response_count > 0
            THEN round((v_opt.cnt::numeric * 100) / v_response_count, 1)
          ELSE 0
        END;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'key', v_qrow.id::text || ':' || v_opt.option_label,
            'label', '  · ' || v_opt.option_label,
            'summary', v_opt.cnt::text
              || ' of '
              || v_response_count::text
              || ' ('
              || v_pct::text
              || '%)'
          )
        );
      END LOOP;

    ELSE
      SELECT count(*)::int INTO v_text_count
      FROM public.questionnaire_answers a
      WHERE a.question_id = v_qrow.id
        AND nullif(trim(a.value->>'text'), '') IS NOT NULL;

      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', v_qrow.id::text || ':text',
          'label', '  · Written replies',
          'summary', v_text_count::text || ' (not shown publicly)'
        )
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_items) = 0 THEN
    v_items := jsonb_build_array(
      jsonb_build_object(
        'key', 'empty',
        'label', 'No questions recorded',
        'summary', NULL
      )
    );
  END IF;

  v_issue := 'questionnaire-results:' || p_id::text;
  v_headline := left(trim(v_q.title), 120);
  IF v_headline = '' THEN
    v_headline := 'Poll results';
  END IF;

  SELECT c.id INTO v_cat_id
  FROM public.ticker_categories c
  WHERE c.slug = 'questionnaire'
  LIMIT 1;

  INSERT INTO public.whats_new_entries (
    issue_key, version, category, action, headline, items, detected_at, kind, ticker_category_id
  ) VALUES (
    v_issue,
    'poll',
    'Questionnaire',
    'results',
    v_headline,
    v_items,
    now(),
    'site',
    v_cat_id
  )
  ON CONFLICT (issue_key, version) DO NOTHING;

  UPDATE public.questionnaires
  SET
    results_published_at = now(),
    updated_at = now()
  WHERE id = p_id
    AND results_published_at IS NULL;

  RETURN true;
END;
$$;
