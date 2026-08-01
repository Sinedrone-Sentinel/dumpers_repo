-- =============================================================================
-- 137: Dumper Services Discord bot test harness (Partnership Accept proof)
-- =============================================================================
-- Minimal first-wins request + Discord message refs so we can prove the bot
-- Interactions endpoint works BEFORE full Partnership Phase 2/3 UI.
-- Existing personal/market Discord webhooks are untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dumper_services_bot_test_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'cancelled')),
  service_label text NOT NULL DEFAULT 'Test Service',
  requester_label text NOT NULL DEFAULT 'Test Requester',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by_discord_user_id text,
  accepted_by_discord_username text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dumper_services_bot_test_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL
    REFERENCES public.dumper_services_bot_test_requests(id) ON DELETE CASCADE,
  guild_id text,
  channel_id text NOT NULL,
  message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS dumper_services_bot_test_messages_request_idx
  ON public.dumper_services_bot_test_messages (request_id);

ALTER TABLE public.dumper_services_bot_test_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dumper_services_bot_test_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dumper_services_bot_test_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.dumper_services_bot_test_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.dumper_services_bot_test_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.dumper_services_bot_test_messages FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_dumper_services_bot_test_request — Edge post-test (service_role)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_dumper_services_bot_test_request(
  p_service_label text DEFAULT 'Test Service',
  p_requester_label text DEFAULT 'Test Requester',
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  INSERT INTO public.dumper_services_bot_test_requests (
    service_label, requester_label, created_by
  ) VALUES (
    coalesce(nullif(trim(p_service_label), ''), 'Test Service'),
    coalesce(nullif(trim(p_requester_label), ''), 'Test Requester'),
    p_created_by
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_dumper_services_bot_test_request(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dumper_services_bot_test_request(text, text, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- register_dumper_services_bot_test_message — Edge after Discord post
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_dumper_services_bot_test_message(
  p_request_id uuid,
  p_channel_id text,
  p_message_id text,
  p_guild_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_request_id IS NULL OR nullif(trim(p_channel_id), '') IS NULL
     OR nullif(trim(p_message_id), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_id, channel_id, message_id required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dumper_services_bot_test_requests WHERE id = p_request_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  INSERT INTO public.dumper_services_bot_test_messages (
    request_id, guild_id, channel_id, message_id
  ) VALUES (
    p_request_id,
    nullif(trim(p_guild_id), ''),
    trim(p_channel_id),
    trim(p_message_id)
  )
  ON CONFLICT (channel_id, message_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.register_dumper_services_bot_test_message(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_dumper_services_bot_test_message(uuid, text, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- accept_dumper_services_bot_test — first-wins (service_role / Interactions Edge)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_dumper_services_bot_test(
  p_request_id uuid,
  p_discord_user_id text,
  p_discord_username text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dumper_services_bot_test_requests%ROWTYPE;
  v_messages jsonb;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_request_id IS NULL OR nullif(trim(p_discord_user_id), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_id and discord user required');
  END IF;

  UPDATE public.dumper_services_bot_test_requests
  SET
    status = 'accepted',
    accepted_by_discord_user_id = trim(p_discord_user_id),
    accepted_by_discord_username = nullif(trim(coalesce(p_discord_username, '')), ''),
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_request_id
    AND status = 'open'
  RETURNING * INTO v_row;

  IF FOUND THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'channel_id', m.channel_id,
          'message_id', m.message_id,
          'guild_id', m.guild_id
        )
      ),
      '[]'::jsonb
    )
    INTO v_messages
    FROM public.dumper_services_bot_test_messages m
    WHERE m.request_id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'won', true,
      'request_id', v_row.id,
      'service_label', v_row.service_label,
      'requester_label', v_row.requester_label,
      'accepted_by_discord_user_id', v_row.accepted_by_discord_user_id,
      'accepted_by_discord_username', v_row.accepted_by_discord_username,
      'messages', v_messages
    );
  END IF;

  SELECT * INTO v_row
  FROM public.dumper_services_bot_test_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'channel_id', m.channel_id,
        'message_id', m.message_id,
        'guild_id', m.guild_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_messages
  FROM public.dumper_services_bot_test_messages m
  WHERE m.request_id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'won', false,
    'request_id', v_row.id,
    'status', v_row.status,
    'service_label', v_row.service_label,
    'requester_label', v_row.requester_label,
    'accepted_by_discord_user_id', v_row.accepted_by_discord_user_id,
    'accepted_by_discord_username', v_row.accepted_by_discord_username,
    'messages', v_messages,
    'error', 'Already taken'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_dumper_services_bot_test(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_dumper_services_bot_test(uuid, text, text) TO service_role;

COMMENT ON TABLE public.dumper_services_bot_test_requests IS
  'Harness for Dumper Services Discord bot Accept race tests. Replace with real service_requests in Phase 3.';
