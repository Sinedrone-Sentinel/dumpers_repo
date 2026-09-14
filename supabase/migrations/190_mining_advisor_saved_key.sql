-- =============================================================================
-- 190: Optional end-to-end wrapped Gemini key for Smart Cracker Advisor
-- =============================================================================
-- The browser encrypts with a member lock phrase (PBKDF2 + AES-GCM) before
-- upload. This table stores ciphertext only. The server cannot decrypt.
-- Authenticated may store / load / delete their own blob via DEFINER RPCs.
-- No table grants. No Edge wrap secret.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mining_advisor_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mining_advisor_secrets IS
  'Client-wrapped Advisor secrets (v2 PBKDF2/AES-GCM). Server cannot decrypt.';

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

CREATE OR REPLACE FUNCTION public.mining_advisor_store_own_secret(p_ciphertext text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ct text := trim(COALESCE(p_ciphertext, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF length(v_ct) < 20 OR length(v_ct) > 4000 THEN
    RETURN false;
  END IF;
  IF v_ct NOT LIKE 'v2.%' THEN
    RETURN false;
  END IF;

  INSERT INTO public.mining_advisor_secrets (user_id, ciphertext, updated_at)
  VALUES (auth.uid(), v_ct, now())
  ON CONFLICT (user_id) DO UPDATE
  SET ciphertext = EXCLUDED.ciphertext, updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mining_advisor_store_own_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mining_advisor_store_own_secret(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mining_advisor_load_own_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ciphertext
  FROM public.mining_advisor_secrets
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.mining_advisor_load_own_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mining_advisor_load_own_secret() TO authenticated;

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
