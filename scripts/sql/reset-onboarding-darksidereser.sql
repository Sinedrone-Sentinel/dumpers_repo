-- ONE ACCOUNT ONLY: reset onboarding for Soufiane Berrichi / @DarksideReser
-- so the welcome modal shows again after RSI lockdown.
--
-- Run in Supabase SQL Editor AFTER or AFTER deploying 155 (either is fine).
-- Does not ban, approve, or change role.

UPDATE public.profiles
SET
  has_seen_welcome = false,
  updated_at = now()
WHERE lower(email) = lower('soufianeberrichi89@gmail.com')
   OR lower(COALESCE(rsi_handle, '')) = lower('DarksideReser');

-- Confirm
SELECT id, email, rsi_handle, rsi_handle_verified, has_seen_welcome, role, created_at
FROM public.profiles
WHERE lower(email) = lower('soufianeberrichi89@gmail.com')
   OR lower(COALESCE(rsi_handle, '')) = lower('DarksideReser');
