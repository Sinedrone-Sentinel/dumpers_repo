-- =============================================================================
-- 190: Optional encrypted Gemini key for Smart Cracker Advisor
-- =============================================================================
-- Ciphertext only. Members never SELECT this table. Edge encrypts with
-- MINING_ADVISOR_WRAP_KEY and writes via service_role. Authenticated may only
-- ask "do I have one?" or delete their own row.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mining_advisor_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mining_advisor_secrets IS
  'AES-GCM wrapped Gemini keys for Smart Cracker Advisor. Ciphertext only; no client read.';

ALTER TABLE public.mining_advisor_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mining_advisor_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.mining_advisor_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.mining_advisor_has_saved_key()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mining_advisor_secrets
    WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.mining_advisor_has_saved_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mining_advisor_has_saved_key() TO authenticated;

CREATE OR REPLACE FUNCTION public.mining_advisor_delete_saved_key()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.mining_advisor_secrets WHERE user_id = auth.uid();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mining_advisor_delete_saved_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mining_advisor_delete_saved_key() TO authenticated;
