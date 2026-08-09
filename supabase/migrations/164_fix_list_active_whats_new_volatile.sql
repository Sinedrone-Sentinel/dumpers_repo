-- =============================================================================
-- 164: Fix list_active_whats_new - do not DELETE inside a STABLE / read-only RPC
-- =============================================================================
-- Migration 163 marked list_active_whats_new STABLE and called cleanup_expired
-- (DELETE). PostgREST runs STABLE RPCs in a read-only transaction, so the call
-- fails with cannot execute DELETE in a read-only transaction and the site
-- ticker shows nothing. Public list is filter-only; purge stays on admin list + cron.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_active_whats_new()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'issueKey', e.issue_key,
        'version', e.version,
        'category', e.category,
        'action', e.action,
        'headline', e.headline,
        'detectedAt', e.detected_at,
        'expiresAt', e.detected_at + make_interval(
          days => public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override)
        ),
        'items', e.items,
        'kind', e.kind,
        'tickerCategoryId', e.ticker_category_id,
        'tickerCategorySlug', c.slug,
        'tickerCategoryLabel', c.label,
        'accentHex', c.accent_hex,
        'ttlDays', public.ticker_entry_effective_ttl_days(e.ticker_category_id, e.kind, e.ttl_days_override),
        'ttlDaysOverride', e.ttl_days_override
      )
      ORDER BY e.detected_at DESC, e.category ASC, e.action ASC
    )
    FROM public.whats_new_entries e
    LEFT JOIN public.ticker_categories c ON c.id = e.ticker_category_id
    WHERE public.ticker_entry_is_active(e.detected_at, e.ticker_category_id, e.kind, e.ttl_days_override)
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.list_active_whats_new() IS
  'Active Updates ticker rows (anon/authenticated). Filter-only; expired cleanup via cron / admin list.';

GRANT EXECUTE ON FUNCTION public.list_active_whats_new() TO anon, authenticated;
