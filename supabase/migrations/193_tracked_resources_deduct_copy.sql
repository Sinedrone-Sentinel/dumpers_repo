-- 193: Member-facing deduct errors say Tracked Resources (not My Resources).

CREATE OR REPLACE FUNCTION public.assert_personal_stock_covers_plan(
  p_user_id uuid,
  p_plan jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_el jsonb;
  v_key text;
  v_quality int;
  v_need numeric;
  v_have numeric;
BEGIN
  PERFORM public.validate_stock_deduct_plan(p_plan);
  FOR v_el IN SELECT * FROM jsonb_array_elements(p_plan)
  LOOP
    v_key := v_el->>'resource_key';
    v_quality := (v_el->>'quality')::int;
    v_need := ROUND((v_el->>'quantity')::numeric, 3);
    v_have := public.personal_resource_stock_at_quality(p_user_id, v_key, v_quality);
    IF v_have < v_need THEN
      RAISE EXCEPTION 'Insufficient Tracked Resources for % at Q% (need %, have %)',
        v_key, v_quality, v_need, v_have;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_personal_resource_stock_at_quality(
  p_user_id uuid,
  p_resource_key text,
  p_quality integer,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row record;
  remaining numeric;
  take numeric;
BEGIN
  remaining := ROUND(p_quantity::numeric, 3);
  IF remaining <= 0 THEN
    RETURN;
  END IF;

  FOR row IN
    SELECT id, quantity
    FROM public.personal_resource_inventory
    WHERE user_id = p_user_id
      AND resource_key = p_resource_key
      AND quality = p_quality
      AND quantity > 0
    ORDER BY quantity ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(row.quantity, remaining);
    IF row.quantity - take <= 0 THEN
      DELETE FROM public.personal_resource_inventory WHERE id = row.id;
    ELSE
      UPDATE public.personal_resource_inventory
      SET
        quantity = ROUND(quantity - take, 3),
        updated_at = now(),
        updated_by = p_user_id
      WHERE id = row.id;
    END IF;
    remaining := ROUND(remaining - take, 3);
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient Tracked Resources for % at Q%', p_resource_key, p_quality;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_personal_stock_covers_plan(uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.deduct_personal_resource_stock_at_quality(uuid, text, integer, numeric) FROM PUBLIC, authenticated;
