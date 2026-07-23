-- =============================================================================
-- Migration 124: Drop blueprint_resources.is_active (retired resources)
--
-- Resources are never removed from game files — they only stop spawning.
-- The "retired" / is_active flag and UI were unused noise; catalog sync no
-- longer deactivates rows, and the Resource Tracker checkbox is now used for
-- location-style note search instead.
-- =============================================================================

DROP INDEX IF EXISTS public.blueprint_resources_active_idx;

ALTER TABLE public.blueprint_resources
  DROP COLUMN IF EXISTS is_active;
