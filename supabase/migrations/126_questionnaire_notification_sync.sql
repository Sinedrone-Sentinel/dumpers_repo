-- Sync questionnaire_available notifications for the current user:
-- remove stale (expired / disposed / ineligible), create missing for late joiners.

CREATE OR REPLACE FUNCTION public.sync_questionnaire_notifications_for_me()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pending_ids uuid[] := ARRAY[]::uuid[];
  v_qid uuid;
  v_removed int := 0;
  v_created int := 0;
  v_q public.questionnaires%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Pending questionnaires for this user (active, in window, audience, no disposition)
  SELECT COALESCE(array_agg(q.id), ARRAY[]::uuid[])
  INTO v_pending_ids
  FROM public.questionnaires q
  WHERE public.questionnaire_is_offerable(q)
    AND public.user_matches_questionnaire_audience(q, v_uid, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.questionnaire_dispositions d
      WHERE d.questionnaire_id = q.id AND d.user_id = v_uid
    );

  -- Remove stale questionnaire notifications
  WITH deleted AS (
    DELETE FROM public.user_notifications n
    WHERE n.user_id = v_uid
      AND n.type = 'questionnaire_available'
      AND (
        (n.payload->>'questionnaire_id') IS NULL
        OR NOT ((n.payload->>'questionnaire_id')::uuid = ANY (v_pending_ids))
      )
    RETURNING 1
  )
  SELECT count(*)::int INTO v_removed FROM deleted;

  -- Create missing notifications for pending questionnaires (late joiners / RSI later)
  FOREACH v_qid IN ARRAY v_pending_ids
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.user_id = v_uid
        AND n.type = 'questionnaire_available'
        AND (n.payload->>'questionnaire_id') = v_qid::text
    ) THEN
      SELECT * INTO v_q FROM public.questionnaires WHERE id = v_qid;
      PERFORM public.create_user_notification(
        v_uid,
        'questionnaire_available',
        'Questionnaire available',
        COALESCE(nullif(trim(v_q.title), ''), 'A short anonymous questionnaire is available.')
          || ' Open it from this notification when you are ready.',
        jsonb_build_object('questionnaire_id', v_qid)
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pending_count', COALESCE(array_length(v_pending_ids, 1), 0),
    'removed', v_removed,
    'created', v_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_questionnaire_notifications_for_me() TO authenticated;
