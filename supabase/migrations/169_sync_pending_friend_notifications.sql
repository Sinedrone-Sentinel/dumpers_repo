-- =============================================================================
-- 169: Restore/sync pending friend Notify rows; block Clear on those types
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_pending_friend_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  r record;
  v_other uuid;
  v_handle text;
  v_created int := 0;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  FOR r IN
    SELECT f.*
    FROM public.friendships f
    WHERE f.status = 'pending'
      AND (f.user_low = v_me OR f.user_high = v_me)
  LOOP
    v_other := public.friend_other_user(r, v_me);

    -- Invitee: inbound friend_request
    IF r.requested_by <> v_me THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.user_id = v_me
          AND un.type = 'friend_request'
          AND un.payload->>'friendship_id' = r.id::text
      ) THEN
        v_handle := public.friend_rsi_label(r.requested_by);
        PERFORM public.create_user_notification(
          v_me,
          'friend_request',
          'Friend request',
          v_handle || ' sent you a friend request.',
          jsonb_build_object(
            'friendship_id', r.id,
            'from_user_id', r.requested_by
          )
        );
        v_created := v_created + 1;
      END IF;
    ELSE
      -- Sender: outbound friend_request_sent
      IF NOT EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.user_id = v_me
          AND un.type = 'friend_request_sent'
          AND un.payload->>'friendship_id' = r.id::text
      ) THEN
        v_handle := public.friend_rsi_label(v_other);
        PERFORM public.create_user_notification(
          v_me,
          'friend_request_sent',
          'Friend request sent',
          'Waiting for ' || v_handle || ' to respond.',
          jsonb_build_object(
            'friendship_id', r.id,
            'to_user_id', v_other
          )
        );
        v_created := v_created + 1;
      END IF;

      -- Also restore invitee inbound if missing (so they can Accept/Deny)
      IF NOT EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.user_id = v_other
          AND un.type = 'friend_request'
          AND un.payload->>'friendship_id' = r.id::text
      ) THEN
        v_handle := public.friend_rsi_label(v_me);
        PERFORM public.create_user_notification(
          v_other,
          'friend_request',
          'Friend request',
          v_handle || ' sent you a friend request.',
          jsonb_build_object(
            'friendship_id', r.id,
            'from_user_id', v_me
          )
        );
        v_created := v_created + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_pending_friend_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_pending_friend_notifications() TO authenticated;

-- Keep list_my_friends in sync so opening Friends recreates missing Notify rows.
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

  PERFORM public.ensure_pending_friend_notifications();

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

-- One-shot repair for all pending friendships (both sides).
DO $$
DECLARE
  r record;
  v_other uuid;
  v_handle text;
BEGIN
  FOR r IN
    SELECT f.*
    FROM public.friendships f
    WHERE f.status = 'pending'
  LOOP
    v_other := public.friend_other_user(r, r.requested_by);

    IF NOT EXISTS (
      SELECT 1 FROM public.user_notifications un
      WHERE un.user_id = r.requested_by
        AND un.type = 'friend_request_sent'
        AND un.payload->>'friendship_id' = r.id::text
    ) THEN
      v_handle := public.friend_rsi_label(v_other);
      PERFORM public.create_user_notification(
        r.requested_by,
        'friend_request_sent',
        'Friend request sent',
        'Waiting for ' || v_handle || ' to respond.',
        jsonb_build_object('friendship_id', r.id, 'to_user_id', v_other)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.user_notifications un
      WHERE un.user_id = v_other
        AND un.type = 'friend_request'
        AND un.payload->>'friendship_id' = r.id::text
    ) THEN
      v_handle := public.friend_rsi_label(r.requested_by);
      PERFORM public.create_user_notification(
        v_other,
        'friend_request',
        'Friend request',
        v_handle || ' sent you a friend request.',
        jsonb_build_object('friendship_id', r.id, 'from_user_id', r.requested_by)
      );
    END IF;
  END LOOP;
END $$;

-- Prevent Clear / Clear all from deleting actionable friend-request notifications.
DROP POLICY IF EXISTS "user_notifications_delete_own" ON public.user_notifications;
CREATE POLICY "user_notifications_delete_own"
  ON public.user_notifications
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND type NOT IN (
      'questionnaire_available',
      'friend_request',
      'friend_request_sent'
    )
  );