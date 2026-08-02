-- Live questionnaires must appear on the Updates ticker for eligible users,
-- including the super-admin who created them. Previously created_by was
-- excluded from pending/fill/submit/decline, so the person activating a form
-- never saw it on their own ticker (looked "broken").
--
-- Activate fan-out notifications still skip the creator (avoid bell spam);
-- ticker discovery uses list_pending_questionnaires.

CREATE OR REPLACE FUNCTION public.list_pending_questionnaires(p_guest_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_guest boolean := (v_uid IS NULL);
  v_guest text := nullif(trim(COALESCE(p_guest_key, '')), '');
BEGIN
  IF v_is_guest AND (v_guest IS NULL OR length(v_guest) < 8) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'title', q.title,
        'description', q.description,
        'available_until', q.available_until
      )
      ORDER BY q.activated_at DESC NULLS LAST
    )
    FROM public.questionnaires q
    WHERE public.questionnaire_is_offerable(q)
      AND public.user_matches_questionnaire_audience(q, v_uid, v_is_guest)
      AND NOT EXISTS (
        SELECT 1 FROM public.questionnaire_dispositions d
        WHERE d.questionnaire_id = q.id
          AND (
            (v_uid IS NOT NULL AND d.user_id = v_uid)
            OR (v_is_guest AND d.guest_key = v_guest)
          )
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_questionnaire_for_fill(
  p_id uuid,
  p_guest_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.questionnaires%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_guest boolean := (v_uid IS NULL);
  v_guest text := nullif(trim(COALESCE(p_guest_key, '')), '');
BEGIN
  SELECT * INTO v_q FROM public.questionnaires WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  IF NOT public.questionnaire_is_offerable(v_q) THEN
    RAISE EXCEPTION 'Questionnaire is not available';
  END IF;

  IF NOT public.user_matches_questionnaire_audience(v_q, v_uid, v_is_guest) THEN
    RAISE EXCEPTION 'Not eligible for this questionnaire';
  END IF;

  IF v_is_guest THEN
    IF v_guest IS NULL OR length(v_guest) < 8 THEN
      RAISE EXCEPTION 'Guest key required';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.questionnaire_dispositions d
      WHERE d.questionnaire_id = p_id AND d.guest_key = v_guest
    ) THEN
      RAISE EXCEPTION 'Already completed or declined';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.questionnaire_dispositions d
      WHERE d.questionnaire_id = p_id AND d.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Already completed or declined';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_q.id,
    'title', v_q.title,
    'description', v_q.description,
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

CREATE OR REPLACE FUNCTION public.submit_questionnaire_response(
  p_id uuid,
  p_answers jsonb,
  p_guest_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.questionnaires%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_guest boolean := (v_uid IS NULL);
  v_guest text := nullif(trim(COALESCE(p_guest_key, '')), '');
  v_qq public.questionnaire_questions%ROWTYPE;
  v_ans jsonb;
  v_text text;
  v_option text;
  v_options jsonb;
  v_response_id uuid;
  v_min int;
  v_max int;
  v_len int;
  v_opt_count int;
BEGIN
  SELECT * INTO v_q FROM public.questionnaires WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  IF NOT public.questionnaire_is_offerable(v_q) THEN
    RAISE EXCEPTION 'Questionnaire is not available';
  END IF;

  IF NOT public.user_matches_questionnaire_audience(v_q, v_uid, v_is_guest) THEN
    RAISE EXCEPTION 'Not eligible for this questionnaire';
  END IF;

  IF v_is_guest THEN
    IF v_guest IS NULL OR length(v_guest) < 8 THEN
      RAISE EXCEPTION 'Guest key required';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.questionnaire_dispositions d
      WHERE d.questionnaire_id = p_id AND d.guest_key = v_guest
    ) THEN
      RAISE EXCEPTION 'Already completed or declined';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.questionnaire_dispositions d
      WHERE d.questionnaire_id = p_id AND d.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Already completed or declined';
    END IF;
  END IF;

  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Answers must be an object keyed by question id';
  END IF;

  INSERT INTO public.questionnaire_responses (questionnaire_id)
  VALUES (p_id)
  RETURNING id INTO v_response_id;

  FOR v_qq IN
    SELECT * FROM public.questionnaire_questions
    WHERE questionnaire_id = p_id
    ORDER BY sort_order
  LOOP
    v_ans := p_answers -> v_qq.id::text;

    IF v_ans IS NULL OR v_ans = 'null'::jsonb THEN
      IF v_qq.required THEN
        RAISE EXCEPTION 'Missing required answer';
      END IF;
      CONTINUE;
    END IF;

    IF v_qq.question_type = 'text' THEN
      v_text := COALESCE(v_ans->>'text', '');
      v_len := char_length(v_text);
      v_min := COALESCE((v_qq.config->>'minLength')::int, 0);
      v_max := COALESCE((v_qq.config->>'maxLength')::int, 5000);
      IF v_qq.required AND v_len = 0 THEN
        RAISE EXCEPTION 'Missing required text answer';
      END IF;
      IF v_len > 0 AND (v_len < v_min OR v_len > v_max) THEN
        RAISE EXCEPTION 'Text answer length out of range';
      END IF;
      IF v_len > 0 THEN
        INSERT INTO public.questionnaire_answers (response_id, question_id, value)
        VALUES (v_response_id, v_qq.id, jsonb_build_object('text', v_text));
      END IF;

    ELSIF v_qq.question_type = 'radio' THEN
      v_option := COALESCE(v_ans->>'option', '');
      IF v_qq.required AND v_option = '' THEN
        RAISE EXCEPTION 'Missing required selection';
      END IF;
      IF v_option <> '' THEN
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(v_qq.config->'options', '[]'::jsonb)) opt
          WHERE opt = v_option
        ) THEN
          RAISE EXCEPTION 'Invalid radio option';
        END IF;
        INSERT INTO public.questionnaire_answers (response_id, question_id, value)
        VALUES (v_response_id, v_qq.id, jsonb_build_object('option', v_option));
      END IF;

    ELSIF v_qq.question_type = 'checkbox' THEN
      v_options := COALESCE(v_ans->'options', '[]'::jsonb);
      IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Checkbox options must be an array';
      END IF;
      v_opt_count := jsonb_array_length(v_options);
      v_min := COALESCE((v_qq.config->>'minSelected')::int, CASE WHEN v_qq.required THEN 1 ELSE 0 END);
      v_max := COALESCE((v_qq.config->>'maxSelected')::int, 100);
      IF v_opt_count < v_min OR v_opt_count > v_max THEN
        RAISE EXCEPTION 'Checkbox selection count out of range';
      END IF;
      IF v_opt_count > 0 THEN
        IF EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(v_options) sel
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(v_qq.config->'options', '[]'::jsonb)) opt
            WHERE opt = sel
          )
        ) THEN
          RAISE EXCEPTION 'Invalid checkbox option';
        END IF;
        INSERT INTO public.questionnaire_answers (response_id, question_id, value)
        VALUES (v_response_id, v_qq.id, jsonb_build_object('options', v_options));
      END IF;
    END IF;
  END LOOP;

  IF v_is_guest THEN
    INSERT INTO public.questionnaire_dispositions (questionnaire_id, guest_key, status)
    VALUES (p_id, v_guest, 'submitted');
  ELSE
    INSERT INTO public.questionnaire_dispositions (questionnaire_id, user_id, status)
    VALUES (p_id, v_uid, 'submitted');
    PERFORM public.clear_questionnaire_notifications(p_id, v_uid);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_questionnaire(
  p_id uuid,
  p_guest_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.questionnaires%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_guest boolean := (v_uid IS NULL);
  v_guest text := nullif(trim(COALESCE(p_guest_key, '')), '');
BEGIN
  SELECT * INTO v_q FROM public.questionnaires WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  IF NOT public.questionnaire_is_offerable(v_q) THEN
    RAISE EXCEPTION 'Questionnaire is not available';
  END IF;

  IF NOT public.user_matches_questionnaire_audience(v_q, v_uid, v_is_guest) THEN
    RAISE EXCEPTION 'Not eligible for this questionnaire';
  END IF;

  IF v_is_guest THEN
    IF v_guest IS NULL OR length(v_guest) < 8 THEN
      RAISE EXCEPTION 'Guest key required';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.questionnaire_dispositions d
      WHERE d.questionnaire_id = p_id AND d.guest_key = v_guest
    ) THEN
      RETURN;
    END IF;
    INSERT INTO public.questionnaire_dispositions (questionnaire_id, guest_key, status)
    VALUES (p_id, v_guest, 'declined');
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.questionnaire_dispositions d
      WHERE d.questionnaire_id = p_id AND d.user_id = v_uid
    ) THEN
      PERFORM public.clear_questionnaire_notifications(p_id, v_uid);
      RETURN;
    END IF;
    INSERT INTO public.questionnaire_dispositions (questionnaire_id, user_id, status)
    VALUES (p_id, v_uid, 'declined');
    PERFORM public.clear_questionnaire_notifications(p_id, v_uid);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.list_pending_questionnaires(text) IS
  'Offerable questionnaires for the caller (including creator). Used by Updates ticker.';
