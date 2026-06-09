-- Reject profile creation for banned auth users (run after 001_banned_users.sql)
-- If you already have a handle_new_user trigger, merge this guard into it.
-- Dashboard → Database → Triggers → handle_new_user

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.banned_users WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'This account has been banned';
  END IF;

  IF EXISTS (SELECT 1 FROM public.banned_users WHERE email IS NOT NULL AND email = NEW.email) THEN
    RAISE EXCEPTION 'This email has been banned';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'pending'
  );

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (safe to re-run; drops only if you uncomment below)
 DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
 CREATE TRIGGER on_auth_user_created
   AFTER INSERT ON auth.users
   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
