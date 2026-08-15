-- Fetch all members for a store with display profiles.
-- Run this in the Supabase SQL editor.
--
-- The function is SECURITY DEFINER so clients can list every member of a store
-- they already belong to, even when store_members RLS only exposes the caller's
-- own row.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_store_members_with_profiles(p_store_id uuid)
RETURNS TABLE (
  user_id uuid,
  role text,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sm.user_id,
    sm.role,
    COALESCE(u.username, '') AS username,
    COALESCE(u.display_name, 'ユーザー') AS display_name,
    u.avatar_url,
    sm.created_at
  FROM public.store_members sm
  LEFT JOIN public.users u ON u.id = sm.user_id
  WHERE sm.store_id = p_store_id
    AND EXISTS (
      SELECT 1
      FROM public.store_members viewer
      WHERE viewer.store_id = sm.store_id
        AND viewer.user_id = auth.uid()
    )
  ORDER BY
    CASE
      WHEN sm.role = 'owner' THEN 0
      WHEN sm.role = 'admin' THEN 1
      ELSE 2
    END,
    sm.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_store_members_with_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_members_with_profiles(uuid) TO authenticated;

COMMIT;
