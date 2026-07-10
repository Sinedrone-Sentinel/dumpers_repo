import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const mig = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')

function extract(fnName, sql) {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${fnName}[\\s\\S]*?END;\\n\\$\\$;`
  )
  const m = sql.match(re)
  if (!m) throw new Error(`Missing ${fnName}`)
  return m[0]
}

const accept = mig('103_fix_wts_partial_deplete_line.sql').replace(
  '  RETURN jsonb_build_object(',
  `  PERFORM public.bump_marketplace_listing_activity(p_listing_id);
  PERFORM public.insert_marketplace_purchase_feed(v_purchase_id);

  RETURN jsonb_build_object(`
)

let abandon = extract('abandon_custom_order_fulfillment', mig('092_discord_embed_delivery_fix.sql'))
abandon = abandon.replace(
  `    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      p_order_id, auth.uid(), 'abandoned',
      jsonb_build_object('listing_type', order_row.listing_type, 'notify_user_id', notify_user)
    );
  END IF;`,
  `    INSERT INTO public.order_events (order_id, actor_id, event_type, details)
    VALUES (
      p_order_id, auth.uid(), 'abandoned',
      jsonb_build_object('listing_type', order_row.listing_type, 'notify_user_id', notify_user)
    );

    PERFORM public.bump_marketplace_listing_activity(p_order_id);
  END IF;`
)

let update = extract('update_custom_order_requester', mig('108_wts_list_price_bounds.sql'))
update = update.replace(
  `  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
    VALUES (p_order_id, item->>'resource_key', (item->>'quantity')::numeric);
  END LOOP;
END;
$$;`,
  `  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.custom_order_items (order_id, resource_key, quantity)
    VALUES (p_order_id, item->>'resource_key', (item->>'quantity')::numeric);
  END LOOP;

  PERFORM public.bump_marketplace_listing_activity(p_order_id);
END;
$$$$;`
)

let restore = extract('restore_wts_purchase_to_listing', mig('091_wts_partial_purchase.sql'))
restore = restore.replace(
  `  IF v_listing.status = 'cancelled' THEN
    UPDATE public.custom_orders
    SET status = 'pending', updated_at = now()
    WHERE id = v_listing.id;
  END IF;
END;
$$;`,
  `  IF v_listing.status = 'cancelled' THEN
    UPDATE public.custom_orders
    SET status = 'pending', updated_at = now()
    WHERE id = v_listing.id;
  END IF;

  PERFORM public.bump_marketplace_listing_activity(v_listing.id);
END;
$$$$;`
)

const out = `-- Marketplace hooks on existing order RPCs (requires 116_marketplace_ads.sql)

${accept}

${abandon}

${restore}

${update}
`

fs.writeFileSync(path.join(root, 'supabase/migrations/117_marketplace_ads_rpc_hooks.sql'), out)
console.log('Wrote 117_marketplace_ads_rpc_hooks.sql')
