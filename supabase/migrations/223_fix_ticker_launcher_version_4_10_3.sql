-- Patch-day digests were ingested with a wrong public label invented from
-- build_manifest Branch/Version (4.10.0). RSI Launcher shows 4.10.3-live.13165946.

UPDATE public.whats_new_entries
SET
  headline = replace(headline, ' in 4.10.0', ' in 4.10.3'),
  version = CASE
    WHEN version = '4.10.0-live.13165946' THEN '4.10.3-live.13165946'
    ELSE version
  END
WHERE version = '4.10.0-live.13165946'
   OR headline LIKE '% in 4.10.0%';
