-- Restrict store invite codes to store owners and admins.
-- Run this in the Supabase SQL editor after database/store_phase1.sql.

BEGIN;

-- Store members can read ordinary store details, but not the invite code.
REVOKE SELECT ON public.stores FROM authenticated;
GRANT SELECT (
  id,
  name,
  owner_id,
  created_at,
  updated_at
) ON public.stores TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_number(p_store_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_invite_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT s.invite_code
  INTO v_invite_code
  FROM public.stores s
  JOIN public.store_members sm ON sm.store_id = s.id
  WHERE s.id = p_store_id
    AND sm.user_id = auth.uid()
    AND sm.role IN ('owner', 'admin')
  LIMIT 1;

  IF v_invite_code IS NULL THEN
    RAISE EXCEPTION 'Only store owners and admins can view the invite code'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_invite_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_store_invite_code(p_store_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.get_store_number(p_store_id);
$$;

REVOKE ALL ON FUNCTION public.get_store_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_store_invite_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_store_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_store_invite_code(uuid) TO authenticated;

COMMIT;
