-- =============================================================================
-- 167: Friend request actions via Notify; reorder friend groups
-- =============================================================================

-- Clear pending request notifications tied to a friendship (inbound + outbound).
CREATE OR REPLACE FUNCTION public.clear_friendship_request_notifications(p_friendship_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_friendship_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.user_notifications un
  WHERE un.type IN ('friend_request', 'friend_request_sent')
    AND un.payload->>'friendship_id' = p_friendship_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_friendship_request_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_friendship_request_notifications(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_rsi_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_lookup jsonb;
  v_target_id uuid;
  v_low uuid;
  v_high uuid;
  v_row public.friendships%ROWTYPE;
  v_my_name text;
  v_target_name text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_me AND p.role IS NOT NULL AND p.role <> 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved member required');
  END IF;

  v_lookup := public.search_member_for_friend_request(p_rsi_handle);
  IF NOT COALESCE((v_lookup->>'success')::boolean, false) THEN
    RETURN v_lookup;
  END IF;

  v_target_id := (v_lookup->'member'->>'id')::uuid;
  v_low := LEAST(v_me, v_target_id);
  v_high := GREATEST(v_me, v_target_id);

  INSERT INTO public.friendships (user_low, user_high, requested_by, status)
  VALUES (v_low, v_high, v_me, 'pending')
  ON CONFLICT (user_low, user_high) DO UPDATE
    SET requested_by = EXCLUDED.requested_by,
        status = 'pending',
        created_at = now(),
        responded_at = NULL
    WHERE public.friendships.status = 'denied'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not create friend request');
  END IF;

  SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.rsi_handle), ''), 'Member')
  INTO v_my_name
  FROM public.profiles p WHERE p.id = v_me;

  SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.rsi_handle), ''), 'Member')
  INTO v_target_name
  FROM public.profiles p WHERE p.id = v_target_id;

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  PERFORM public.create_user_notification(
    v_target_id,
    'friend_request',
    'Friend request',
    v_my_name || ' sent you a friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', v_me
    )
  );

  -- Sender manages cancel from Notify (not the Friends dropdown).
  PERFORM public.create_user_notification(
    v_me,
    'friend_request_sent',
    'Friend request sent',
    'Waiting for ' || v_target_name || ' to respond.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'to_user_id', v_target_id
    )
  );

  RETURN jsonb_build_object('success', true, 'friendshipId', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_friendship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_row public.friendships%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT * INTO v_row FROM public.friendships WHERE id = p_friendship_id;
  IF NOT FOUND OR v_row.status <> 'pending' OR v_row.requested_by <> v_me THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending request not found');
  END IF;

  DELETE FROM public.friendships WHERE id = v_row.id;
  PERFORM public.clear_friendship_request_notifications(v_row.id);
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_row public.friendships%ROWTYPE;
  v_other uuid;
  v_my_name text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT * INTO v_row FROM public.friendships WHERE id = p_friendship_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending request not found');
  END IF;
  IF v_row.requested_by = v_me THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot respond to your own request');
  END IF;
  IF v_me <> v_row.user_low AND v_me <> v_row.user_high THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_other := public.friend_other_user(v_row, v_me);

  SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.rsi_handle), ''), 'Member')
  INTO v_my_name
  FROM public.profiles p WHERE p.id = v_me;

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  IF COALESCE(p_accept, false) THEN
    UPDATE public.friendships
    SET status = 'accepted', responded_at = now()
    WHERE id = v_row.id;

    PERFORM public.create_user_notification(
      v_other,
      'friend_accepted',
      'Friend request accepted',
      v_my_name || ' accepted your friend request.',
      jsonb_build_object(
        'friendship_id', v_row.id,
        'from_user_id', v_me
      )
    );
    RETURN jsonb_build_object('success', true, 'status', 'accepted');
  END IF;

  DELETE FROM public.friendships WHERE id = v_row.id;

  PERFORM public.create_user_notification(
    v_other,
    'friend_declined',
    'Friend request declined',
    v_my_name || ' declined your friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', v_me
    )
  );

  RETURN jsonb_build_object('success', true, 'status', 'denied');
END;
$$;

-- Reorder owner's groups (array order = new sort_order 0..n-1).
CREATE OR REPLACE FUNCTION public.reorder_friend_groups(p_group_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_id uuid;
  v_idx int := 0;
  v_owned int;
  v_given int;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  IF p_group_ids IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group list required');
  END IF;

  SELECT COUNT(*)::int INTO v_owned
  FROM public.friend_groups g
  WHERE g.owner_id = v_me;

  SELECT COUNT(DISTINCT x)::int INTO v_given
  FROM unnest(p_group_ids) AS x;

  IF v_given <> v_owned OR cardinality(p_group_ids) <> v_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group list must include every group once');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_group_ids) AS x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.friend_groups g
      WHERE g.id = x.id AND g.owner_id = v_me
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid group');
  END IF;

  FOREACH v_id IN ARRAY p_group_ids
  LOOP
    UPDATE public.friend_groups
    SET sort_order = v_idx, updated_at = now()
    WHERE id = v_id AND owner_id = v_me;
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_friend_groups(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_friend_groups(uuid[]) TO authenticated;

-- Backfill outbound Notify rows for already-pending requests (idempotent).
DO $$
DECLARE
  r record;
  v_target_name text;
BEGIN
  FOR r IN
    SELECT f.id AS friendship_id, f.requested_by, public.friend_other_user(f, f.requested_by) AS to_user_id
    FROM public.friendships f
    WHERE f.status = 'pending'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.user_notifications un
      WHERE un.user_id = r.requested_by
        AND un.type = 'friend_request_sent'
        AND un.payload->>'friendship_id' = r.friendship_id::text
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.rsi_handle), ''), 'Member')
    INTO v_target_name
    FROM public.profiles p
    WHERE p.id = r.to_user_id;

    PERFORM public.create_user_notification(
      r.requested_by,
      'friend_request_sent',
      'Friend request sent',
      'Waiting for ' || COALESCE(v_target_name, 'Member') || ' to respond.',
      jsonb_build_object(
        'friendship_id', r.friendship_id,
        'to_user_id', r.to_user_id
      )
    );
  END LOOP;
END $$;
