-- SnapWork Phase2: separate posts by store
-- Run this in the Supabase SQL editor after database/store_phase1.sql.

BEGIN;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id);

CREATE INDEX IF NOT EXISTS idx_posts_store_id ON public.posts(store_id);
CREATE INDEX IF NOT EXISTS idx_posts_store_created_at ON public.posts(store_id, created_at DESC);

-- Existing posts are attached to the first store membership for their author.
-- Posts whose authors do not belong to a store remain store_id = NULL and are hidden by the new policies.
WITH first_membership AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    store_id
  FROM public.store_members
  ORDER BY user_id, created_at ASC
)
UPDATE public.posts p
SET store_id = fm.store_id
FROM first_membership fm
WHERE p.user_id = fm.user_id
  AND p.store_id IS NULL;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all posts" ON public.posts;
DROP POLICY IF EXISTS "Users can insert own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
DROP POLICY IF EXISTS "Store members can view store posts" ON public.posts;
DROP POLICY IF EXISTS "Store members can insert own store posts" ON public.posts;
DROP POLICY IF EXISTS "Post owners can update own store posts" ON public.posts;
DROP POLICY IF EXISTS "Post owners can delete own store posts" ON public.posts;

CREATE POLICY "Store members can view store posts" ON public.posts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.store_members sm
      WHERE sm.store_id = posts.store_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Store members can insert own store posts" ON public.posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.store_members sm
      WHERE sm.store_id = posts.store_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Post owners can update own store posts" ON public.posts
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.store_members sm
      WHERE sm.store_id = posts.store_id
        AND sm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.store_members sm
      WHERE sm.store_id = posts.store_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Post owners can delete own store posts" ON public.posts
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.store_members sm
      WHERE sm.store_id = posts.store_id
        AND sm.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF to_regclass('public.post_media') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Users can view all post media" ON public.post_media';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert own post media" ON public.post_media';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update own post media" ON public.post_media';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own post media" ON public.post_media';
    EXECUTE 'DROP POLICY IF EXISTS "Store members can view store post media" ON public.post_media';
    EXECUTE 'DROP POLICY IF EXISTS "Post owners can insert own store post media" ON public.post_media';
    EXECUTE 'DROP POLICY IF EXISTS "Post owners can update own store post media" ON public.post_media';
    EXECUTE 'DROP POLICY IF EXISTS "Post owners can delete own store post media" ON public.post_media';

    EXECUTE $policy$
      CREATE POLICY "Store members can view store post media" ON public.post_media
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.posts p
            JOIN public.store_members sm ON sm.store_id = p.store_id
            WHERE p.id = post_media.post_id
              AND sm.user_id = auth.uid()
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "Post owners can insert own store post media" ON public.post_media
        FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.posts p
            JOIN public.store_members sm ON sm.store_id = p.store_id
            WHERE p.id = post_media.post_id
              AND p.user_id = auth.uid()
              AND sm.user_id = auth.uid()
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "Post owners can update own store post media" ON public.post_media
        FOR UPDATE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.posts p
            JOIN public.store_members sm ON sm.store_id = p.store_id
            WHERE p.id = post_media.post_id
              AND p.user_id = auth.uid()
              AND sm.user_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.posts p
            JOIN public.store_members sm ON sm.store_id = p.store_id
            WHERE p.id = post_media.post_id
              AND p.user_id = auth.uid()
              AND sm.user_id = auth.uid()
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "Post owners can delete own store post media" ON public.post_media
        FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.posts p
            JOIN public.store_members sm ON sm.store_id = p.store_id
            WHERE p.id = post_media.post_id
              AND p.user_id = auth.uid()
              AND sm.user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;

COMMIT;
