-- Fix profile visibility for store timelines
-- Run this in the Supabase SQL editor.
--
-- Purpose:
-- 1. Backfill missing public.users rows from auth.users.
-- 2. Allow users to read profiles for members who belong to the same store.
-- 3. Keep public_profiles limited to non-sensitive display fields.

BEGIN;

INSERT INTO public.users (
  id,
  email,
  username,
  display_name,
  created_at,
  updated_at
)
SELECT
  au.id,
  COALESCE(au.email, ''),
  LEFT(
    COALESCE(
      NULLIF(
        REGEXP_REPLACE(
          LOWER(COALESCE(au.raw_user_meta_data->>'username', SPLIT_PART(COALESCE(au.email, ''), '@', 1), 'user')),
          '[^a-z0-9_]',
          '',
          'g'
        ),
        ''
      ),
      'user'
    ),
    40
  ) || '_' || SUBSTRING(au.id::text, 1, 8),
  COALESCE(
    NULLIF(au.raw_user_meta_data->>'display_name', ''),
    NULLIF(au.raw_user_meta_data->>'name', ''),
    NULLIF(SPLIT_PART(COALESCE(au.email, ''), '@', 1), ''),
    'ユーザー'
  ),
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users u
  WHERE u.id = au.id
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Store members can view store member profiles" ON public.users;

CREATE POLICY "Store members can view store member profiles" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.store_members viewer
      JOIN public.store_members target
        ON target.store_id = viewer.store_id
      WHERE viewer.user_id = auth.uid()
        AND target.user_id = users.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.store_members viewer
      JOIN public.posts p
        ON p.store_id = viewer.store_id
      WHERE viewer.user_id = auth.uid()
        AND p.user_id = users.id
    )
  );

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
