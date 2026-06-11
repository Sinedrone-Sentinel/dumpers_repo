-- Support Ticket System
-- Non-live ticketing for bug reports, member reports, and RSI verification issues
-- All ticket data is permanently deleted upon resolution

-- Create ticket category enum
DO $$ BEGIN
  CREATE TYPE support_ticket_category AS ENUM ('bug_report', 'member_report', 'rsi_verification');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create ticket status enum
DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('open', 'assigned', 'pending_user', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category support_ticket_category NOT NULL,
  subject text NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ticket messages table (CASCADE DELETE when ticket is deleted)
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_requester ON public.support_tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee ON public.support_tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);

-- RLS Policies for support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Members can view their own tickets
DROP POLICY IF EXISTS support_tickets_requester_select ON public.support_tickets;
CREATE POLICY support_tickets_requester_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

-- Officers+ can view all tickets (except super-admin-only tickets they shouldn't see)
DROP POLICY IF EXISTS support_tickets_officer_select ON public.support_tickets;
CREATE POLICY support_tickets_officer_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('officer', 'super-admin')
    )
    AND (
      -- Super-admins see everything
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super-admin')
      OR
      -- Officers don't see tickets assigned exclusively to super-admins (reports on officers)
      NOT (
        assignee_id IS NOT NULL 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = assignee_id AND role = 'super-admin')
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = reported_user_id AND role IN ('officer', 'super-admin'))
      )
    )
  );

-- Members can create tickets
DROP POLICY IF EXISTS support_tickets_insert ON public.support_tickets;
CREATE POLICY support_tickets_insert ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Officers+ can update tickets (assign, change status)
DROP POLICY IF EXISTS support_tickets_officer_update ON public.support_tickets;
CREATE POLICY support_tickets_officer_update ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('officer', 'super-admin')
    )
  );

-- Officers+ can delete tickets
DROP POLICY IF EXISTS support_tickets_officer_delete ON public.support_tickets;
CREATE POLICY support_tickets_officer_delete ON public.support_tickets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('officer', 'super-admin')
    )
  );

-- RLS Policies for ticket_messages
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages on tickets they can see
DROP POLICY IF EXISTS ticket_messages_select ON public.ticket_messages;
CREATE POLICY ticket_messages_select ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
      AND (
        t.requester_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() 
          AND role IN ('officer', 'super-admin')
        )
      )
    )
  );

-- Users can insert messages on their own tickets
DROP POLICY IF EXISTS ticket_messages_requester_insert ON public.ticket_messages;
CREATE POLICY ticket_messages_requester_insert ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
      AND t.requester_id = auth.uid()
    )
    AND is_staff = false
  );

-- Officers+ can insert messages on any ticket they can see
DROP POLICY IF EXISTS ticket_messages_officer_insert ON public.ticket_messages;
CREATE POLICY ticket_messages_officer_insert ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('officer', 'super-admin')
    )
  );

-- Function to create a ticket with initial message
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
  -- If reporting a member, check if they're an officer+
  IF p_category = 'member_report' AND p_reported_user_id IS NOT NULL THEN
    SELECT role INTO v_reported_role
    FROM public.profiles
    WHERE id = p_reported_user_id;
    
    -- If reporting an officer or super-admin, auto-assign to a super-admin
    IF v_reported_role IN ('officer', 'super-admin') THEN
      SELECT id INTO v_assignee_id
      FROM public.profiles
      WHERE role = 'super-admin'
      AND id != auth.uid()
      ORDER BY random()
      LIMIT 1;
    END IF;
  END IF;
  
  -- Create the ticket
  INSERT INTO public.support_tickets (requester_id, category, subject, reported_user_id, assignee_id, status)
  VALUES (auth.uid(), p_category, p_subject, p_reported_user_id, v_assignee_id, 
          CASE WHEN v_assignee_id IS NOT NULL THEN 'assigned'::support_ticket_status ELSE 'open'::support_ticket_status END)
  RETURNING id INTO v_ticket_id;
  
  -- Add the initial message
  INSERT INTO public.ticket_messages (ticket_id, author_id, content, is_staff)
  VALUES (v_ticket_id, auth.uid(), p_content, false);
  
  -- Get category label for notification
  v_category_label := CASE p_category
    WHEN 'bug_report' THEN 'Bug Report'
    WHEN 'member_report' THEN 'Member Report'
    WHEN 'rsi_verification' THEN 'RSI Verification Issue'
  END;
  
  -- Notify officers about the new ticket
  IF v_assignee_id IS NOT NULL THEN
    -- If auto-assigned to super-admin, only notify that person
    PERFORM public.create_user_notification(
      v_assignee_id,
      'support_ticket_new',
      'New Support Ticket Assigned',
      v_category_label || ': ' || p_subject,
      jsonb_build_object('ticket_id', v_ticket_id)
    );
  ELSE
    -- Notify all officers and super-admins
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
  
  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(support_ticket_category, text, text, uuid) TO authenticated;

-- Function to add a message to a ticket
CREATE OR REPLACE FUNCTION public.add_ticket_message(
  p_ticket_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean;
  v_ticket_exists boolean;
  v_user_role text;
  v_ticket record;
  v_officer_id uuid;
BEGIN
  -- Check user role
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  v_is_staff := v_user_role IN ('officer', 'super-admin');
  
  -- Check ticket exists and user has access, get ticket details
  SELECT * INTO v_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id
  AND (requester_id = auth.uid() OR v_is_staff);
  
  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket not found or access denied');
  END IF;
  
  -- Add message
  INSERT INTO public.ticket_messages (ticket_id, author_id, content, is_staff)
  VALUES (p_ticket_id, auth.uid(), p_content, v_is_staff);
  
  -- Update ticket timestamp
  UPDATE public.support_tickets
  SET updated_at = now()
  WHERE id = p_ticket_id;
  
  -- Send notifications
  IF v_is_staff THEN
    -- Staff posted: notify the member who created the ticket
    PERFORM public.create_user_notification(
      v_ticket.requester_id,
      'support_ticket_update',
      'Support Ticket Updated',
      'Staff responded to: ' || v_ticket.subject,
      jsonb_build_object('ticket_id', p_ticket_id)
    );
  ELSE
    -- Member posted: notify the assigned officer, or all officers if unassigned
    IF v_ticket.assignee_id IS NOT NULL THEN
      PERFORM public.create_user_notification(
        v_ticket.assignee_id,
        'support_ticket_update',
        'Ticket Response',
        'Member responded to: ' || v_ticket.subject,
        jsonb_build_object('ticket_id', p_ticket_id)
      );
    ELSE
      -- Notify all officers
      FOR v_officer_id IN
        SELECT id FROM public.profiles
        WHERE role IN ('officer', 'super-admin')
        AND id != auth.uid()
      LOOP
        PERFORM public.create_user_notification(
          v_officer_id,
          'support_ticket_update',
          'Ticket Response',
          'Member responded to: ' || v_ticket.subject,
          jsonb_build_object('ticket_id', p_ticket_id)
        );
      END LOOP;
    END IF;
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_ticket_message(uuid, text) TO authenticated;

-- Function for officers to self-assign a ticket
CREATE OR REPLACE FUNCTION public.assign_ticket_to_self(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
BEGIN
  -- Check user is officer+
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;
  
  -- Assign ticket
  UPDATE public.support_tickets
  SET assignee_id = auth.uid(),
      status = 'assigned',
      updated_at = now()
  WHERE id = p_ticket_id
  AND (assignee_id IS NULL OR assignee_id = auth.uid());
  
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_ticket_to_self(uuid) TO authenticated;

-- Function to update ticket status
CREATE OR REPLACE FUNCTION public.update_ticket_status(
  p_ticket_id uuid,
  p_status support_ticket_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
BEGIN
  -- Check user is officer+
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;
  
  UPDATE public.support_tickets
  SET status = p_status,
      updated_at = now()
  WHERE id = p_ticket_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ticket_status(uuid, support_ticket_status) TO authenticated;

-- Function to resolve and DELETE ticket (permanent deletion)
CREATE OR REPLACE FUNCTION public.resolve_and_delete_ticket(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
BEGIN
  -- Check user is officer+
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;
  
  -- Delete the ticket (CASCADE will delete messages)
  DELETE FROM public.support_tickets WHERE id = p_ticket_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Ticket and all messages permanently deleted');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_and_delete_ticket(uuid) TO authenticated;

-- Function to get tickets for the current user (members see their own, officers see available)
CREATE OR REPLACE FUNCTION public.get_my_tickets()
RETURNS TABLE (
  id uuid,
  category support_ticket_category,
  subject text,
  status support_ticket_status,
  assignee_name text,
  message_count bigint,
  last_message_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.category,
    t.subject,
    t.status,
    COALESCE(p.rsi_handle, p.display_name, 'Staff') as assignee_name,
    COUNT(m.id) as message_count,
    MAX(m.created_at) as last_message_at,
    t.created_at
  FROM public.support_tickets t
  LEFT JOIN public.profiles p ON t.assignee_id = p.id
  LEFT JOIN public.ticket_messages m ON t.id = m.ticket_id
  WHERE t.requester_id = auth.uid()
  AND t.status != 'resolved'
  GROUP BY t.id, t.category, t.subject, t.status, p.rsi_handle, p.display_name, t.created_at
  ORDER BY t.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tickets() TO authenticated;

-- Function to get officer dashboard tickets
CREATE OR REPLACE FUNCTION public.get_officer_tickets()
RETURNS TABLE (
  id uuid,
  category support_ticket_category,
  subject text,
  status support_ticket_status,
  requester_name text,
  requester_id uuid,
  assignee_id uuid,
  assignee_name text,
  reported_user_name text,
  message_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_is_super_admin boolean;
BEGIN
  -- Check user is officer+
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('officer', 'super-admin') THEN
    RETURN;
  END IF;
  
  v_is_super_admin := v_user_role = 'super-admin';
  
  RETURN QUERY
  SELECT 
    t.id,
    t.category,
    t.subject,
    t.status,
    COALESCE(req.rsi_handle, req.display_name, req.email) as requester_name,
    t.requester_id,
    t.assignee_id,
    COALESCE(asgn.rsi_handle, asgn.display_name, 'Unassigned') as assignee_name,
    COALESCE(rep.rsi_handle, rep.display_name, NULL) as reported_user_name,
    COUNT(m.id) as message_count,
    t.created_at,
    t.updated_at
  FROM public.support_tickets t
  JOIN public.profiles req ON t.requester_id = req.id
  LEFT JOIN public.profiles asgn ON t.assignee_id = asgn.id
  LEFT JOIN public.profiles rep ON t.reported_user_id = rep.id
  LEFT JOIN public.ticket_messages m ON t.id = m.ticket_id
  WHERE t.status != 'resolved'
  AND (
    v_is_super_admin
    OR NOT (
      t.assignee_id IS NOT NULL 
      AND EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = t.assignee_id AND p2.role = 'super-admin')
      AND t.category = 'member_report'
      AND EXISTS (SELECT 1 FROM public.profiles p3 WHERE p3.id = t.reported_user_id AND p3.role IN ('officer', 'super-admin'))
    )
  )
  GROUP BY t.id, t.category, t.subject, t.status, t.requester_id, t.assignee_id, t.created_at, t.updated_at,
           req.rsi_handle, req.display_name, req.email, asgn.rsi_handle, asgn.display_name, rep.rsi_handle, rep.display_name
  ORDER BY 
    CASE WHEN t.assignee_id = auth.uid() THEN 0 ELSE 1 END,
    t.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_officer_tickets() TO authenticated;

-- Function to get ticket detail with messages
CREATE OR REPLACE FUNCTION public.get_ticket_detail(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_ticket jsonb;
  v_messages jsonb;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  
  -- Get ticket info
  SELECT jsonb_build_object(
    'id', t.id,
    'category', t.category,
    'subject', t.subject,
    'status', t.status,
    'requester_id', t.requester_id,
    'requester_name', COALESCE(req.rsi_handle, req.display_name, req.email),
    'assignee_id', t.assignee_id,
    'assignee_name', COALESCE(asgn.rsi_handle, asgn.display_name, 'Unassigned'),
    'reported_user_id', t.reported_user_id,
    'reported_user_name', COALESCE(rep.rsi_handle, rep.display_name, NULL),
    'created_at', t.created_at,
    'updated_at', t.updated_at
  ) INTO v_ticket
  FROM public.support_tickets t
  JOIN public.profiles req ON t.requester_id = req.id
  LEFT JOIN public.profiles asgn ON t.assignee_id = asgn.id
  LEFT JOIN public.profiles rep ON t.reported_user_id = rep.id
  WHERE t.id = p_ticket_id
  AND (t.requester_id = auth.uid() OR v_user_role IN ('officer', 'super-admin'));
  
  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket not found or access denied');
  END IF;
  
  -- Get messages
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'content', m.content,
      'is_staff', m.is_staff,
      'author_name', COALESCE(p.rsi_handle, p.display_name, p.email),
      'created_at', m.created_at
    ) ORDER BY m.created_at ASC
  ), '[]'::jsonb) INTO v_messages
  FROM public.ticket_messages m
  JOIN public.profiles p ON m.author_id = p.id
  WHERE m.ticket_id = p_ticket_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'ticket', v_ticket,
    'messages', v_messages
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ticket_detail(uuid) TO authenticated;

-- Function for officers to revoke RSI handle verification
CREATE OR REPLACE FUNCTION public.officer_revoke_rsi_verification(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_profile_id uuid;
  v_display_name text;
BEGIN
  -- Check user is officer+
  SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
  IF v_user_role NOT IN ('officer', 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;
  
  -- Find the profile
  SELECT id, display_name INTO v_profile_id, v_display_name
  FROM public.profiles
  WHERE lower(rsi_handle) = lower(p_handle)
  AND rsi_handle_verified = true;
  
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No verified user found with that RSI Handle');
  END IF;
  
  -- Don't allow officers to revoke super-admin handles
  IF v_user_role = 'officer' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_profile_id AND role = 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot revoke super-admin RSI Handle');
  END IF;
  
  -- Remove verification
  UPDATE public.profiles
  SET rsi_handle_verified = false,
      rsi_handle_verified_at = NULL,
      rsi_handle = NULL,
      updated_at = now()
  WHERE id = v_profile_id;
  
  RETURN jsonb_build_object('success', true, 'display_name', v_display_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.officer_revoke_rsi_verification(text) TO authenticated;
