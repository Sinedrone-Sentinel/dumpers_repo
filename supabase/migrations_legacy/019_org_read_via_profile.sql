-- Allow members to read their org via profiles.org_id (fixes org load before membership row exists)
-- Run in Supabase SQL Editor after 018_dumpers_default_membership.sql

DROP POLICY IF EXISTS "organizations_read_via_profile" ON public.organizations;
CREATE POLICY "organizations_read_via_profile"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.org_id = organizations.id
    )
  );

-- Repair: anyone with org_id on profile but missing membership row
INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at, verified_at)
SELECT p.org_id, p.id, 'member', COALESCE(p.approved_at, p.created_at, now()), now()
FROM public.profiles p
JOIN public.organizations o ON o.id = p.org_id
WHERE p.org_id IS NOT NULL
ON CONFLICT (org_id, user_id) DO UPDATE
SET verified_at = CASE
  WHEN public.is_dumpers_org(public.org_memberships.org_id) THEN
    COALESCE(public.org_memberships.verified_at, now())
  ELSE public.org_memberships.verified_at
END;
