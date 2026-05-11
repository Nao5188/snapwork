-- Remediation for the legacy create_user_profile helper.
--
-- The previous version was SECURITY DEFINER and granted EXECUTE to anon.
-- That let clients attempt to bypass RLS and create rows in public.users.
-- User profile creation is handled by auto_create_user_profile_trigger.sql,
-- so this helper should not exist in production.

DROP FUNCTION IF EXISTS public.create_user_profile(uuid, text, text, text);
