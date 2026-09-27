-- Editing a location note onto a card that already uses that note combines the piles.
-- Match is the same case-insensitive note key used when adding stock.

CREATE OR REPLACE FUNCTION public.update_inventory_note(
  p_resource_key text,
  p_quality int,
  p_current_note_key text,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_trimmed_note text;
  v_new_note_key text;
  v_current_key text;
  v_source public.personal_resource_inventory%ROWTYPE;
  v_target public.personal_resource_inventory%ROWTYPE;
  v_merged numeric;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_current_key := lower(trim(coalesce(p_current_note_key, '')));

  v_trimmed_note := left(trim(coalesce(p_note, '')), 64);
  IF v_trimmed_note = '' THEN
    v_trimmed_note := NULL;
  END IF;

  v_new_note_key := lower(trim(coalesce(v_trimmed_note, '')));

  SELECT *
  INTO v_source
  FROM public.personal_resource_inventory
  WHERE user_id = v_user_id
    AND resource_key = p_resource_key
    AND quality = p_quality
    AND note_key = v_current_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory line not found';
  END IF;

  IF v_new_note_key IS NOT DISTINCT FROM v_current_key THEN
    UPDATE public.personal_resource_inventory
    SET
      note = v_trimmed_note,
      updated_at = now(),
      updated_by = v_user_id
    WHERE id = v_source.id;
    RETURN;
  END IF;

  SELECT *
  INTO v_target
  FROM public.personal_resource_inventory
  WHERE user_id = v_user_id
    AND resource_key = p_resource_key
    AND quality = p_quality
    AND note_key = v_new_note_key
    AND id <> v_source.id
  FOR UPDATE;

  IF FOUND THEN
    IF public.is_whole_unit_resource(v_source.resource_key) THEN
      v_merged := trunc(v_target.quantity) + trunc(v_source.quantity);
    ELSE
      v_merged := round(v_target.quantity + v_source.quantity, 3);
    END IF;

    UPDATE public.personal_resource_inventory
    SET
      quantity = v_merged,
      note = v_trimmed_note,
      note_key = v_new_note_key,
      updated_at = now(),
      updated_by = v_user_id
    WHERE id = v_target.id;

    DELETE FROM public.personal_resource_inventory
    WHERE id = v_source.id;
    RETURN;
  END IF;

  UPDATE public.personal_resource_inventory
  SET
    note = v_trimmed_note,
    note_key = v_new_note_key,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = v_source.id;
END;
$$;

COMMENT ON FUNCTION public.update_inventory_note(text, int, text, text) IS
  'Rename a stock-card location. If that resource and quality already has the new note, add the quantities together and keep one card.';
