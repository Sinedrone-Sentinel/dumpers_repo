-- =============================================================================
-- 141: Support ticket categories — Other + Add New Service Request
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'support_ticket_category'
      AND e.enumlabel = 'other'
  ) THEN
    ALTER TYPE public.support_ticket_category ADD VALUE 'other';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'support_ticket_category'
      AND e.enumlabel = 'add_new_service_request'
  ) THEN
    ALTER TYPE public.support_ticket_category ADD VALUE 'add_new_service_request';
  END IF;
END $$;

-- Patch labels only (body matches 139 create_support_ticket + new categories)
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category support_ticket_category,
  p_subject text,
  p_content text,
  p_reported_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_assignee_id uuid := NULL;
  v_reported_role text;
  v_category_label text;
  v_officer_id uuid;
BEGIN
  IF p_category = 'member_report' AND p_reported_user_id IS NOT NULL THEN
    SELECT role INTO v_reported_role
    FROM public.profiles
    WHERE id = p_reported_user_id;

    IF v_reported_role IN ('officer', 'super-admin') THEN
      SELECT id INTO v_assignee_id
      FROM public.profiles
      WHERE role = 'super-admin'
        AND id != auth.uid()
      ORDER BY random()
      LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.support_tickets (
    requester_id, category, subject, reported_user_id, assignee_id, status
  )
  VALUES (
    auth.uid(),
    p_category,
    p_subject,
    p_reported_user_id,
    v_assignee_id,
    CASE
      WHEN v_assignee_id IS NOT NULL THEN 'assigned'::support_ticket_status
      ELSE 'open'::support_ticket_status
    END
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, author_id, content, is_staff)
  VALUES (v_ticket_id, auth.uid(), p_content, false);

  v_category_label := CASE p_category::text
    WHEN 'bug_report' THEN 'Bug Report'
    WHEN 'member_report' THEN 'Member Report'
    WHEN 'rsi_verification' THEN 'RSI Verification Issue'
    WHEN 'partnership_application' THEN 'Partnership Application'
    WHEN 'add_new_service_request' THEN 'Add New Service Request'
    WHEN 'other' THEN 'Other'
    ELSE initcap(replace(p_category::text, '_', ' '))
  END;

  IF v_assignee_id IS NOT NULL THEN
    PERFORM public.create_user_notification(
      v_assignee_id,
      'support_ticket_new',
      'New Support Ticket Assigned',
      v_category_label || ': ' || p_subject,
      jsonb_build_object('ticket_id', v_ticket_id)
    );
  ELSE
    FOR v_officer_id IN
      SELECT id FROM public.profiles
      WHERE role IN ('officer', 'super-admin')
        AND id != auth.uid()
    LOOP
      PERFORM public.create_user_notification(
        v_officer_id,
        'support_ticket_new',
        'New Support Ticket',
        v_category_label || ': ' || p_subject,
        jsonb_build_object('ticket_id', v_ticket_id)
      );
    END LOOP;
  END IF;

  PERFORM public.queue_discord_message(
    'support',
    'New Support Ticket',
    'A new support ticket has been submitted',
    9131814,
    jsonb_build_array(
      jsonb_build_object('name', 'Category', 'value', v_category_label, 'inline', true),
      jsonb_build_object(
        'name', 'Ticket ID',
        'value', left(v_ticket_id::text, 8),
        'inline', true
      )
    ),
    NULL,
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(
  support_ticket_category, text, text, uuid
) TO authenticated;
