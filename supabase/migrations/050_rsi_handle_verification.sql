-- RSI Handle Verification System
-- Allows users to verify their RSI Handle by checking against robertsspaceindustries.com

-- Add verification columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rsi_handle_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rsi_handle_verified_at timestamptz;

-- Create unique partial index to ensure only one user can have a verified handle
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_verified_rsi_handle 
  ON public.profiles (lower(rsi_handle)) 
  WHERE rsi_handle_verified = true AND rsi_handle IS NOT NULL;

-- Function to check if an RSI handle is already verified by someone else
CREATE OR REPLACE FUNCTION public.is_rsi_handle_available(p_handle text, p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.profiles
  WHERE lower(rsi_handle) = lower(p_handle)
    AND rsi_handle_verified = true;
  
  -- If no one has it verified, it's available
  IF v_existing_id IS NULL THEN
    RETURN true;
  END IF;
  
  -- If the current user already has it verified, it's available (for re-validation)
  IF p_user_id IS NOT NULL AND v_existing_id = p_user_id THEN
    RETURN true;
  END IF;
  
  -- Someone else has it verified
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_rsi_handle_available(text, uuid) TO authenticated;

-- Function to mark RSI handle as verified (called by Edge Function after validation)
CREATE OR REPLACE FUNCTION public.mark_rsi_handle_verified(p_user_id uuid, p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First check if handle is available
  IF NOT is_rsi_handle_available(p_handle, p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'RSI Handle is already verified by another user');
  END IF;
  
  -- Update the profile
  UPDATE public.profiles
  SET 
    rsi_handle = p_handle,
    rsi_handle_verified = true,
    rsi_handle_verified_at = now(),
    updated_at = now()
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to service role (Edge Function) - service_role has full access but explicit grant ensures compatibility
GRANT EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_rsi_handle_verified(uuid, text) TO authenticated;

-- Function for super-admins to remove verification from a handle
CREATE OR REPLACE FUNCTION public.remove_rsi_verification(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_display_name text;
BEGIN
  -- Only super-admins can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super-admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Super-admin access required');
  END IF;
  
  -- Find the profile with this verified handle
  SELECT id, display_name INTO v_profile_id, v_display_name
  FROM public.profiles
  WHERE lower(rsi_handle) = lower(p_handle)
    AND rsi_handle_verified = true;
  
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No verified user found with that RSI Handle');
  END IF;
  
  -- Remove verification
  UPDATE public.profiles
  SET 
    rsi_handle_verified = false,
    rsi_handle_verified_at = NULL,
    updated_at = now()
  WHERE id = v_profile_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'profile_id', v_profile_id,
    'display_name', v_display_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_rsi_verification(text) TO authenticated;

-- Function for super-admins to remove verification AND ban
CREATE OR REPLACE FUNCTION public.remove_rsi_verification_and_ban(p_handle text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_display_name text;
  v_email text;
  v_avatar_url text;
  v_rsi_handle text;
BEGIN
  -- Only super-admins can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super-admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Super-admin access required');
  END IF;
  
  -- Find the profile with this verified handle
  SELECT id, display_name, email, avatar_url, rsi_handle 
  INTO v_profile_id, v_display_name, v_email, v_avatar_url, v_rsi_handle
  FROM public.profiles
  WHERE lower(rsi_handle) = lower(p_handle)
    AND rsi_handle_verified = true;
  
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No verified user found with that RSI Handle');
  END IF;
  
  -- Don't allow banning super-admins
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_profile_id AND role = 'super-admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot ban a super-admin');
  END IF;
  
  -- Insert into banned_users
  INSERT INTO public.banned_users (id, email, display_name, avatar_url, rsi_handle, reason, banned_by)
  VALUES (v_profile_id, v_email, v_display_name, v_avatar_url, v_rsi_handle, p_reason, auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    reason = EXCLUDED.reason,
    banned_at = now(),
    banned_by = auth.uid();
  
  -- Delete their profile (this cascades to their data)
  DELETE FROM public.profiles WHERE id = v_profile_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'banned_user', v_display_name,
    'profile_id', v_profile_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_rsi_verification_and_ban(text, text) TO authenticated;
