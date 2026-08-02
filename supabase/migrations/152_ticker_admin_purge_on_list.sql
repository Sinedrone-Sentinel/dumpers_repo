-- Expired ticker rows are deleted by cleanup (daily cron). Admin list also
-- purges on load so the modal never needs an "include expired" toggle.

CREATE OR REPLACE FUNCTION public.admin_list_whats_new_entries(p_include_expired boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- p_include_expired ignored (kept for call-site compatibility). Expired rows
  -- must not linger in admin UI — delete them here, same rules as the cron.
  PERFORM public.cleanup_expired_whats_new();

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_at DESC)
    FROM (
      SELECT
        e.detected_at AS sort_at,
        jsonb_build_object(
          'id', e.id,
          'issueKey', e.issue_key,
          'version', e.version,
          'category', e.category,
          'action', e.action,
          'headline', e.headline,
          'items', e.items,
          'kind', e.kind,
          'detectedAt', e.detected_at,
          'expiresAt', e.detected_at + CASE
            WHEN e.kind = 'site' THEN interval '3 days'
            ELSE interval '7 days'
          END,
          'active', true,
          'tickerCategoryId', e.ticker_category_id,
          'tickerCategorySlug', c.slug,
          'tickerCategoryLabel', c.label,
          'accentHex', c.accent_hex
        ) AS row_data
      FROM public.whats_new_entries e
      LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
      ORDER BY e.detected_at DESC
      LIMIT 300
    ) s
  ), '[]'::jsonb);
END;
$$;
