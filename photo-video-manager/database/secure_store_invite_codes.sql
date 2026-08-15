-- Generate store invite codes on the database side.
--
-- Run this after database/store_owner_additional_store.sql and
-- database/restrict_store_invite_code.sql.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.generate_store_invite_code(p_length integer DEFAULT 12)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
VOLATILE
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_random_schema name;
  v_bytes bytea;
  v_code text := '';
  v_index integer;
BEGIN
  IF p_length < 8 OR p_length > 32 THEN
    RAISE EXCEPTION 'Invite code length must be between 8 and 32'
      USING ERRCODE = '22023';
  END IF;

  SELECT n.nspname
  INTO v_random_schema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'gen_random_bytes'
    AND p.pronargs = 1
    AND p.proargtypes[0] = 'integer'::regtype
    AND n.nspname IN ('extensions', 'pg_catalog', 'public')
  ORDER BY CASE n.nspname
    WHEN 'extensions' THEN 1
    WHEN 'pg_catalog' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_random_schema IS NULL THEN
    RAISE EXCEPTION 'pgcrypto.gen_random_bytes(integer) is not available'
      USING ERRCODE = '42883';
  END IF;

  EXECUTE format('SELECT %I.gen_random_bytes($1::integer)', v_random_schema)
  USING p_length
  INTO v_bytes;

  FOR v_index IN 0..(p_length - 1) LOOP
    v_code := v_code || substr(
      v_alphabet,
      (get_byte(v_bytes, v_index) % length(v_alphabet)) + 1,
      1
    );
  END LOOP;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_store_with_owner(p_store_name text)
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
  v_invite_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NULLIF(trim(p_store_name), '') IS NULL THEN
    RAISE EXCEPTION 'Store name is required' USING ERRCODE = '22023';
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

  FOR v_attempt IN 1..8 LOOP
    v_invite_code := public.generate_store_invite_code(12);

    BEGIN
      INSERT INTO public.stores (name, invite_code, owner_id)
      VALUES (trim(p_store_name), v_invite_code, v_user_id)
      RETURNING * INTO v_store;

      INSERT INTO public.store_members (store_id, user_id, role)
      VALUES (v_store.id, v_user_id, 'owner')
      ON CONFLICT (store_id, user_id) DO UPDATE
        SET role = 'owner';

      RETURN v_store;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Failed to generate a unique invite code'
    USING ERRCODE = '23505';
END;
$$;

-- Backward-compatible signature for app versions that still pass p_invite_code.
-- The client-provided value is intentionally ignored.
CREATE OR REPLACE FUNCTION public.create_store_with_owner(
  p_store_name text,
  p_invite_code text
)
RETURNS public.stores
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_store_with_owner(p_store_name);
$$;

CREATE OR REPLACE FUNCTION public.rotate_store_invite_code(p_store_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invite_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.store_members sm
    WHERE sm.store_id = p_store_id
      AND sm.user_id = v_user_id
      AND sm.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only store owners and admins can rotate the invite code'
      USING ERRCODE = '42501';
  END IF;

  FOR v_attempt IN 1..8 LOOP
    v_invite_code := public.generate_store_invite_code(12);

    BEGIN
      UPDATE public.stores
      SET invite_code = v_invite_code,
          updated_at = now()
      WHERE id = p_store_id;

      RETURN v_invite_code;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Failed to generate a unique invite code'
    USING ERRCODE = '23505';
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
  v_invite_code text := upper(regexp_replace(trim(coalesce(p_invite_code, '')), '\s+', '', 'g'));
  v_store_id uuid;
  v_member public.store_members;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF v_invite_code !~ '^[A-Z2-9]{8,32}$' THEN
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0001';
  END IF;

  SELECT id
  INTO v_store_id
  FROM public.stores
  WHERE invite_code = v_invite_code
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

DO $$
DECLARE
  v_store_id uuid;
  v_invite_code text;
  v_rotated boolean;
BEGIN
  FOR v_store_id IN
    SELECT id
    FROM public.stores
    WHERE length(invite_code) < 12
  LOOP
    v_rotated := false;

    FOR v_attempt IN 1..8 LOOP
      v_invite_code := public.generate_store_invite_code(12);

      BEGIN
        UPDATE public.stores
        SET invite_code = v_invite_code,
            updated_at = now()
        WHERE id = v_store_id;

        v_rotated := true;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;

    IF NOT v_rotated THEN
      RAISE EXCEPTION 'Failed to rotate invite code for store %', v_store_id
        USING ERRCODE = '23505';
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.generate_store_invite_code(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_store_with_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_store_with_owner(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_store_invite_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_store_by_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_store_with_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_with_owner(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_store_invite_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_store_by_invite_code(text) TO authenticated;

COMMIT;
