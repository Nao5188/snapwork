-- Filter search review workflow.
-- Run this in the Supabase SQL editor before using admin status changes.

BEGIN;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_review_status_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'revision_requested', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_posts_store_review_status
  ON public.posts(store_id, review_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_post_review_status(
  p_post_ids uuid[],
  p_status text
)
RETURNS TABLE(post_id uuid, review_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_count integer;
  found_count integer;
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'revision_requested', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_post_ids IS NULL OR array_length(p_post_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT ids.id)
  INTO requested_count
  FROM unnest(p_post_ids) AS ids(id);

  SELECT count(*)
  INTO found_count
  FROM public.posts p
  WHERE p.id = ANY(p_post_ids);

  IF requested_count <> found_count THEN
    RAISE EXCEPTION 'Some posts were not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = ANY(p_post_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.store_members sm
        WHERE sm.store_id = p.store_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'owner'
      )
  ) THEN
    RAISE EXCEPTION 'Only store owners can change review status'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.posts p
  SET review_status = p_status,
      updated_at = now()
  WHERE p.id = ANY(p_post_ids)
  RETURNING p.id, p.review_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_post_review_status(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_post_review_status(uuid[], text) TO authenticated;

COMMIT;
