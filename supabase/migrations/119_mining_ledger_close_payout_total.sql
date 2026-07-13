-- Site stats payout fix: the SQL re-computation of ledger payout always summed
-- 0 aUEC because default DFP ore prices only exist client-side (priceOverrides
-- rows are seeded with null until a member types a price). The app now passes
-- the ledger's Pool (Actual) — or Pool (Est.) when actual is 0 — at close time
-- and the stats row just keeps a running total. A ledger with no payout at all
-- is a fake/empty ledger: it does not count toward any site stat.

DROP FUNCTION IF EXISTS public.record_mining_ledger_archive_stats(jsonb);

CREATE OR REPLACE FUNCTION public.record_mining_ledger_archive_stats(
  p_data jsonb,
  p_total_payout_auec bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_crew_count bigint;
  v_total_payout bigint;
BEGIN
  v_total_payout := GREATEST(0, COALESCE(p_total_payout_auec, 0));
  IF v_total_payout <= 0 THEN
    RETURN;
  END IF;

  v_crew_count := public.mining_ledger_crew_listed_count(p_data);

  UPDATE public.mining_ledger_site_stats
  SET
    archived_ledger_count = archived_ledger_count + 1,
    crew_member_count = crew_member_count + v_crew_count,
    total_payout_auec = total_payout_auec + v_total_payout,
    updated_at = now()
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.mining_ledger_site_stats (
      id, archived_ledger_count, crew_member_count, total_payout_auec
    )
    VALUES (1, 1, v_crew_count, v_total_payout);
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.close_mining_ledger(uuid, boolean);

CREATE OR REPLACE FUNCTION public.close_mining_ledger(
  p_ledger_id uuid,
  p_record_archive_stats boolean DEFAULT false,
  p_total_payout_auec bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger public.mining_ledgers%ROWTYPE;
  v_actor_name text;
  v_collab_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.mining_ledger_can_access(p_ledger_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  SELECT * INTO v_ledger FROM public.mining_ledgers WHERE id = p_ledger_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ledger not found');
  END IF;

  IF p_record_archive_stats THEN
    PERFORM public.record_mining_ledger_archive_stats(v_ledger.data, p_total_payout_auec);
  END IF;

  SELECT COALESCE(rsi_handle, display_name, email, 'Someone')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_ledger.created_by IS DISTINCT FROM auth.uid() THEN
    PERFORM public.create_user_notification(
      v_ledger.created_by,
      'mining_ledger_closed',
      'Mining ledger closed',
      v_actor_name || ' closed the ledger "' || v_ledger.name || '"',
      jsonb_build_object('ledger_id', p_ledger_id, 'ledger_name', v_ledger.name, 'closed_by', auth.uid())
    );
  END IF;

  FOR v_collab_id IN
    SELECT c.user_id
    FROM public.mining_ledger_collaborators c
    WHERE c.ledger_id = p_ledger_id
      AND c.user_id IS DISTINCT FROM auth.uid()
  LOOP
    PERFORM public.create_user_notification(
      v_collab_id,
      'mining_ledger_closed',
      'Mining ledger closed',
      v_actor_name || ' closed the ledger "' || v_ledger.name || '"',
      jsonb_build_object('ledger_id', p_ledger_id, 'ledger_name', v_ledger.name, 'closed_by', auth.uid())
    );
  END LOOP;

  DELETE FROM public.mining_ledgers WHERE id = p_ledger_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_mining_ledger(uuid, boolean, bigint) TO authenticated;
