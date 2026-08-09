-- =============================================================================
-- 166: Two-way friends list (requests, groups, friend reads, Bazaar hide)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT friendships_ordered CHECK (user_low < user_high),
  CONSTRAINT friendships_pair_unique UNIQUE (user_low, user_high),
  CONSTRAINT friendships_requested_by_party CHECK (
    requested_by = user_low OR requested_by = user_high
  )
);

CREATE INDEX IF NOT EXISTS friendships_status_idx ON public.friendships (status);
CREATE INDEX IF NOT EXISTS friendships_requested_by_idx ON public.friendships (requested_by);

CREATE TABLE IF NOT EXISTS public.friend_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_groups_label_len CHECK (char_length(trim(label)) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS friend_groups_owner_idx ON public.friend_groups (owner_id, sort_order);

CREATE TABLE IF NOT EXISTS public.friend_group_members (
  group_id uuid NOT NULL REFERENCES public.friend_groups(id) ON DELETE CASCADE,
  friend_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, friend_user_id)
);

CREATE INDEX IF NOT EXISTS friend_group_members_friend_idx
  ON public.friend_group_members (friend_user_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_group_members ENABLE ROW LEVEL SECURITY;

-- No direct client writes; reads via RPCs. Deny-all policies for table access.
DROP POLICY IF EXISTS friendships_deny_all ON public.friendships;
CREATE POLICY friendships_deny_all ON public.friendships
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS friend_groups_deny_all ON public.friend_groups;
CREATE POLICY friend_groups_deny_all ON public.friend_groups
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS friend_group_members_deny_all ON public.friend_group_members;
CREATE POLICY friend_group_members_deny_all ON public.friend_group_members
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.friendships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.friend_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.friend_group_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.friendships TO service_role;
GRANT ALL ON public.friend_groups TO service_role;
GRANT ALL ON public.friend_group_members TO service_role;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.friendship_pair_ids(p_a uuid, p_b uuid, OUT o_low uuid, OUT o_high uuid)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(p_a, p_b), GREATEST(p_a, p_b);
$$;

CREATE OR REPLACE FUNCTION public.are_accepted_friends(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND f.user_low = LEAST(p_a, p_b)
      AND f.user_high = GREATEST(p_a, p_b)
  );
$$;

REVOKE ALL ON FUNCTION public.are_accepted_friends(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_accepted_friends(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.friend_other_user(p_row public.friendships, p_me uuid)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_row.user_low = p_me THEN p_row.user_high ELSE p_row.user_low END;
$$;

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

-- -----------------------------------------------------------------------------
-- Harden acquired_blueprints SELECT (DEFINER RPCs still see all)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "acquired_blueprints_select" ON public.acquired_blueprints;
CREATE POLICY "acquired_blueprints_select"
  ON public.acquired_blueprints
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

-- -----------------------------------------------------------------------------
-- Bazaar: hide friends' listings from browse; block assign between friends
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "custom_orders_select_approved" ON public.custom_orders;
CREATE POLICY "custom_orders_select_approved"
  ON public.custom_orders
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_preview_features()
    AND (
      requester_id = auth.uid()
      OR assignee_id = auth.uid()
      OR NOT public.are_accepted_friends(auth.uid(), requester_id)
    )
  );

CREATE OR REPLACE FUNCTION public.friends_block_bazaar_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL
     AND (OLD.assignee_id IS NULL OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id)
     AND NEW.requester_id IS DISTINCT FROM NEW.assignee_id
     AND public.are_accepted_friends(NEW.assignee_id, NEW.requester_id) THEN
    RAISE EXCEPTION 'Friends cannot trade on the Bazaar with each other';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friends_block_bazaar_assign_trg ON public.custom_orders;
CREATE TRIGGER friends_block_bazaar_assign_trg
  BEFORE UPDATE OF assignee_id ON public.custom_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.friends_block_bazaar_assign();

-- -----------------------------------------------------------------------------
-- Friend RPCs
-- -----------------------------------------------------------------------------
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
    'member', public.friend_profile_json(v_target.id)
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
  v_my_name text;
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

  PERFORM public.create_user_notification(
    v_target_id,
    'friend_request',
    'Friend request',
    v_my_name || ' sent you a friend request.',
    jsonb_build_object(
      'friendship_id', v_row.id,
      'from_user_id', v_me,
      'open_friends', true
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
        'from_user_id', v_me,
        'open_friends', true
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
      'from_user_id', v_me,
      'open_friends', true
    )
  );

  RETURN jsonb_build_object('success', true, 'status', 'denied');
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF p_friend_user_id IS NULL OR p_friend_user_id = v_me THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid friend');
  END IF;

  v_low := LEAST(v_me, p_friend_user_id);
  v_high := GREATEST(v_me, p_friend_user_id);

  DELETE FROM public.friendships f
  WHERE f.user_low = v_low AND f.user_high = v_high AND f.status = 'accepted';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Friendship not found');
  END IF;

  DELETE FROM public.friend_group_members fgm
  USING public.friend_groups fg
  WHERE fgm.group_id = fg.id
    AND fgm.friend_user_id IN (v_me, p_friend_user_id)
    AND fg.owner_id IN (v_me, p_friend_user_id);

  RETURN jsonb_build_object('success', true);
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
          'profile', public.friend_profile_json(f.requested_by),
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
          'profile', public.friend_profile_json(public.friend_other_user(f, v_me)),
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

CREATE OR REPLACE FUNCTION public.create_friend_group(p_label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_label text := trim(COALESCE(p_label, ''));
  v_sort int;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF char_length(v_label) < 1 OR char_length(v_label) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group label must be 1-40 characters');
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_sort
  FROM public.friend_groups WHERE owner_id = v_me;

  INSERT INTO public.friend_groups (owner_id, label, sort_order)
  VALUES (v_me, v_label, v_sort)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_friend_group(p_group_id uuid, p_label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_label text := trim(COALESCE(p_label, ''));
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF char_length(v_label) < 1 OR char_length(v_label) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group label must be 1-40 characters');
  END IF;

  UPDATE public.friend_groups
  SET label = v_label, updated_at = now()
  WHERE id = p_group_id AND owner_id = v_me;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_friend_group(p_group_id uuid)
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

  DELETE FROM public.friend_groups
  WHERE id = p_group_id AND owner_id = v_me;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_friend_group(p_friend_user_id uuid, p_group_id uuid)
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
  IF NOT public.are_accepted_friends(v_me, p_friend_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not friends');
  END IF;

  DELETE FROM public.friend_group_members fgm
  USING public.friend_groups fg
  WHERE fgm.group_id = fg.id
    AND fg.owner_id = v_me
    AND fgm.friend_user_id = p_friend_user_id;

  IF p_group_id IS NULL THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friend_groups g WHERE g.id = p_group_id AND g.owner_id = v_me
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;

  INSERT INTO public.friend_group_members (group_id, friend_user_id)
  VALUES (p_group_id, p_friend_user_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friend_acquired_blueprints(p_friend_id uuid)
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
  IF NOT public.are_accepted_friends(v_me, p_friend_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not friends');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'acquired', COALESCE((
      SELECT jsonb_object_agg(ab.blueprint_id, true)
      FROM public.acquired_blueprints ab
      WHERE ab.user_id = p_friend_id
    ), '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friend_personal_inventory(p_friend_id uuid)
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
  IF NOT public.are_accepted_friends(v_me, p_friend_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not friends');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'inventory', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.resource_key, i.quality, i.note_key)
      FROM public.personal_resource_inventory i
      WHERE i.user_id = p_friend_id
    ), '[]'::jsonb)
  );
END;
$$;

-- Grants
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'search_member_for_friend_request(text)',
      'send_friend_request(text)',
      'cancel_friend_request(uuid)',
      'respond_friend_request(uuid, boolean)',
      'remove_friend(uuid)',
      'list_my_friends()',
      'create_friend_group(text)',
      'rename_friend_group(uuid, text)',
      'delete_friend_group(uuid)',
      'set_friend_group(uuid, uuid)',
      'get_friend_acquired_blueprints(uuid)',
      'get_friend_personal_inventory(uuid)'
    ]) AS sig
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', r.sig);
  END LOOP;
END $$;
