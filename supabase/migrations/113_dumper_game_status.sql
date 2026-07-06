-- BP Dumper live tracker: in-game session status for status bar UX

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dumper_game_status text,
  ADD COLUMN IF NOT EXISTS dumper_game_status_at timestamptz;

COMMENT ON COLUMN public.profiles.dumper_game_status IS
  'Live tracker game session phase: tracking, exit_menu, quit_game, crash_waiting, reconnected.';
COMMENT ON COLUMN public.profiles.dumper_game_status_at IS
  'When dumper_game_status last changed (from BP Dumper game session events).';
