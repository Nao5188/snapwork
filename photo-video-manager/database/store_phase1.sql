-- SnapWork Phase1: stores and store memberships
-- Run this in the Supabase SQL editor after the existing base schema.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text UNIQUE NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, user_id)
);

ALTER TABLE public.store_members
  DROP CONSTRAINT IF EXISTS store_members_role_check;

ALTER TABLE public.store_members
  ADD CONSTRAINT store_members_role_check
  CHECK (role IN ('owner', 'admin', 'staff'));

CREATE INDEX IF NOT EXISTS idx_stores_invite_code ON public.stores(invite_code);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON public.stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_store_members_store_id ON public.store_members(store_id);
CREATE INDEX IF NOT EXISTS idx_store_members_user_id ON public.store_members(user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;
CREATE TRIGGER update_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store members can view stores" ON public.stores;
CREATE POLICY "Store members can view stores" ON public.stores
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.store_members sm
      WHERE sm.store_id = stores.id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Store owners can update own stores" ON public.stores;
CREATE POLICY "Store owners can update own stores" ON public.stores
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own store memberships" ON public.store_members;
CREATE POLICY "Users can view own store memberships" ON public.store_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

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

CREATE OR REPLACE FUNCTION public.join_store_by_invite_code(
  p_invite_code text
)
RETURNS public.store_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_member public.store_members;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT id
  INTO v_store_id
  FROM public.stores
  WHERE invite_code = upper(trim(p_invite_code))
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.store_members (store_id, user_id, role)
  VALUES (v_store_id, v_user_id, 'staff')
  ON CONFLICT (store_id, user_id) DO NOTHING
  RETURNING * INTO v_member;

  IF v_member.id IS NULL THEN
    SELECT *
    INTO v_member
    FROM public.store_members
    WHERE store_id = v_store_id
      AND user_id = v_user_id
    LIMIT 1;
  END IF;

  RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION public.create_store_with_owner(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_store_by_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_store_with_owner(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_store_by_invite_code(text) TO authenticated;

COMMIT;
