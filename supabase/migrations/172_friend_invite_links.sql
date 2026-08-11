-- Migration 172: reusable friend invite links (opaque token)
-- One token per member; many redeemers. Copy does not rotate; rotate is explicit.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS friend_invite_token text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_friend_invite_token_uidx
  ON public.profiles (friend_invite_token)
  WHERE friend_invite_token IS NOT NULL;

COMMENT ON COLUMN public.profiles.friend_invite_token IS
  'Opaque multi-use friend invite token; only set via ensure/rotate DEFINER RPCs';

CREATE OR REPLACE FUNCTION public._new_friend_invite_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(gen_random_bytes(16), 'hex');
$$;

REVOKE ALL ON FUNCTION public._new_friend_invite_token() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ensure_my_friend_invite_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_token text;
  v_verified boolean;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT p.friend_invite_token, COALESCE(p.rsi_handle_verified, false)
  INTO v_token, v_verified
  FROM public.profiles p
  WHERE p.id = v_me
    AND p.role IS NOT NULL
    AND p.role <> 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved member required');
  END IF;

  IF NOT v_verified THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verify your RSI Handle before sharing an invite link');
  END IF;

  IF v_token IS NULL OR length(v_token) < 16 THEN
    LOOP
      v_token := public._new_friend_invite_token();
      BEGIN
        UPDATE public.profiles
        SET friend_invite_token = v_token
        WHERE id = v_me;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- rare collision; retry
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'urlPath', '/?friendInvite=' || v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_my_friend_invite_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_token text;
  v_verified boolean;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT COALESCE(p.rsi_handle_verified, false)
  INTO v_verified
  FROM public.profiles p
  WHERE p.id = v_me
    AND p.role IS NOT NULL
    AND p.role <> 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved member required');
  END IF;

  IF NOT v_verified THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verify your RSI Handle before rotating an invite link');
  END IF;

  LOOP
    v_token := public._new_friend_invite_token();
    BEGIN
      UPDATE public.profiles
      SET friend_invite_token = v_token
      WHERE id = v_me;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'urlPath', '/?friendInvite=' || v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_friend_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_token text := lower(trim(COALESCE(p_token, '')));
  v_owner uuid;
  v_owner_handle text;
  v_my_handle text;
  v_low uuid;
  v_high uuid;
  v_row public.friendships%ROWTYPE;
  v_recent int;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  IF v_token !~ '^[0-9a-f]{32}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite unavailable');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_me AND p.role IS NOT NULL AND p.role <> 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved member required');
  END IF;

  -- Per-clicker flood control (manual sends + invite redeems share this budget)
  SELECT COUNT(*)::int INTO v_recent
  FROM public.friendships f
  WHERE f.requested_by = v_me
    AND f.created_at > now() - interval '1 hour';

  IF v_recent >= 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many friend requests right now. Try again later.');
  END IF;

  SELECT p.id INTO v_owner
  FROM public.profiles p
  WHERE p.friend_invite_token = v_token
    AND p.role IS NOT NULL
    AND p.role <> 'pending'
    AND COALESCE(p.rsi_handle_verified, false) = true
  LIMIT 1;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite unavailable');
  END IF;

  IF v_owner = v_me THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot redeem your own invite link');
  END IF;

  v_low := LEAST(v_me, v_owner);
  v_high := GREATEST(v_me, v_owner);

  SELECT * INTO v_row
  FROM public.friendships f
  WHERE f.user_low = v_low AND f.user_high = v_high;

  IF FOUND THEN
    IF v_row.status = 'accepted' THEN
      RETURN jsonb_build_object('success', true, 'status', 'already_friends', 'friendshipId', v_row.id);
    END IF;
    IF v_row.status = 'pending' THEN
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'friendshipId', v_row.id);
    END IF;
  END IF;

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
    SELECT * INTO v_row
    FROM public.friendships f
    WHERE f.user_low = v_low AND f.user_high = v_high;
    IF FOUND AND v_row.status = 'pending' THEN
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'friendshipId', v_row.id);
    END IF;
    IF FOUND AND v_row.status = 'accepted' THEN
      RETURN jsonb_build_object('success', true, 'status', 'already_friends', 'friendshipId', v_row.id);
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Invite unavailable');
  END IF;

  v_my_handle := public.friend_rsi_label(v_me);
  v_owner_handle := public.friend_rsi_label(v_owner);

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  PERFORM public.create_user_notification(
    v_owner,
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
    'Waiting for ' || v_owner_handle || ' to respond.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'to_user_id', v_owner
    )
  );

  PERFORM public.queue_discord_message(
    'my_friend_request',
    'Friend request',
    NULL,
    5793266,
    jsonb_build_array(
      jsonb_build_object(
        'name', left(v_my_handle, 256),
        'value', 'requesting friendship',
        'inline', false
      )
    ),
    v_owner,
    v_me
  );

  RETURN jsonb_build_object('success', true, 'status', 'pending', 'friendshipId', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_friend_invite_link() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_friend_invite_link() TO authenticated;
REVOKE ALL ON FUNCTION public.rotate_my_friend_invite_link() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_my_friend_invite_link() TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_friend_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_friend_invite(text) TO authenticated;