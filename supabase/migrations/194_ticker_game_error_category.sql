-- 194: Game Error ticker layout (red) for client-breaking CIG / third-party warnings.

INSERT INTO public.ticker_categories (slug, label, accent_hex, entry_kind, ttl_days, sort_order, is_system)
VALUES ('game_error', 'Game Error', '#EF4444', 'game', 14, 25, true)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  accent_hex = EXCLUDED.accent_hex,
  entry_kind = EXCLUDED.entry_kind,
  ttl_days = EXCLUDED.ttl_days,
  sort_order = EXCLUDED.sort_order,
  is_system = EXCLUDED.is_system,
  updated_at = now();
