-- =============================================================================
-- 173: Friends require RSI verification; stash invite tokens until clicker verifies
-- =============================================================================
-- Intent: friendship is mutual. Sender and accepter must both be RSI-verified.
-- Invite links clicked before the visitor verifies are stored server-side and
-- processed after mark_rsi_handle_verified / admin_force (token may already be
-- rotated by then — expired stashes are dropped quietly).

-- ---------------------------------------------------------------------------
-- Stash table (no client RLS policies — DEFINER RPCs only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friend_invite_stashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_invite_stashes_token_hex
    CHECK (token ~ '^[0-9a-f]{32}$'),
  CONSTRAINT friend_invite_stashes_user_token_uidx UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS friend_invite_stashes_user_idx
  ON public.friend_invite_stashes (user_id, created_at DESC);

COMMENT ON TABLE public.friend_invite_stashes IS
  'Opaque friend invite tokens saved for a member until they RSI-verify; then redeem runs.';

ALTER TABLE public.friend_invite_stashes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.friend_invite_stashes FROM PUBLIC;
REVOKE ALL ON TABLE public.friend_invite_stashes FROM anon;
REVOKE ALL ON TABLE public.friend_invite_stashes FROM authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._friend_is_rsi_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.rsi_handle_verified FROM public.profiles p WHERE p.id = p_user_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public._friend_is_rsi_verified(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._insert_pending_friendship(
  p_me uuid,
  p_other uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_low uuid;
  v_high uuid;
  v_row public.friendships%ROWTYPE;
  v_recent int;
  v_my_handle text;
  v_other_handle text;
BEGIN
  IF p_me IS NULL OR p_other IS NULL OR p_me = p_other THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite unavailable');
  END IF;

  IF NOT public._friend_is_rsi_verified(p_me) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verify your RSI Handle before adding friends');
  END IF;
  IF NOT public._friend_is_rsi_verified(p_other) THEN
    RETURN jsonb_build_object('success', false, 'error', 'That member has not verified their RSI Handle');
  END IF;

  SELECT COUNT(*)::int INTO v_recent
  FROM public.friendships f
  WHERE f.requested_by = p_me
    AND f.created_at > now() - interval '1 hour';

  IF v_recent >= 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Too many friend requests right now. Try again later.'
    );
  END IF;

  v_low := LEAST(p_me, p_other);
  v_high := GREATEST(p_me, p_other);

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
  VALUES (v_low, v_high, p_me, 'pending')
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

  v_my_handle := public.friend_rsi_label(p_me);
  v_other_handle := public.friend_rsi_label(p_other);

  PERFORM public.clear_friendship_request_notifications(v_row.id);

  PERFORM public.create_user_notification(
    p_other,
    'friend_request',
    'Friend request',
    v_my_handle || ' sent you a friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', p_me
    )
  );

  PERFORM public.create_user_notification(
    p_me,
    'friend_request_sent',
    'Friend request sent',
    'Waiting for ' || v_other_handle || ' to respond.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'to_user_id', p_other
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
    p_other,
    p_me
  );

  RETURN jsonb_build_object('success', true, 'status', 'pending', 'friendshipId', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public._insert_pending_friendship(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Lookup / send — verified only
-- ---------------------------------------------------------------------------
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
  IF NOT public._friend_is_rsi_verified(v_me) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verify your RSI Handle before adding friends');
  END IF;
  IF v_handle = '' OR char_length(v_handle) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter an RSI Handle');
  END IF;

  SELECT * INTO v_target
  FROM public.profiles p
  WHERE lower(trim(COALESCE(p.rsi_handle, ''))) = v_handle
    AND p.role IS NOT NULL
    AND p.role <> 'pending'
    AND COALESCE(p.rsi_handle_verified, false) = true
  ORDER BY p.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No verified member with that RSI Handle');
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
  v_result jsonb;
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
  IF NOT public._friend_is_rsi_verified(v_me) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verify your RSI Handle before adding friends');
  END IF;

  v_lookup := public.search_member_for_friend_request(p_rsi_handle);
  IF NOT COALESCE((v_lookup->>'success')::boolean, false) THEN
    RETURN v_lookup;
  END IF;

  v_target_id := (v_lookup->'member'->>'id')::uuid;
  v_result := public._insert_pending_friendship(v_me, v_target_id);
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'friendshipId', v_result->>'friendshipId'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Accept — both sides must be verified (deny still allowed)
-- ---------------------------------------------------------------------------
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
    IF NOT public._friend_is_rsi_verified(v_me) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Verify your RSI Handle before accepting friends');
    END IF;
    IF NOT public._friend_is_rsi_verified(v_other) THEN
      RETURN jsonb_build_object('success', false, 'error', 'That member has not verified their RSI Handle');
    END IF;

    UPDATE public.friendships
    SET status = 'accepted', responded_at = now()
    WHERE id = v_row.id;

    PERFORM public.ensure_default_friend_group(v_me);
    PERFORM public.ensure_default_friend_group(v_other);
    PERFORM public.ensure_friend_in_default_group(v_me, v_other);
    PERFORM public.ensure_friend_in_default_group(v_other, v_me);

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

    PERFORM public.queue_discord_message(
      'my_friend_accepted',
      'Friend request accepted',
      NULL,
      5763719,
      jsonb_build_array(
        jsonb_build_object(
          'name', left(v_my_handle, 256),
          'value', 'accepted friendship request',
          'inline', false
        )
      ),
      v_other,
      v_me
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

-- ---------------------------------------------------------------------------
-- Redeem: stash if unverified; pending request if verified
-- ---------------------------------------------------------------------------
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
  v_stash_count int;
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

  -- Not RSI-verified yet: durable stash for post-verify processing
  IF NOT public._friend_is_rsi_verified(v_me) THEN
    SELECT COUNT(*)::int INTO v_stash_count
    FROM public.friend_invite_stashes s
    WHERE s.user_id = v_me;

    IF v_stash_count >= 20
       AND NOT EXISTS (
         SELECT 1 FROM public.friend_invite_stashes s
         WHERE s.user_id = v_me AND s.token = v_token
       )
    THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Too many saved invite links. Verify your RSI Handle to process them.'
      );
    END IF;

    INSERT INTO public.friend_invite_stashes (user_id, token)
    VALUES (v_me, v_token)
    ON CONFLICT (user_id, token) DO UPDATE
      SET created_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'stashed_pending_rsi');
  END IF;

  RETURN public._insert_pending_friendship(v_me, v_owner);
END;
$$;

-- ---------------------------------------------------------------------------
-- Process stashes after RSI verify
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_stashed_friend_invites_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_rec record;
  v_owner uuid;
  v_result jsonb;
  v_processed int := 0;
  v_pending int := 0;
  v_already int := 0;
  v_invalid int := 0;
  v_errors int := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User required');
  END IF;

  IF v_role IS DISTINCT FROM 'service_role'
     AND (v_caller IS NULL OR v_caller IS DISTINCT FROM p_user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_caller AND p.role IN ('officer', 'super-admin')
     )
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF NOT public._friend_is_rsi_verified(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle not verified');
  END IF;

  FOR v_rec IN
    SELECT s.id, s.token
    FROM public.friend_invite_stashes s
    WHERE s.user_id = p_user_id
    ORDER BY s.created_at ASC
  LOOP
    SELECT p.id INTO v_owner
    FROM public.profiles p
    WHERE p.friend_invite_token = v_rec.token
      AND p.role IS NOT NULL
      AND p.role <> 'pending'
      AND COALESCE(p.rsi_handle_verified, false) = true
    LIMIT 1;

    IF v_owner IS NULL OR v_owner = p_user_id THEN
      v_invalid := v_invalid + 1;
      DELETE FROM public.friend_invite_stashes WHERE id = v_rec.id;
      CONTINUE;
    END IF;

    v_result := public._insert_pending_friendship(p_user_id, v_owner);
    DELETE FROM public.friend_invite_stashes WHERE id = v_rec.id;
    v_processed := v_processed + 1;

    IF COALESCE((v_result->>'success')::boolean, false) THEN
      IF v_result->>'status' = 'already_friends' THEN
        v_already := v_already + 1;
      ELSE
        v_pending := v_pending + 1;
      END IF;
    ELSE
      v_errors := v_errors + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'pending', v_pending,
    'alreadyFriends', v_already,
    'invalid', v_invalid,
    'errors', v_errors
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_my_stashed_friend_invites()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  RETURN public.process_stashed_friend_invites_for_user(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.process_stashed_friend_invites_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_stashed_friend_invites_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.process_stashed_friend_invites_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_stashed_friend_invites_for_user(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.process_my_stashed_friend_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_my_stashed_friend_invites() TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_friend_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_friend_invite(text) TO authenticated;
REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;
REVOKE ALL ON FUNCTION public.search_member_for_friend_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_member_for_friend_request(text) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_friend_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Auto-process stashes when RSI verification sticks (Edge / officer force)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_rsi_handle_verified(p_user_id uuid, p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_verified boolean;
  v_display_name text;
  v_email text;
  v_handle text := trim(p_handle);
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_user_id IS NULL OR v_handle IS NULL OR length(v_handle) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'User and handle are required');
  END IF;

  IF NOT public.is_rsi_handle_available(v_handle, p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle is already verified by another user');
  END IF;

  SELECT
    COALESCE(rsi_handle_verified, false),
    display_name,
    email
  INTO v_was_verified, v_display_name, v_email
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = v_handle,
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT v_was_verified THEN
    BEGIN
      PERFORM public.queue_rsi_verified_discord(
        p_user_id,
        v_display_name,
        v_email,
        v_handle
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'queue_rsi_verified_discord failed for %: %', p_user_id, SQLERRM;
    END;

    BEGIN
      PERFORM public.process_stashed_friend_invites_for_user(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_stashed_friend_invites_for_user failed for %: %', p_user_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_force_rsi_handle_verified(
  p_user_id uuid,
  p_handle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handle text := nullif(trim(p_handle), '');
  v_was_verified boolean;
  v_display_name text;
  v_email text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('officer', 'super-admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer access required');
  END IF;

  IF p_user_id IS NULL OR v_handle IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User and handle are required');
  END IF;

  IF NOT public.is_rsi_handle_available(v_handle, p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This RSI Handle is already verified by another user'
    );
  END IF;

  SELECT
    COALESCE(rsi_handle_verified, false),
    display_name,
    email
  INTO v_was_verified, v_display_name, v_email
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  PERFORM public.profiles_begin_privileged_update();

  UPDATE public.profiles
  SET
    rsi_handle = v_handle,
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;

  DELETE FROM public.rsi_verify_challenges WHERE user_id = p_user_id;

  IF NOT v_was_verified THEN
    BEGIN
      PERFORM public.queue_rsi_verified_discord(
        p_user_id,
        v_display_name,
        v_email,
        v_handle
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'queue_rsi_verified_discord failed for %: %', p_user_id, SQLERRM;
    END;

    BEGIN
      PERFORM public.process_stashed_friend_invites_for_user(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_stashed_friend_invites_for_user failed for %: %', p_user_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_rsi_handle_verified(uuid, text) TO authenticated;
