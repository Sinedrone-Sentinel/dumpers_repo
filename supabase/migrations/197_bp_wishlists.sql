-- =============================================================================
-- 197: BP Wishlist (Resource Tracker)
-- =============================================================================
-- Members may SELECT their own lists and recipes only.
-- Create, rename, delete, add, quantity, remove, Got it, and the
-- Use My Tracked Resources flag go through SECURITY DEFINER RPCs.
-- Caps: 10 wishlists per account, 20 unique recipes per wishlist.
-- Got it deducts one craft at the saved qualities (exact tier) then
-- lowers that recipe by 1, in the same transaction.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bp_wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  use_tracked_resources boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bp_wishlists_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS bp_wishlists_user_id_idx ON public.bp_wishlists (user_id);

CREATE TABLE IF NOT EXISTS public.bp_wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id uuid NOT NULL REFERENCES public.bp_wishlists (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blueprint_key text NOT NULL,
  blueprint_name text NOT NULL,
  quantity integer NOT NULL,
  slot_qualities jsonb NOT NULL DEFAULT '{}'::jsonb,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipe_signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bp_wishlist_items_qty CHECK (quantity >= 1 AND quantity <= 9999),
  CONSTRAINT bp_wishlist_items_unique_recipe UNIQUE (wishlist_id, recipe_signature)
);

CREATE INDEX IF NOT EXISTS bp_wishlist_items_user_id_idx ON public.bp_wishlist_items (user_id);
CREATE INDEX IF NOT EXISTS bp_wishlist_items_wishlist_id_idx ON public.bp_wishlist_items (wishlist_id);

COMMENT ON TABLE public.bp_wishlists IS
  'Named blueprint wishlists. Mutations are DEFINER RPCs only.';
COMMENT ON TABLE public.bp_wishlist_items IS
  'One row per unique recipe (blueprint + saved material qualities). Quantity stacks exact matches.';

ALTER TABLE public.bp_wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bp_wishlist_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bp_wishlists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bp_wishlist_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bp_wishlists TO authenticated;
GRANT SELECT ON TABLE public.bp_wishlist_items TO authenticated;

DROP POLICY IF EXISTS bp_wishlists_select_own ON public.bp_wishlists;
CREATE POLICY bp_wishlists_select_own
  ON public.bp_wishlists
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS bp_wishlist_items_select_own ON public.bp_wishlist_items;
CREATE POLICY bp_wishlist_items_select_own
  ON public.bp_wishlist_items
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bp_wishlist_lock_owner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to use BP Wishlist';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
END;
$$;

REVOKE ALL ON FUNCTION public.bp_wishlist_lock_owner() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bp_wishlist_recipe_signature(
  p_blueprint_key text,
  p_materials jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(p_blueprint_key) || '|' || COALESCE((
    SELECT string_agg(
      (e->>'slotIndex') || ':' || btrim(e->>'resourceKey') || ':' || (e->>'quality'),
      ',' ORDER BY (e->>'slotIndex')::int, btrim(e->>'resourceKey'), (e->>'quality')::int
    )
    FROM jsonb_array_elements(COALESCE(p_materials, '[]'::jsonb)) e
  ), '');
$$;

REVOKE ALL ON FUNCTION public.bp_wishlist_recipe_signature(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bp_wishlist_normalize_materials(p_materials jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_el jsonb;
  v_out jsonb := '[]'::jsonb;
  v_count int := 0;
  v_slot int;
  v_quality int;
  v_scu numeric;
  v_key text;
  v_label text;
BEGIN
  IF p_materials IS NULL OR jsonb_typeof(p_materials) <> 'array' THEN
    RAISE EXCEPTION 'Materials for this blueprint are missing';
  END IF;

  FOR v_el IN SELECT * FROM jsonb_array_elements(p_materials)
  LOOP
    v_count := v_count + 1;
    IF v_count > 40 THEN
      RAISE EXCEPTION 'This blueprint has too many materials to save';
    END IF;
    v_key := btrim(COALESCE(v_el->>'resourceKey', ''));
    v_label := btrim(COALESCE(v_el->>'label', ''));
    IF v_key = '' OR char_length(v_key) > 120 OR v_label = '' OR char_length(v_label) > 120 THEN
      RAISE EXCEPTION 'A material on this blueprint could not be saved';
    END IF;
    BEGIN
      v_slot := (v_el->>'slotIndex')::int;
      v_quality := (v_el->>'quality')::int;
      v_scu := ROUND((v_el->>'scu')::numeric, 3);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'A material on this blueprint could not be saved';
    END;
    IF v_slot IS NULL OR v_slot < 0 OR v_slot > 40 THEN
      RAISE EXCEPTION 'A material on this blueprint could not be saved';
    END IF;
    IF v_quality IS NULL OR v_quality < 0 OR v_quality > 100000 THEN
      RAISE EXCEPTION 'A material on this blueprint could not be saved';
    END IF;
    IF v_scu IS NULL OR v_scu < 0 OR v_scu > 1000000 THEN
      RAISE EXCEPTION 'A material on this blueprint could not be saved';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'slotIndex', v_slot,
      'resourceKey', v_key,
      'label', v_label,
      'quality', v_quality,
      'scu', v_scu,
      'wholeUnit', COALESCE((v_el->>'wholeUnit')::boolean, false)
    ));
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.bp_wishlist_normalize_materials(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_bp_wishlist(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_id uuid;
  v_count int;
BEGIN
  PERFORM public.bp_wishlist_lock_owner();
  IF char_length(v_name) < 1 OR char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Wishlist names must be 1-40 characters';
  END IF;
  SELECT count(*) INTO v_count FROM public.bp_wishlists WHERE user_id = auth.uid();
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'You can keep up to 10 wishlists';
  END IF;
  INSERT INTO public.bp_wishlists (user_id, name)
  VALUES (auth.uid(), v_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_bp_wishlist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_bp_wishlist(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_bp_wishlist(p_wishlist_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  PERFORM public.bp_wishlist_lock_owner();
  IF char_length(v_name) < 1 OR char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Wishlist names must be 1-40 characters';
  END IF;
  UPDATE public.bp_wishlists
  SET name = v_name, updated_at = now()
  WHERE id = p_wishlist_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_bp_wishlist(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_bp_wishlist(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_bp_wishlist(p_wishlist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bp_wishlist_lock_owner();
  DELETE FROM public.bp_wishlists
  WHERE id = p_wishlist_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_bp_wishlist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_bp_wishlist(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_bp_wishlist_use_tracked(
  p_wishlist_id uuid,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bp_wishlist_lock_owner();
  UPDATE public.bp_wishlists
  SET use_tracked_resources = COALESCE(p_enabled, false), updated_at = now()
  WHERE id = p_wishlist_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_bp_wishlist_use_tracked(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_bp_wishlist_use_tracked(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_blueprint_to_wishlists(
  p_wishlist_ids uuid[],
  p_blueprint_key text,
  p_blueprint_name text,
  p_slot_qualities jsonb,
  p_materials jsonb,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_seen uuid[] := '{}';
  v_key text := btrim(COALESCE(p_blueprint_key, ''));
  v_name text := btrim(COALESCE(p_blueprint_name, ''));
  v_materials jsonb;
  v_sig text;
  v_qty int := COALESCE(p_quantity, 1);
  v_item_id uuid;
  v_unique int;
  v_results jsonb := '[]'::jsonb;
  v_owned int;
BEGIN
  PERFORM public.bp_wishlist_lock_owner();
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'This blueprint could not be saved';
  END IF;
  IF v_name = '' OR char_length(v_name) > 160 THEN
    RAISE EXCEPTION 'This blueprint could not be saved';
  END IF;
  IF v_qty < 1 OR v_qty > 999 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 999';
  END IF;
  IF p_slot_qualities IS NOT NULL AND jsonb_typeof(p_slot_qualities) <> 'object' THEN
    RAISE EXCEPTION 'This blueprint could not be saved';
  END IF;
  IF p_wishlist_ids IS NULL OR cardinality(p_wishlist_ids) = 0 THEN
    RAISE EXCEPTION 'Pick at least one wishlist';
  END IF;

  v_materials := public.bp_wishlist_normalize_materials(p_materials);
  v_sig := public.bp_wishlist_recipe_signature(v_key, v_materials);

  FOREACH v_id IN ARRAY p_wishlist_ids
  LOOP
    IF v_id = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_id);

    SELECT 1 INTO v_owned
    FROM public.bp_wishlists
    WHERE id = v_id AND user_id = auth.uid()
    FOR UPDATE;

    IF v_owned IS NULL THEN
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'wishlistId', v_id,
        'status', 'missing'
      ));
      CONTINUE;
    END IF;

    SELECT id INTO v_item_id
    FROM public.bp_wishlist_items
    WHERE wishlist_id = v_id AND recipe_signature = v_sig
    FOR UPDATE;

    IF v_item_id IS NOT NULL THEN
      UPDATE public.bp_wishlist_items
      SET quantity = LEAST(quantity + v_qty, 9999)
      WHERE id = v_item_id;
      UPDATE public.bp_wishlists SET updated_at = now() WHERE id = v_id;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'wishlistId', v_id,
        'status', 'stacked'
      ));
    ELSE
      SELECT count(*) INTO v_unique
      FROM public.bp_wishlist_items
      WHERE wishlist_id = v_id;
      IF v_unique >= 20 THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'wishlistId', v_id,
          'status', 'full'
        ));
      ELSE
        INSERT INTO public.bp_wishlist_items (
          wishlist_id, user_id, blueprint_key, blueprint_name,
          quantity, slot_qualities, materials, recipe_signature
        ) VALUES (
          v_id, auth.uid(), v_key, v_name,
          v_qty, COALESCE(p_slot_qualities, '{}'::jsonb), v_materials, v_sig
        );
        UPDATE public.bp_wishlists SET updated_at = now() WHERE id = v_id;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'wishlistId', v_id,
          'status', 'added'
        ));
      END IF;
    END IF;
    v_owned := NULL;
    v_item_id := NULL;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.add_blueprint_to_wishlists(uuid[], text, text, jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_blueprint_to_wishlists(uuid[], text, text, jsonb, jsonb, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_bp_wishlist_item_quantity(
  p_item_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bp_wishlist_lock_owner();
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 9999 THEN
    RAISE EXCEPTION 'Quantity must be at least 1';
  END IF;
  UPDATE public.bp_wishlist_items
  SET quantity = p_quantity
  WHERE id = p_item_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blueprint not found on this wishlist';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_bp_wishlist_item_quantity(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_bp_wishlist_item_quantity(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_bp_wishlist_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bp_wishlist_lock_owner();
  DELETE FROM public.bp_wishlist_items
  WHERE id = p_item_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blueprint not found on this wishlist';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_bp_wishlist_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_bp_wishlist_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.got_it_bp_wishlist_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.bp_wishlist_items%ROWTYPE;
  v_use boolean;
  v_plan jsonb;
BEGIN
  PERFORM public.bp_wishlist_lock_owner();

  SELECT * INTO v_item
  FROM public.bp_wishlist_items
  WHERE id = p_item_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blueprint not found on this wishlist';
  END IF;

  SELECT use_tracked_resources INTO v_use
  FROM public.bp_wishlists
  WHERE id = v_item.wishlist_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist not found';
  END IF;

  IF v_use THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'resource_key', e->>'resourceKey',
      'quality', (e->>'quality')::int,
      'quantity', ROUND((e->>'scu')::numeric, 3)
    )), '[]'::jsonb)
    INTO v_plan
    FROM jsonb_array_elements(v_item.materials) e
    WHERE ROUND((e->>'scu')::numeric, 3) > 0;

    v_plan := public.merge_stock_deduct_plan(v_plan);
    BEGIN
      PERFORM public.apply_personal_stock_deduct_plan(auth.uid(), v_plan);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM ILIKE 'Insufficient%' THEN
          RAISE EXCEPTION 'Not enough of a saved material at that quality in My Resources';
        END IF;
        RAISE;
    END;
  END IF;

  IF v_item.quantity <= 1 THEN
    DELETE FROM public.bp_wishlist_items WHERE id = v_item.id;
  ELSE
    UPDATE public.bp_wishlist_items
    SET quantity = quantity - 1
    WHERE id = v_item.id;
  END IF;

  UPDATE public.bp_wishlists SET updated_at = now() WHERE id = v_item.wishlist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.got_it_bp_wishlist_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.got_it_bp_wishlist_item(uuid) TO authenticated;
