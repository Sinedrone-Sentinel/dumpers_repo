-- Migration 171: Default friend group + protected group lifecycle
-- Every owner gets a non-editable Default group (always last). New friendships
-- land in Default. Deleting a custom group moves members to Default.

ALTER TABLE public.friend_groups
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS friend_groups_one_default_per_owner
  ON public.friend_groups (owner_id)
  WHERE is_default;

COMMENT ON COLUMN public.friend_groups.is_default IS
  'System Default group per owner; cannot rename/delete; always last sort_order';

CREATE OR REPLACE FUNCTION public.ensure_default_friend_group(p_owner_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_max int;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'owner required';
  END IF;

  SELECT g.id INTO v_id
  FROM public.friend_groups g
  WHERE g.owner_id = p_owner_id AND g.is_default
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) INTO v_max
    FROM public.friend_groups
    WHERE owner_id = p_owner_id AND NOT is_default;

    UPDATE public.friend_groups
    SET sort_order = GREATEST(v_max + 1, sort_order),
        label = 'Default',
        updated_at = now()
    WHERE id = v_id
      AND (sort_order <= v_max OR label IS DISTINCT FROM 'Default');

    RETURN v_id;
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_max
  FROM public.friend_groups
  WHERE owner_id = p_owner_id;

  INSERT INTO public.friend_groups (owner_id, label, sort_order, is_default)
  VALUES (p_owner_id, 'Default', v_max, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_friend_in_default_group(p_owner_id uuid, p_friend_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default uuid;
BEGIN
  IF p_owner_id IS NULL OR p_friend_user_id IS NULL OR p_owner_id = p_friend_user_id THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.friend_group_members fgm
    INNER JOIN public.friend_groups fg ON fg.id = fgm.group_id
    WHERE fg.owner_id = p_owner_id
      AND fgm.friend_user_id = p_friend_user_id
  ) THEN
    RETURN;
  END IF;

  v_default := public.ensure_default_friend_group(p_owner_id);

  INSERT INTO public.friend_group_members (group_id, friend_user_id)
  VALUES (v_default, p_friend_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_friend_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_friend_in_default_group(uuid, uuid) FROM PUBLIC;

DO $$
DECLARE
  v_owner uuid;
  r public.friendships%ROWTYPE;
BEGIN
  FOR v_owner IN
    SELECT DISTINCT owner_id FROM public.friend_groups
  LOOP
    PERFORM public.ensure_default_friend_group(v_owner);
  END LOOP;

  FOR r IN
    SELECT f.* FROM public.friendships f WHERE f.status = 'accepted'
  LOOP
    PERFORM public.ensure_default_friend_group(r.user_low);
    PERFORM public.ensure_default_friend_group(r.user_high);
    PERFORM public.ensure_friend_in_default_group(r.user_low, r.user_high);
    PERFORM public.ensure_friend_in_default_group(r.user_high, r.user_low);
  END LOOP;
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
  v_other uuid;
  r public.friendships%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  PERFORM public.ensure_pending_friend_notifications();
  PERFORM public.ensure_default_friend_group(v_me);

  FOR r IN
    SELECT f.*
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.user_low = v_me OR f.user_high = v_me)
  LOOP
    v_other := public.friend_other_user(r, v_me);
    PERFORM public.ensure_friend_in_default_group(v_me, v_other);
  END LOOP;

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
          'sortOrder', g.sort_order,
          'isDefault', g.is_default
        )
        ORDER BY g.is_default ASC, g.sort_order ASC, lower(g.label) ASC
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
  v_default uuid;
  v_sort int;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF char_length(v_label) < 1 OR char_length(v_label) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group label must be 1-40 characters');
  END IF;

  v_default := public.ensure_default_friend_group(v_me);

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_sort
  FROM public.friend_groups
  WHERE owner_id = v_me AND NOT is_default;

  INSERT INTO public.friend_groups (owner_id, label, sort_order, is_default)
  VALUES (v_me, v_label, v_sort, false)
  RETURNING id INTO v_id;

  UPDATE public.friend_groups
  SET sort_order = v_sort + 1, updated_at = now()
  WHERE id = v_default;

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
  v_is_default boolean;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;
  IF char_length(v_label) < 1 OR char_length(v_label) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group label must be 1-40 characters');
  END IF;

  SELECT g.is_default INTO v_is_default
  FROM public.friend_groups g
  WHERE g.id = p_group_id AND g.owner_id = v_me;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;
  IF v_is_default THEN
    RETURN jsonb_build_object('success', false, 'error', 'The Default group cannot be renamed');
  END IF;

  UPDATE public.friend_groups
  SET label = v_label, updated_at = now()
  WHERE id = p_group_id AND owner_id = v_me;

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
  v_is_default boolean;
  v_default uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  SELECT g.is_default INTO v_is_default
  FROM public.friend_groups g
  WHERE g.id = p_group_id AND g.owner_id = v_me;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;
  IF v_is_default THEN
    RETURN jsonb_build_object('success', false, 'error', 'The Default group cannot be deleted');
  END IF;

  v_default := public.ensure_default_friend_group(v_me);

  INSERT INTO public.friend_group_members (group_id, friend_user_id)
  SELECT v_default, fgm.friend_user_id
  FROM public.friend_group_members fgm
  WHERE fgm.group_id = p_group_id
  ON CONFLICT DO NOTHING;

  DELETE FROM public.friend_group_members WHERE group_id = p_group_id;
  DELETE FROM public.friend_groups WHERE id = p_group_id AND owner_id = v_me;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_friend_groups(p_group_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_default uuid;
  v_id uuid;
  v_idx int := 0;
  v_custom_owned int;
  v_given int;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  IF p_group_ids IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group list required');
  END IF;

  v_default := public.ensure_default_friend_group(v_me);

  SELECT COUNT(*)::int INTO v_custom_owned
  FROM public.friend_groups g
  WHERE g.owner_id = v_me AND NOT g.is_default;

  SELECT COUNT(DISTINCT x)::int INTO v_given
  FROM unnest(p_group_ids) AS x
  WHERE x IS DISTINCT FROM v_default;

  IF v_given <> v_custom_owned OR (
    SELECT COUNT(*)::int FROM unnest(p_group_ids) AS x WHERE x IS DISTINCT FROM v_default
  ) <> v_custom_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group list must include every custom group once');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_group_ids) AS x(id)
    WHERE x.id IS DISTINCT FROM v_default
      AND NOT EXISTS (
        SELECT 1 FROM public.friend_groups g
        WHERE g.id = x.id AND g.owner_id = v_me AND NOT g.is_default
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid group');
  END IF;

  FOREACH v_id IN ARRAY p_group_ids
  LOOP
    IF v_id IS NOT DISTINCT FROM v_default THEN
      CONTINUE;
    END IF;
    UPDATE public.friend_groups
    SET sort_order = v_idx, updated_at = now()
    WHERE id = v_id AND owner_id = v_me;
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE public.friend_groups
  SET sort_order = v_idx, updated_at = now()
  WHERE id = v_default;

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
  IF p_group_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group required');
  END IF;
  IF NOT public.are_accepted_friends(v_me, p_friend_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not friends');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friend_groups g WHERE g.id = p_group_id AND g.owner_id = v_me
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Group not found');
  END IF;

  DELETE FROM public.friend_group_members fgm
  USING public.friend_groups fg
  WHERE fgm.group_id = fg.id
    AND fg.owner_id = v_me
    AND fgm.friend_user_id = p_friend_user_id;

  INSERT INTO public.friend_group_members (group_id, friend_user_id)
  VALUES (p_group_id, p_friend_user_id);

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

REVOKE ALL ON FUNCTION public.list_my_friends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_friends() TO authenticated;
REVOKE ALL ON FUNCTION public.create_friend_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_friend_group(text) TO authenticated;
REVOKE ALL ON FUNCTION public.rename_friend_group(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_friend_group(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_friend_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_friend_group(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reorder_friend_groups(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_friend_groups(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_friend_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_friend_group(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_friend_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Undo friends Bazaar hide / trade block (members want friends to trade)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS friends_block_bazaar_assign_trg ON public.custom_orders;
DROP FUNCTION IF EXISTS public.friends_block_bazaar_assign();

DROP POLICY IF EXISTS "custom_orders_select_approved" ON public.custom_orders;
CREATE POLICY "custom_orders_select_approved"
  ON public.custom_orders
  FOR SELECT
  TO authenticated
  USING (public.can_access_preview_features());
