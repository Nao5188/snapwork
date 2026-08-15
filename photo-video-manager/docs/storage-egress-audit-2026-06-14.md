# Supabase Storage Egress Audit

Date: 2026-06-14

## Measured state

- Database: 21 posts, 16 post media rows, 141 media library rows, 25 users
- `posts` bucket before cleanup: 131 files, 633.58 MB
- Referenced post originals: 30 files, 273.57 MB
- Referenced videos: 7 files, 151.71 MB
- Orphaned post files removed: 101 files, 360.01 MB
- Orphaned avatars removed: 3 files, 1.28 MB
- `posts` bucket after cleanup: 30 files, 273.57 MB
- Existing thumbnail coverage: 0/30
- Existing files with explicit one-year cache metadata: 0
- `posts` and `avatars` buckets are public

## Primary egress causes

1. Feed and grid screens previously loaded full-resolution originals.
2. Video thumbnails were generated on devices from the original video URL.
3. Referenced videos total 151.71 MB, including files up to 42.46 MB.
4. Referenced photos include originals up to 17.19 MB.
5. Existing files have no explicit long-lived cache metadata.
6. Public bucket URLs can be accessed without authorization if a URL is known.

## Implemented changes

- Default video capture changed from 4K to HD; 4K remains selectable.
- Original photos and videos remain unchanged for storage and download.
- New uploads create a 720 px JPEG thumbnail.
- Feed, profile, history, and admin grids prefer thumbnails.
- Existing videos no longer download automatically to create list thumbnails.
- New originals, thumbnails, and avatars use one-year cache metadata.
- New avatars are resized to 1024 px before upload.
- Image components use memory and disk caching where applicable.
- Post deletion now removes originals and thumbnails from Storage.
- Post editing removes media files that are no longer referenced.
- Failed uploads no longer save local device paths into the database.
- Unnecessary drawer avatar prefetching was removed.
- A reusable read-only Storage audit command was added:
  `npm run audit:storage`

## Remaining actions

1. Upgrade to Pro and enable `Storage > Settings > Image Transformations`.
2. Generate the 23 missing existing photo thumbnails:
   `npm run migrate:photo-thumbnails -- --write`
3. Existing seven videos intentionally show a placeholder in lists until they are
   edited or a server-side video thumbnail migration is run.
4. Consider migrating `posts` from a public bucket to a private bucket with
   short-lived signed URLs. This is a separate schema and URL migration.
5. Review Supabase Storage logs after deployment to confirm which object URLs
   account for the remaining egress.

The attempted image transformation migration returned HTTP 403 for all
candidates, so no existing thumbnails were created. This indicates that the
project is not yet on an eligible plan or Image Transformations is disabled.
