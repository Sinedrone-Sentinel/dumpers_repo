-- One-shot / re-runnable: clear every unverified RSI handle on profiles.
-- Safe to run after migration 155 (idempotent). Verified handles are untouched.
--
-- Run in Supabase SQL Editor (service role / dashboard).

SELECT public.profiles_begin_privileged_update();

UPDATE public.profiles
SET
  rsi_handle = NULL,
  rsi_handle_verified = false,
  rsi_handle_verified_at = NULL,
  updated_at = now()
WHERE COALESCE(rsi_handle_verified, false) = false
  AND rsi_handle IS NOT NULL;

-- Optional: drop orphan challenges for those users
DELETE FROM public.rsi_verify_challenges c
WHERE EXISTS (
  SELECT 1
  FROM public.profiles p
  WHERE p.id = c.user_id
    AND COALESCE(p.rsi_handle_verified, false) = false
);
