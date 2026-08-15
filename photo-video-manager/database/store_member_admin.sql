-- Store member administration helpers.
-- Run this in the Supabase SQL editor after database/store_phase1.sql.

BEGIN;

ALTER TABLE public.store_members
  DROP CONSTRAINT IF EXISTS store_members_role_check;

ALTER TABLE public.store_members
  ADD CONSTRAINT store_members_role_check
  CHECK (role IN ('owner', 'admin', 'staff'));

-- Allow store members to list every member in their own stores.
-- Without this, the original RLS policy only exposes auth.uid()'s own
-- store_members row, so staff management screens can show only the owner.
CREATE OR REPLACE FUNCTION public.get_my_store_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT store_id
  FROM public.store_members
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_store_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_store_ids() TO authenticated;

DROP POLICY IF EXISTS "Users can view own store memberships" ON public.store_members;
DROP POLICY IF EXISTS "Store members can view all store memberships" ON public.store_members;

CREATE POLICY "Store members can view all store memberships" ON public.store_members
  FOR SELECT
  TO authenticated
  USING (store_id IN (SELECT public.get_my_store_ids()));

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

CREATE OR REPLACE FUNCTION public.store_admin_set_member_role(
  p_store_id uuid,
  p_target_user_id uuid,
  p_role text
)
RETURNS public.store_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.store_members;
  v_updated public.store_members;
  v_owner_count integer;
  v_next_owner_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_role NOT IN ('owner', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
  END IF;

  SELECT sm.role
  INTO v_actor_role
  FROM public.store_members sm
  WHERE sm.store_id = p_store_id
    AND sm.user_id = v_actor_id
  LIMIT 1;

  IF v_actor_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only store owners can change member roles' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_target
  FROM public.store_members
  WHERE store_id = p_store_id
    AND user_id = p_target_user_id
  LIMIT 1;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Store member was not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_target_user_id = v_actor_id AND p_role <> 'owner' THEN
    RAISE EXCEPTION 'You cannot remove your own owner role' USING ERRCODE = '42501';
  END IF;

  IF v_target.role = 'owner' AND p_role <> 'owner' THEN
    SELECT COUNT(*)
    INTO v_owner_count
    FROM public.store_members
    WHERE store_id = p_store_id
      AND role = 'owner';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'At least one owner is required' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.store_members
  SET role = p_role
  WHERE id = v_target.id
  RETURNING * INTO v_updated;

  IF v_target.role = 'owner' AND p_role <> 'owner' THEN
    SELECT user_id
    INTO v_next_owner_id
    FROM public.store_members
    WHERE store_id = p_store_id
      AND role = 'owner'
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE public.stores
    SET owner_id = COALESCE(v_next_owner_id, owner_id)
    WHERE id = p_store_id
      AND owner_id = p_target_user_id;
  END IF;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_admin_remove_member(
  p_store_id uuid,
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.store_members;
  v_owner_count integer;
  v_next_owner_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_target_user_id = v_actor_id THEN
    RAISE EXCEPTION 'You cannot remove yourself' USING ERRCODE = '42501';
  END IF;

  SELECT sm.role
  INTO v_actor_role
  FROM public.store_members sm
  WHERE sm.store_id = p_store_id
    AND sm.user_id = v_actor_id
  LIMIT 1;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only store owners and admins can manage members' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_target
  FROM public.store_members
  WHERE store_id = p_store_id
    AND user_id = p_target_user_id
  LIMIT 1;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Store member was not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_role = 'admin' AND v_target.role <> 'staff' THEN
    RAISE EXCEPTION 'Only store owners can remove owners or admins' USING ERRCODE = '42501';
  END IF;

  IF v_target.role = 'owner' THEN
    SELECT COUNT(*)
    INTO v_owner_count
    FROM public.store_members
    WHERE store_id = p_store_id
      AND role = 'owner';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'At least one owner is required' USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM public.store_members
  WHERE id = v_target.id;

  IF v_target.role = 'owner' THEN
    SELECT user_id
    INTO v_next_owner_id
    FROM public.store_members
    WHERE store_id = p_store_id
      AND role = 'owner'
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE public.stores
    SET owner_id = COALESCE(v_next_owner_id, owner_id)
    WHERE id = p_store_id
      AND owner_id = p_target_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_owner_update_store_name(
  p_store_id uuid,
  p_store_name text
)
RETURNS public.stores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_store public.stores;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NULLIF(trim(p_store_name), '') IS NULL THEN
    RAISE EXCEPTION 'Store name is required' USING ERRCODE = '22023';
  END IF;

  SELECT sm.role
  INTO v_actor_role
  FROM public.store_members sm
  WHERE sm.store_id = p_store_id
    AND sm.user_id = v_actor_id
  LIMIT 1;

  IF v_actor_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only store owners can update store name' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stores
  SET name = trim(p_store_name)
  WHERE id = p_store_id
  RETURNING * INTO v_store;

  IF v_store.id IS NULL THEN
    RAISE EXCEPTION 'Store was not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_store;
END;
$$;

REVOKE ALL ON FUNCTION public.store_admin_set_member_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_admin_remove_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_owner_update_store_name(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_admin_set_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_admin_remove_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_owner_update_store_name(uuid, text) TO authenticated;

COMMIT;
