-- =============================================================================
-- 131: Public questionnaire polls → Updates ticker results
-- =============================================================================
-- - public_results (default false): when set, aggregate option tallies post to
--   whats_new_entries after the poll closes (archive or availability window ends).
-- - results_published_at: idempotent publish marker.
-- - Expired public actives are auto-archived when results are published.
-- =============================================================================

ALTER TABLE public.questionnaires
  ADD COLUMN IF NOT EXISTS public_results boolean NOT NULL DEFAULT false;

ALTER TABLE public.questionnaires
  ADD COLUMN IF NOT EXISTS results_published_at timestamptz;

COMMENT ON COLUMN public.questionnaires.public_results IS
  'When true, anonymous option tallies are posted to the Updates ticker after close/expiry.';
COMMENT ON COLUMN public.questionnaires.results_published_at IS
  'Set when public poll results were ingested into whats_new_entries.';

-- -----------------------------------------------------------------------------
-- Build ticker payload + ingest (idempotent)
-- -----------------------------------------------------------------------------
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

  -- Never publish drafts that were never activated
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
    -- Question header row in the detail modal
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
      -- Free text: count only — never publish answer bodies publicly
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
  v_headline := 'POLL RESULTS: '
    || left(v_q.title, 120)
    || ' ('
    || v_response_count::text
    || CASE WHEN v_response_count = 1 THEN ' response)' ELSE ' responses)' END;

  -- SECURITY DEFINER + service-style ingest: this function is trusted internal.
  -- Call ingest as the current role; archive path is super-admin; cron is via
  -- publish_due which also runs as DEFINER. Temporarily allow by calling insert
  -- helper that does not re-check is_super_admin — reuse ingest which allows
  -- service_role OR super-admin. Cron jobs run as postgres/supabase_admin which
  -- is not service_role JWT — so insert directly here to avoid auth mismatch.
  INSERT INTO public.whats_new_entries (
    issue_key, version, category, action, headline, items, detected_at
  ) VALUES (
    v_issue,
    'poll',
    'Questionnaire',
    'results',
    v_headline,
    v_items,
    now()
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

-- Internal helper: called from admin_archive / publish_due (SECURITY DEFINER owners).
REVOKE ALL ON FUNCTION public.publish_questionnaire_results_to_ticker(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_questionnaire_results_to_ticker(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- Soft-expired public polls: archive + publish
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_due_public_questionnaire_results()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count int := 0;
BEGIN
  FOR v_id IN
    SELECT q.id
    FROM public.questionnaires q
    WHERE q.public_results = true
      AND q.results_published_at IS NULL
      AND q.status = 'active'
      AND q.available_until IS NOT NULL
      AND q.available_until <= now()
  LOOP
    UPDATE public.questionnaires
    SET status = 'archived', updated_at = now()
    WHERE id = v_id
      AND status = 'active';

    IF public.publish_questionnaire_results_to_ticker(v_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_due_public_questionnaire_results() TO service_role;

-- Hourly scan for expired public polls (pg_cron optional).
DO $q_public_cron$
BEGIN
  PERFORM cron.schedule(
    'publish-due-public-questionnaire-results',
    '20 * * * *',
    $cmd$SELECT public.publish_due_public_questionnaire_results()$cmd$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE
      'pg_cron not available — schedule manually: SELECT cron.schedule(''publish-due-public-questionnaire-results'', ''20 * * * *'', $cmd$SELECT public.publish_due_public_questionnaire_results()$cmd$);';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule public questionnaire publish cron: %', SQLERRM;
END;
$q_public_cron$;

-- -----------------------------------------------------------------------------
-- Archive publishes public results
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_archive_questionnaire(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  UPDATE public.questionnaires
  SET status = 'archived', updated_at = now()
  WHERE id = p_id;

  PERFORM public.publish_questionnaire_results_to_ticker(p_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- Save / list / get include public_results
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_save_questionnaire(uuid, text, text, boolean, boolean, boolean, int, text, jsonb);

CREATE OR REPLACE FUNCTION public.admin_save_questionnaire(
  p_id uuid,
  p_title text,
  p_description text,
  p_audience_guest boolean,
  p_audience_registered boolean,
  p_audience_rsi_verified boolean,
  p_public_results boolean,
  p_availability_value int,
  p_availability_unit text,
  p_questions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_q jsonb;
  v_sort int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF NOT (COALESCE(p_audience_guest, false)
       OR COALESCE(p_audience_registered, false)
       OR COALESCE(p_audience_rsi_verified, false)) THEN
    RAISE EXCEPTION 'Select at least one audience';
  END IF;

  IF p_availability_unit NOT IN ('days', 'weeks') THEN
    RAISE EXCEPTION 'Invalid availability unit';
  END IF;

  IF p_availability_value IS NULL OR p_availability_value < 1 THEN
    RAISE EXCEPTION 'Availability must be at least 1';
  END IF;

  IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Questions must be an array';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.questionnaires (
      title, description,
      audience_guest, audience_registered, audience_rsi_verified,
      public_results,
      availability_value, availability_unit,
      created_by, status
    ) VALUES (
      trim(p_title), COALESCE(p_description, ''),
      COALESCE(p_audience_guest, false),
      COALESCE(p_audience_registered, false),
      COALESCE(p_audience_rsi_verified, false),
      COALESCE(p_public_results, false),
      p_availability_value, p_availability_unit,
      auth.uid(), 'draft'
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT status INTO v_status FROM public.questionnaires WHERE id = p_id;
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Questionnaire not found';
    END IF;

    -- Active polls: only the Public flag may change (until results are published).
    IF v_status = 'active' THEN
      UPDATE public.questionnaires SET
        public_results = COALESCE(p_public_results, false),
        updated_at = now()
      WHERE id = p_id
        AND results_published_at IS NULL
      RETURNING id INTO v_id;

      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Cannot change Public after results were published';
      END IF;

      RETURN v_id;
    END IF;

    UPDATE public.questionnaires SET
      title = trim(p_title),
      description = COALESCE(p_description, ''),
      audience_guest = COALESCE(p_audience_guest, false),
      audience_registered = COALESCE(p_audience_registered, false),
      audience_rsi_verified = COALESCE(p_audience_rsi_verified, false),
      public_results = COALESCE(p_public_results, false),
      availability_value = p_availability_value,
      availability_unit = p_availability_unit,
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;

    DELETE FROM public.questionnaire_questions WHERE questionnaire_id = v_id;
  END IF;

  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    IF COALESCE(v_q->>'prompt', '') = '' THEN
      RAISE EXCEPTION 'Each question needs a prompt';
    END IF;
    IF COALESCE(v_q->>'question_type', '') NOT IN ('text', 'radio', 'checkbox') THEN
      RAISE EXCEPTION 'Invalid question type';
    END IF;

    INSERT INTO public.questionnaire_questions (
      questionnaire_id, sort_order, prompt, required, question_type, config
    ) VALUES (
      v_id,
      v_sort,
      trim(v_q->>'prompt'),
      COALESCE((v_q->>'required')::boolean, true),
      v_q->>'question_type',
      COALESCE(v_q->'config', '{}'::jsonb)
    );
    v_sort := v_sort + 1;
  END LOOP;

  IF v_sort = 0 THEN
    RAISE EXCEPTION 'Add at least one question';
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_questionnaire(
  uuid, text, text, boolean, boolean, boolean, boolean, int, text, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_questionnaires()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY created_at DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', q.id,
        'title', q.title,
        'description', q.description,
        'status', q.status,
        'audience_guest', q.audience_guest,
        'audience_registered', q.audience_registered,
        'audience_rsi_verified', q.audience_rsi_verified,
        'public_results', q.public_results,
        'results_published_at', q.results_published_at,
        'availability_value', q.availability_value,
        'availability_unit', q.availability_unit,
        'activated_at', q.activated_at,
        'available_until', q.available_until,
        'created_at', q.created_at,
        'question_count', (
          SELECT count(*)::int FROM public.questionnaire_questions qq
          WHERE qq.questionnaire_id = q.id
        ),
        'response_count', (
          SELECT count(*)::int FROM public.questionnaire_responses r
          WHERE r.questionnaire_id = q.id
        ),
        'declined_count', (
          SELECT count(*)::int FROM public.questionnaire_dispositions d
          WHERE d.questionnaire_id = q.id AND d.status = 'declined'
        ),
        'submitted_count', (
          SELECT count(*)::int FROM public.questionnaire_dispositions d
          WHERE d.questionnaire_id = q.id AND d.status = 'submitted'
        )
      ) AS row_data,
      q.created_at
      FROM public.questionnaires q
    ) s
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_questionnaire(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.questionnaires%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  SELECT * INTO v_q FROM public.questionnaires WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_q.id,
    'title', v_q.title,
    'description', v_q.description,
    'status', v_q.status,
    'audience_guest', v_q.audience_guest,
    'audience_registered', v_q.audience_registered,
    'audience_rsi_verified', v_q.audience_rsi_verified,
    'public_results', v_q.public_results,
    'results_published_at', v_q.results_published_at,
    'availability_value', v_q.availability_value,
    'availability_unit', v_q.availability_unit,
    'activated_at', v_q.activated_at,
    'available_until', v_q.available_until,
    'questions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', qq.id,
          'sort_order', qq.sort_order,
          'prompt', qq.prompt,
          'required', qq.required,
          'question_type', qq.question_type,
          'config', qq.config
        )
        ORDER BY qq.sort_order
      )
      FROM public.questionnaire_questions qq
      WHERE qq.questionnaire_id = p_id
    ), '[]'::jsonb)
  );
END;
$$;
