-- 205: Member-facing Bazaar wording uses Buyer / Seller only.
--
-- Error messages, notifications and Discord text inside existing functions said
-- "fulfiller", "fulfillment" or "customer". Each function is rewritten from its
-- live definition with exact phrase swaps, so no body is hand-copied here. Column
-- names, event types and RPC names stay as they are.

DO $migrate$
DECLARE
  v_swaps text[][] := ARRAY[
    ['Permission denied: fulfillment access required', 'Permission denied: Bazaar access required'],
    ['Select items and quantities to fulfill from this listing', 'Select items and quantities to sell to this listing'],
    ['Select at least one item to fulfill', 'Select at least one item to sell'],
    ['You cannot fulfill your own listing', 'You cannot sell to your own listing'],
    ['Cannot fulfill from a claimed order', 'Cannot sell to a claimed order'],
    ['Fulfillment limit reached:', 'Seller limit reached:'],
    ['fulfiller reputation (%)', 'seller reputation (%)'],
    ['Fulfillment total must be greater than zero', 'Sale total must be greater than zero'],
    [' (partial fulfillment)', ' (partial sale)'],
    ['Fulfillment started', 'Sale started'],
    ['Customer expects ', 'Buyer expects '],
    ['Fulfiller timed out', 'Seller timed out'],
    ['Fulfiller backed out', 'Seller backed out'],
    ['Only the assigned fulfiller can abandon this order', 'Only the member who took this deal can release it'],
    ['Only the assigned fulfiller can complete this order', 'Only the seller on this deal can complete it'],
    ['Only the assigned fulfiller can start this order', 'Only the seller on this deal can start it'],
    ['Only the assigned fulfiller can update fulfillment items', 'Only the seller on this deal can update its items'],
    ['Only the requester or fulfiller can archive this order', 'Only the buyer or seller can archive this order'],
    ['This order has no fulfiller to rate', 'This order has no seller to rate'],
    ['Order has no fulfiller assigned', 'Order has no seller assigned'],
    ['''Fulfiller: ''', '''Seller: '''],
    ['''Fulfiller'')', '''Seller'')'],
    ['''Your fulfiller'')', '''Your seller'')'],
    ['''Customer'')', '''Buyer'')'],
    ['being fulfilled. Please wait', 'being crafted. Please wait'],
    ['same fulfiller for multiple orders', 'same seller for multiple orders']
  ];
  r record;
  v_def text;
  v_new text;
  i int;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosrc ~* '(fulfil|customer)'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;
    FOR i IN 1 .. array_length(v_swaps, 1) LOOP
      v_new := replace(v_new, v_swaps[i][1], v_swaps[i][2]);
    END LOOP;
    IF v_new <> v_def THEN
      EXECUTE v_new;
    END IF;
  END LOOP;

  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND position(v_swaps[i][1] IN p.prosrc) > 0
    ) THEN
      RAISE EXCEPTION 'Wording swap left behind: %', v_swaps[i][1];
    END IF;
  END LOOP;
END;
$migrate$;

-- Existing rows members still read.
UPDATE public.custom_orders
SET title = replace(title, ' (partial fulfillment)', ' (partial sale)')
WHERE title LIKE '% (partial fulfillment)%';

UPDATE public.user_notifications
SET
  title = replace(replace(replace(title,
    'Fulfillment started', 'Sale started'),
    'Fulfiller timed out', 'Seller timed out'),
    'Fulfiller backed out', 'Seller backed out'),
  body = replace(replace(replace(body,
    'Customer expects ', 'Buyer expects '),
    'Fulfiller timed out', 'Seller timed out'),
    ' (partial fulfillment)', ' (partial sale)')
WHERE title ~ '(Fulfillment started|Fulfiller timed out|Fulfiller backed out)'
   OR body ~ '(Customer expects |Fulfiller timed out| \(partial fulfillment\))';