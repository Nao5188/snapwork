-- Helper functions for private Supabase Storage access.
--
-- Run this in the Supabase SQL Editor before adding Storage policies from the
-- Dashboard UI. This file does not create policies on storage.objects.

BEGIN;

CREATE OR REPLACE FUNCTION public.storage_path_from_url(
  p_bucket text,
  p_url text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_prefix text;
  v_prefixes text[] := ARRAY[
    '/storage/v1/object/public/' || p_bucket || '/',
    '/storage/v1/object/sign/' || p_bucket || '/',
    '/storage/v1/object/authenticated/' || p_bucket || '/'
  ];
  v_index integer;
  v_path text;
BEGIN
  IF p_url IS NULL OR btrim(p_url) = '' THEN
    RETURN NULL;
  END IF;

  IF p_url LIKE 'file://%' OR p_url LIKE 'content://%' OR p_url LIKE 'data:%' THEN
    RETURN NULL;
  END IF;

  FOREACH v_prefix IN ARRAY v_prefixes LOOP
    v_index := strpos(p_url, v_prefix);
    IF v_index > 0 THEN
      v_path := substring(p_url from v_index + length(v_prefix));
      v_path := split_part(v_path, '?', 1);
      v_path := split_part(v_path, '#', 1);
      RETURN nullif(v_path, '');
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_thumbnail_path(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_path IS NULL OR p_path = '' THEN NULL
    WHEN p_path ~ '\.[^/]+$' THEN regexp_replace(p_path, '\.[^/.]+$', '_thumb.jpg')
    ELSE p_path || '_thumb.jpg'
  END;
$$;

CREATE OR REPLACE FUNCTION public.storage_url_matches_object(
  p_bucket text,
  p_url text,
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_object_name IS NOT NULL
    AND (
      p_object_name = public.storage_path_from_url(p_bucket, p_url)
      OR p_object_name = public.storage_thumbnail_path(public.storage_path_from_url(p_bucket, p_url))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_post_storage_object(p_object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_object_name IS NOT NULL
    AND (
      split_part(p_object_name, '/', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.posts p
        JOIN public.store_members sm
          ON sm.store_id = p.store_id
         AND sm.user_id = auth.uid()
        WHERE public.storage_url_matches_object('posts', p.media_url, p_object_name)
      )
      OR EXISTS (
        SELECT 1
        FROM public.post_media pm
        JOIN public.posts p ON p.id = pm.post_id
        JOIN public.store_members sm
          ON sm.store_id = p.store_id
         AND sm.user_id = auth.uid()
        WHERE public.storage_url_matches_object('posts', pm.media_url, p_object_name)
      )
      OR EXISTS (
        SELECT 1
        FROM public.posts p
        JOIN public.store_members sm
          ON sm.store_id = p.store_id
         AND sm.user_id = auth.uid()
        WHERE strpos(coalesce(p.menu_name, ''), p_object_name) > 0
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_avatar_storage_object(p_object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_object_name IS NOT NULL
    AND (
      split_part(p_object_name, '/', 1) = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.users u
        WHERE public.storage_url_matches_object('avatars', u.avatar_url, p_object_name)
          AND (
            u.id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.store_members viewer
              JOIN public.store_members target
                ON target.store_id = viewer.store_id
              WHERE viewer.user_id = auth.uid()
                AND target.user_id = u.id
            )
            OR EXISTS (
              SELECT 1
              FROM public.store_members viewer
              JOIN public.posts p
                ON p.store_id = viewer.store_id
              WHERE viewer.user_id = auth.uid()
                AND p.user_id = u.id
            )
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.storage_path_from_url(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_thumbnail_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_url_matches_object(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_post_storage_object(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_avatar_storage_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_path_from_url(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_thumbnail_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_url_matches_object(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_post_storage_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_avatar_storage_object(text) TO authenticated;

COMMIT;
