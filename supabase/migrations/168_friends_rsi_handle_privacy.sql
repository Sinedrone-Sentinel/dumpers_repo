-- =============================================================================
-- 168: Never expose display names for non-friends (friend request privacy)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.friend_rsi_label(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(trim(p.rsi_handle), ''), 'Member')
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.friend_rsi_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_rsi_label(uuid) TO authenticated, service_role;

-- Handle-only profile for search / pending (no display_name).
CREATE OR REPLACE FUNCTION public.friend_handle_profile_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'displayName', COALESCE(NULLIF(trim(p.rsi_handle), ''), 'Member'),
    'rsiHandle', NULLIF(trim(p.rsi_handle), ''),
    'rsiHandleVerified', COALESCE(p.rsi_handle_verified, false)
  )
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.friend_handle_profile_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_handle_profile_json(uuid) TO authenticated, service_role;

-- Accepted friends may still see display names in the friends list.
CREATE OR REPLACE FUNCTION public.friend_profile_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'displayName', COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.rsi_handle), ''), 'Member'),
    'rsiHandle', NULLIF(trim(p.rsi_handle), ''),
    'rsiHandleVerified', COALESCE(p.rsi_handle_verified, false)
  )
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.search_member_for_friend_request(p_rsi_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_handle text := lower(trim(COALESCE(p_rsi_handle, '')));
  v_target public.profiles%ROWTYPE;
  v_low uuid;
  v_high uuid;
  v_existing public.friendships%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF v_handle = '' OR char_length(v_handle) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter an RSI Handle');
  END IF;

  SELECT * INTO v_target
  FROM public.profiles p
  WHERE lower(trim(COALESCE(p.rsi_handle, ''))) = v_handle
    AND p.role IS NOT NULL
    AND p.role <> 'pending'
  ORDER BY COALESCE(p.rsi_handle_verified, false) DESC, p.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No approved member with that RSI Handle');
  END IF;
  IF v_target.id = v_me THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot add yourself');
  END IF;
  IF EXISTS (SELECT 1 FROM public.banned_users b WHERE b.id = v_target.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not available');
  END IF;

  v_low := LEAST(v_me, v_target.id);
  v_high := GREATEST(v_me, v_target.id);
  SELECT * INTO v_existing
  FROM public.friendships f
  WHERE f.user_low = v_low AND f.user_high = v_high;

  IF FOUND THEN
    IF v_existing.status = 'accepted' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Already friends');
    END IF;
    IF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Friend request already pending');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member', public.friend_handle_profile_json(v_target.id)
  );
END;
$$;

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
  v_my_handle text;
  v_target_handle text;
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

  v_my_handle := public.friend_rsi_label(v_me);
  v_target_handle := public.friend_rsi_label(v_target_id);

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  PERFORM public.create_user_notification(
    v_target_id,
    'friend_request',
    'Friend request',
    v_my_handle || ' sent you a friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', v_me
    )
  );

  PERFORM public.create_user_notification(
    v_me,
    'friend_request_sent',
    'Friend request sent',
    'Waiting for ' || v_target_handle || ' to respond.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'to_user_id', v_target_id
    )
  );

  RETURN jsonb_build_object('success', true, 'friendshipId', v_row.id);
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
  v_my_handle text;
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
  v_my_handle := public.friend_rsi_label(v_me);

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  IF COALESCE(p_accept, false) THEN
    UPDATE public.friendships
    SET status = 'accepted', responded_at = now()
    WHERE id = v_row.id;

    PERFORM public.create_user_notification(
      v_other,
      'friend_accepted',
      'Friend request accepted',
      v_my_handle || ' accepted your friend request.',
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
    v_my_handle || ' declined your friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', v_me
    )
  );

  RETURN jsonb_build_object('success', true, 'status', 'denied');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_friends()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'friends', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'userId', public.friend_other_user(f, v_me),
          'profile', public.friend_profile_json(public.friend_other_user(f, v_me)),
          'friendshipId', f.id,
          'since', COALESCE(f.responded_at, f.created_at),
          'groupId', (
            SELECT fgm.group_id
            FROM public.friend_group_members fgm
            INNER JOIN public.friend_groups fg ON fg.id = fgm.group_id
            WHERE fg.owner_id = v_me
              AND fgm.friend_user_id = public.friend_other_user(f, v_me)
            LIMIT 1
          )
        )
        ORDER BY lower(COALESCE(
          (public.friend_profile_json(public.friend_other_user(f, v_me))->>'rsiHandle'),
          (public.friend_profile_json(public.friend_other_user(f, v_me))->>'displayName'),
          ''
        ))
      )
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (f.user_low = v_me OR f.user_high = v_me)
    ), '[]'::jsonb),
    'pendingInbound', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'friendshipId', f.id,
          'fromUserId', f.requested_by,
          'profile', public.friend_handle_profile_json(f.requested_by),
          'createdAt', f.created_at
        )
        ORDER BY f.created_at DESC
      )
      FROM public.friendships f
      WHERE f.status = 'pending'
        AND f.requested_by <> v_me
        AND (f.user_low = v_me OR f.user_high = v_me)
    ), '[]'::jsonb),
    'pendingOutbound', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'friendshipId', f.id,
          'toUserId', public.friend_other_user(f, v_me),
          'profile', public.friend_handle_profile_json(public.friend_other_user(f, v_me)),
          'createdAt', f.created_at
        )
        ORDER BY f.created_at DESC
      )
      FROM public.friendships f
      WHERE f.status = 'pending'
        AND f.requested_by = v_me
    ), '[]'::jsonb),
    'groups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'label', g.label,
          'sortOrder', g.sort_order
        )
        ORDER BY g.sort_order ASC, lower(g.label) ASC
      )
      FROM public.friend_groups g
      WHERE g.owner_id = v_me
    ), '[]'::jsonb)
  );
END;
$$;

-- Scrub already-sent notification bodies that leaked display names.
UPDATE public.user_notifications un
SET body = public.friend_rsi_label((un.payload->>'from_user_id')::uuid) || ' sent you a friend request.'
WHERE un.type = 'friend_request'
  AND un.payload ? 'from_user_id'
  AND (un.payload->>'from_user_id') ~* '^[0-9a-f-]{36}$';

UPDATE public.user_notifications un
SET body = 'Waiting for ' || public.friend_rsi_label((un.payload->>'to_user_id')::uuid) || ' to respond.'
WHERE un.type = 'friend_request_sent'
  AND un.payload ? 'to_user_id'
  AND (un.payload->>'to_user_id') ~* '^[0-9a-f-]{36}$';

UPDATE public.user_notifications un
SET body = public.friend_rsi_label((un.payload->>'from_user_id')::uuid) || ' accepted your friend request.'
WHERE un.type = 'friend_accepted'
  AND un.payload ? 'from_user_id'
  AND (un.payload->>'from_user_id') ~* '^[0-9a-f-]{36}$';

UPDATE public.user_notifications un
SET body = public.friend_rsi_label((un.payload->>'from_user_id')::uuid) || ' declined your friend request.'
WHERE un.type = 'friend_declined'
  AND un.payload ? 'from_user_id'
  AND (un.payload->>'from_user_id') ~* '^[0-9a-f-]{36}$';