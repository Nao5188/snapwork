-- Restrict additional store creation to users who already own at least one store.
-- Run this in the Supabase SQL editor after database/store_phase1.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_store_with_owner(
  p_store_name text,
  p_invite_code text
)
RETURNS public.stores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store public.stores;
  v_membership_count integer;
  v_owner_membership_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NULLIF(trim(p_store_name), '') IS NULL THEN
    RAISE EXCEPTION 'Store name is required' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(trim(p_invite_code), '') IS NULL THEN
    RAISE EXCEPTION 'Invite code is required' USING ERRCODE = '22023';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE role = 'owner')
  INTO v_membership_count, v_owner_membership_count
  FROM public.store_members
  WHERE user_id = v_user_id;

  IF v_membership_count > 0 AND v_owner_membership_count = 0 THEN
    RAISE EXCEPTION 'Only store owners can create additional stores' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stores (name, invite_code, owner_id)
  VALUES (trim(p_store_name), upper(trim(p_invite_code)), v_user_id)
  RETURNING * INTO v_store;

  INSERT INTO public.store_members (store_id, user_id, role)
  VALUES (v_store.id, v_user_id, 'owner')
  ON CONFLICT (store_id, user_id) DO UPDATE
    SET role = 'owner';

  RETURN v_store;
END;
$$;

REVOKE ALL ON FUNCTION public.create_store_with_owner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_store_with_owner(text, text) TO authenticated;

COMMIT;
