-- Stock cards are unique per (user, resource, quality, note) with case-insensitive note matching.

ALTER TABLE public.personal_resource_inventory
  ADD COLUMN IF NOT EXISTS note_key text NOT NULL DEFAULT '';

UPDATE public.personal_resource_inventory
SET note_key = lower(trim(coalesce(note, '')))
WHERE note_key = '' OR note_key IS DISTINCT FROM lower(trim(coalesce(note, '')));

ALTER TABLE public.personal_resource_inventory
  DROP CONSTRAINT IF EXISTS personal_resource_inventory_user_id_resource_key_quality_key;

DROP INDEX IF EXISTS public.personal_resource_inventory_line_unique;

CREATE UNIQUE INDEX personal_resource_inventory_line_unique
  ON public.personal_resource_inventory (user_id, resource_key, quality, note_key);

COMMENT ON COLUMN public.personal_resource_inventory.note_key IS
  'Lowercase trimmed note for line identity; empty string when note is blank.';

DROP FUNCTION IF EXISTS public.update_inventory_note(text, int, text);

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

  IF v_new_note_key IS DISTINCT FROM v_current_key AND EXISTS (
    SELECT 1
    FROM public.personal_resource_inventory pri
    WHERE pri.user_id = v_user_id
      AND pri.resource_key = p_resource_key
      AND pri.quality = p_quality
      AND pri.note_key = v_new_note_key
  ) THEN
    RAISE EXCEPTION 'A stock card with that note already exists for this resource and quality';
  END IF;

  UPDATE public.personal_resource_inventory
  SET
    note = v_trimmed_note,
    note_key = v_new_note_key,
    updated_at = now()
  WHERE user_id = v_user_id
    AND resource_key = p_resource_key
    AND quality = p_quality
    AND note_key = v_current_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory line not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_inventory_note(text, int, text, text) TO authenticated;
