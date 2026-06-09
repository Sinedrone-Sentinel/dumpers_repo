-- Organizations, memberships, and ownership audit (Phase 0 — multi-org-ready schema)
-- Run in Supabase SQL Editor after 009_profiles_settings.sql

-- =============================================================================
-- Enums
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'officer', 'member');
  END IF;
END $$;

-- =============================================================================
-- Organizations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  rsi_org_sid text,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON public.organizations (slug);

-- =============================================================================
-- Memberships
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_role public.org_role NOT NULL DEFAULT 'member',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS org_memberships_one_owner_per_org
  ON public.org_memberships (org_id)
  WHERE org_role = 'owner';

CREATE INDEX IF NOT EXISTS org_memberships_user_idx
  ON public.org_memberships (user_id);

-- =============================================================================
-- Ownership transfer audit
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  initiated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  transferred_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Profile org link
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_org_id_idx
  ON public.profiles (org_id)
  WHERE org_id IS NOT NULL;

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_org_role(p_user_id uuid, p_org_id uuid)
RETURNS public.org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_role
  FROM public.org_memberships
  WHERE user_id = p_user_id
    AND org_id = p_org_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_org_role(p_org_id uuid)
RETURNS public.org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_org_role(auth.uid(), p_org_id);
$$;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_read_members" ON public.organizations;
CREATE POLICY "organizations_read_members"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = organizations.id
        AND m.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "org_memberships_read_same_org" ON public.org_memberships;
CREATE POLICY "org_memberships_read_same_org"
  ON public.org_memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_memberships mine
      WHERE mine.org_id = org_memberships.org_id
        AND mine.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "org_ownership_transfers_read" ON public.org_ownership_transfers;
CREATE POLICY "org_ownership_transfers_read"
  ON public.org_ownership_transfers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = org_ownership_transfers.org_id
        AND m.user_id = auth.uid()
        AND m.org_role IN ('owner', 'admin')
    )
    OR public.is_super_admin()
  );

-- Writes managed via RPC / Admin in later phases; super-admin bootstrap only for now
DROP POLICY IF EXISTS "organizations_super_admin_write" ON public.organizations;
CREATE POLICY "organizations_super_admin_write"
  ON public.organizations
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "org_memberships_super_admin_write" ON public.org_memberships;
CREATE POLICY "org_memberships_super_admin_write"
  ON public.org_memberships
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =============================================================================
-- Seed v1 org + backfill existing members
-- =============================================================================

DO $$
DECLARE
  seed_org_id uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO seed_org_id
  FROM public.organizations
  WHERE slug = 'dumpers'
  LIMIT 1;

  IF seed_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug)
    VALUES ('Dumpers', 'dumpers')
    RETURNING id INTO seed_org_id;
  END IF;

  UPDATE public.profiles
  SET org_id = seed_org_id
  WHERE role <> 'pending'
    AND org_id IS NULL;

  INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at)
  SELECT seed_org_id, p.id, 'member', COALESCE(p.approved_at, p.created_at, now())
  FROM public.profiles p
  WHERE p.role <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.org_id = seed_org_id AND m.user_id = p.id
    );

  SELECT id INTO admin_id
  FROM public.profiles
  WHERE role = 'super-admin'
  ORDER BY created_at
  LIMIT 1;

  IF admin_id IS NOT NULL THEN
    UPDATE public.org_memberships
    SET org_role = 'member'
    WHERE org_id = seed_org_id
      AND org_role = 'owner'
      AND user_id <> admin_id;

    INSERT INTO public.org_memberships (org_id, user_id, org_role, joined_at)
    VALUES (seed_org_id, admin_id, 'owner', now())
    ON CONFLICT (org_id, user_id)
    DO UPDATE SET org_role = 'owner';

    UPDATE public.organizations
    SET owner_id = admin_id,
        created_by = COALESCE(created_by, admin_id)
    WHERE id = seed_org_id;
  END IF;
END $$;
