-- Profile settings columns for org scope and fulfillment (Phase 0)
-- Run in Supabase SQL Editor after 008_preview_features.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_only_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fulfillment_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.org_only_mode IS
  'When true, default data views scope to same-org members and resources.';

COMMENT ON COLUMN public.profiles.fulfillment_enabled IS
  'When true, user may accept and fulfill custom orders (provider role).';
