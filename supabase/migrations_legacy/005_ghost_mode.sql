-- Ghost Mode preference on profiles
-- Run in Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ghost_mode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_ghost_mode_idx
  ON public.profiles (ghost_mode)
  WHERE ghost_mode = true;
