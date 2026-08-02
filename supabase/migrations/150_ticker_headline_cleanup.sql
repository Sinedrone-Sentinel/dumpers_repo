-- Short public ticker titles; detail stays in items[].
-- Strip legacy "SITE UPDATE:" prefixes; drop over-detailed site rows.

-- Remove implementation-heavy site announcements (public ticker is offline-visible).
DELETE FROM public.whats_new_entries
WHERE kind = 'site'
  AND (
    headline ILIKE '%full history%'
    OR headline ILIKE '%catch-up%'
    OR headline ILIKE '%stronger%verification%'
    OR headline ILIKE '%RSI Handle verification%'
    OR issue_key ILIKE '%full-history%'
    OR issue_key ILIKE '%catch-up%'
    OR issue_key ILIKE '%rsi%verif%'
  );

-- Strip legacy type prefixes from titles (badges carry the type in the UI).
UPDATE public.whats_new_entries
SET headline = regexp_replace(
  headline,
  '^(SITE UPDATE|GAME UPDATE|QUESTIONNAIRE|DUMPER APPS|POLL RESULTS)\s*:\s*',
  '',
  'i'
)
WHERE headline ~* '^(SITE UPDATE|GAME UPDATE|QUESTIONNAIRE|DUMPER APPS|POLL RESULTS)\s*:';

-- Short titles for the two site announcements from 149 (verbose copy stays in items).
UPDATE public.whats_new_entries
SET
  headline = 'Dumper Apps auto-update',
  category = 'Dumper Apps',
  items = jsonb_build_array(
    jsonb_build_object(
      'key', 'auto-update',
      'label', 'Keep App Up to Date',
      'summary',
      'Leave this on (default Yes). When a newer Dumper Apps build is available, the app can download it and restart for you.'
    ),
    jsonb_build_object(
      'key', 'manual',
      'label', 'Need the latest copy?',
      'summary',
      'Download the Windows portable exe from Mission Tracker → BP Dumper if you are still on an older build.'
    )
  )
WHERE issue_key = 'site:dumper-apps-auto-update';

UPDATE public.whats_new_entries
SET
  headline = 'Avatar menu layout',
  category = 'Site',
  items = jsonb_build_array(
    jsonb_build_object(
      'key', 'account',
      'label', 'Account',
      'summary',
      'Settings, Dumper Apps, Webhooks, and Partnership (when verified) stay together.'
    ),
    jsonb_build_object(
      'key', 'help',
      'label', 'Help',
      'summary',
      'Support is under Help for members and officers.'
    ),
    jsonb_build_object(
      'key', 'roles',
      'label', 'Role sections',
      'summary',
      'Officer and Site admin tools appear in their own sections when your role includes them.'
    )
  )
WHERE issue_key = 'site:avatar-menu-layout';

-- Re-run TTL cleanup
SELECT public.cleanup_expired_whats_new();
