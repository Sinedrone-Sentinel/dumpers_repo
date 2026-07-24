-- Custom user questionnaires (super-admin builder, anonymous answers, accept/decline dispositions)

CREATE TABLE IF NOT EXISTS public.questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  audience_guest boolean NOT NULL DEFAULT false,
  audience_registered boolean NOT NULL DEFAULT false,
  audience_rsi_verified boolean NOT NULL DEFAULT false,
  availability_value int NOT NULL DEFAULT 7
    CHECK (availability_value >= 1 AND availability_value <= 3650),
  availability_unit text NOT NULL DEFAULT 'days'
    CHECK (availability_unit IN ('days', 'weeks')),
  activated_at timestamptz,
  available_until timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questionnaires_audience_any CHECK (
    audience_guest OR audience_registered OR audience_rsi_verified
  )
);

CREATE TABLE IF NOT EXISTS public.questionnaire_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES public.questionnaires(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  question_type text NOT NULL
    CHECK (question_type IN ('text', 'radio', 'checkbox')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questionnaire_questions_qid_sort_idx
  ON public.questionnaire_questions (questionnaire_id, sort_order);

CREATE TABLE IF NOT EXISTS public.questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES public.questionnaires(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questionnaire_responses_qid_submitted_idx
  ON public.questionnaire_responses (questionnaire_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.questionnaire_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.questionnaire_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questionnaire_questions(id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (response_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.questionnaire_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES public.questionnaires(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_key text,
  status text NOT NULL CHECK (status IN ('submitted', 'declined')),
  resolved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questionnaire_dispositions_identity CHECK (
    (user_id IS NOT NULL AND guest_key IS NULL)
    OR (user_id IS NULL AND guest_key IS NOT NULL AND length(trim(guest_key)) >= 8)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS questionnaire_dispositions_user_uidx
  ON public.questionnaire_dispositions (questionnaire_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS questionnaire_dispositions_guest_uidx
  ON public.questionnaire_dispositions (questionnaire_id, guest_key)
  WHERE guest_key IS NOT NULL;

ALTER TABLE public.questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_dispositions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questionnaires_super_admin_all ON public.questionnaires;
CREATE POLICY questionnaires_super_admin_all ON public.questionnaires
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS questionnaire_questions_super_admin_all ON public.questionnaire_questions;
CREATE POLICY questionnaire_questions_super_admin_all ON public.questionnaire_questions
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS questionnaire_responses_super_admin_select ON public.questionnaire_responses;
CREATE POLICY questionnaire_responses_super_admin_select ON public.questionnaire_responses
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS questionnaire_answers_super_admin_select ON public.questionnaire_answers;
CREATE POLICY questionnaire_answers_super_admin_select ON public.questionnaire_answers
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.questionnaire_availability_interval(
  p_value int,
  p_unit text
)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_unit = 'weeks' THEN make_interval(days => p_value * 7)
    ELSE make_interval(days => p_value)
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_matches_questionnaire_audience(
  p_questionnaire public.questionnaires,
  p_user_id uuid,
  p_is_guest boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_rsi boolean;
BEGIN
  IF p_is_guest THEN
    RETURN COALESCE(p_questionnaire.audience_guest, false);
  END IF;

  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, COALESCE(rsi_handle_verified, false)
  INTO v_role, v_rsi
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_role IS NULL OR v_role = 'pending' THEN
    RETURN false;
  END IF;

  IF COALESCE(p_questionnaire.audience_registered, false) THEN
    RETURN true;
  END IF;

  IF COALESCE(p_questionnaire.audience_rsi_verified, false) AND v_rsi THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.questionnaire_is_offerable(p_q public.questionnaires)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_q.status = 'active'
    AND p_q.available_until IS NOT NULL
    AND p_q.available_until > now();
$$;

CREATE OR REPLACE FUNCTION public.admin_save_questionnaire(
  p_id uuid,
  p_title text,
  p_description text,
  p_audience_guest boolean,
  p_audience_registered boolean,
  p_audience_rsi_verified boolean,
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
      availability_value, availability_unit,
      created_by, status
    ) VALUES (
      trim(p_title), COALESCE(p_description, ''),
      COALESCE(p_audience_guest, false),
      COALESCE(p_audience_registered, false),
      COALESCE(p_audience_rsi_verified, false),
      p_availability_value, p_availability_unit,
      auth.uid(), 'draft'
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT status INTO v_status FROM public.questionnaires WHERE id = p_id;
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Questionnaire not found';
    END IF;
    IF v_status = 'active' THEN
      RAISE EXCEPTION 'Cannot edit an active questionnaire; archive it or create a new draft';
    END IF;

    UPDATE public.questionnaires SET
      title = trim(p_title),
      description = COALESCE(p_description, ''),
      audience_guest = COALESCE(p_audience_guest, false),
      audience_registered = COALESCE(p_audience_registered, false),
      audience_rsi_verified = COALESCE(p_audience_rsi_verified, false),
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

CREATE OR REPLACE FUNCTION public.admin_activate_questionnaire(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q public.questionnaires%ROWTYPE;
  v_until timestamptz;
  v_user record;
  v_qcount int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  SELECT * INTO v_q FROM public.questionnaires WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;
  IF v_q.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft questionnaires can be activated';
  END IF;

  SELECT count(*) INTO v_qcount
  FROM public.questionnaire_questions WHERE questionnaire_id = p_id;
  IF v_qcount < 1 THEN
    RAISE EXCEPTION 'Add at least one question before activating';
  END IF;

  v_until := now() + public.questionnaire_availability_interval(
    v_q.availability_value, v_q.availability_unit
  );

  UPDATE public.questionnaires SET
    status = 'active',
    activated_at = now(),
    available_until = v_until,
    updated_at = now()
  WHERE id = p_id;

  FOR v_user IN
    SELECT id, role, COALESCE(rsi_handle_verified, false) AS rsi
    FROM public.profiles
    WHERE role IN ('member', 'officer', 'super-admin')
  LOOP
    IF (v_q.audience_registered)
       OR (v_q.audience_rsi_verified AND v_user.rsi) THEN
      PERFORM public.create_user_notification(
        v_user.id,
        'questionnaire_available',
        'Questionnaire available',
        'A short anonymous questionnaire is available. Open it from this notification when you are ready.',
        jsonb_build_object('questionnaire_id', p_id)
      );
    END IF;
  END LOOP;
END;
$$;

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
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_questionnaire(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required';
  END IF;

  DELETE FROM public.questionnaires WHERE id = p_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_list_questionnaire_responses(p_id uuid)
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
    SELECT jsonb_agg(resp ORDER BY submitted_at DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', r.id,
        'submitted_at', r.submitted_at,
        'answers', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'question_id', a.question_id,
              'prompt', qq.prompt,
              'question_type', qq.question_type,
              'value', a.value
            )
            ORDER BY qq.sort_order
          )
          FROM public.questionnaire_answers a
          JOIN public.questionnaire_questions qq ON qq.id = a.question_id
          WHERE a.response_id = r.id
        ), '[]'::jsonb)
      ) AS resp,
      r.submitted_at
      FROM public.questionnaire_responses r
      WHERE r.questionnaire_id = p_id
    ) s
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

CREATE OR REPLACE FUNCTION public.clear_questionnaire_notifications(p_questionnaire_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_notifications
  WHERE user_id = p_user_id
    AND type = 'questionnaire_available'
    AND (payload->>'questionnaire_id') = p_questionnaire_id::text;
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

GRANT EXECUTE ON FUNCTION public.admin_save_questionnaire(uuid, text, text, boolean, boolean, boolean, int, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activate_questionnaire(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_questionnaire(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_questionnaire(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_questionnaires() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_questionnaire(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_questionnaire_responses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_questionnaire_for_fill(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_questionnaires(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.decline_questionnaire(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.submit_questionnaire_response(uuid, jsonb, text) TO authenticated, anon;
