-- Fix store_members RLS: allow members to see all memberships in their stores.
--
-- Problem:
--   The original policy "Users can view own store memberships" restricts each
--   user to only seeing their own row in store_members (user_id = auth.uid()).
--   This breaks filter-search.tsx because:
--     1. Staff name chips only show the current user (not all store members).
--     2. Filtering by role='staff' returns 0 rows for owners (whose role is
--        'owner'), causing the post list to be empty.
--
-- Solution:
--   Replace the policy with one that allows all members of a store to see
--   every membership in that same store.
--   A SECURITY DEFINER helper function is used to avoid infinite recursion
--   that would occur with a self-referential RLS policy.
--
-- Run this in the Supabase SQL editor.

BEGIN;

-- Helper function: returns the store IDs the current user belongs to.
-- SECURITY DEFINER bypasses RLS so it can query store_members directly.
CREATE OR REPLACE FUNCTION public.get_my_store_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT store_id FROM public.store_members WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_store_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_store_ids() TO authenticated;

-- Replace the restrictive policy with one that allows viewing all members
-- of any store the current user belongs to.
DROP POLICY IF EXISTS "Users can view own store memberships" ON public.store_members;

CREATE POLICY "Store members can view all store memberships" ON public.store_members
  FOR SELECT
  TO authenticated
  USING (store_id IN (SELECT public.get_my_store_ids()));

COMMIT;
