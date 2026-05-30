-- Secure public_profiles view
-- Run this in the Supabase SQL editor.
--
-- Supabase warns when a public-schema view is available through the API as a
-- security definer view. This recreates the profile view with security_invoker
-- so it respects the RLS policies on public.users, and exposes it only to
-- authenticated users.

BEGIN;

DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT
  id,
  username,
  display_name,
  avatar_url
FROM public.users;

REVOKE ALL ON public.public_profiles FROM PUBLIC;
REVOKE ALL ON public.public_profiles FROM anon;
REVOKE ALL ON public.public_profiles FROM authenticated;
GRANT SELECT ON public.public_profiles TO authenticated;

COMMIT;
