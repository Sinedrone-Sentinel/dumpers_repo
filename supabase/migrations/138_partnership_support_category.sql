-- =============================================================================
-- 138: Add support_ticket_category for partnership applications
-- =============================================================================
-- Must commit before 139 uses the new enum label (Postgres rule).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'support_ticket_category'
      AND e.enumlabel = 'partnership_application'
  ) THEN
    ALTER TYPE public.support_ticket_category ADD VALUE 'partnership_application';
  END IF;
END $$;
