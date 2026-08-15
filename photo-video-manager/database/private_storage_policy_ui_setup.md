# Private Storage Policies

Use this when the SQL Editor cannot create policies on `storage.objects` with
`must be owner of table objects` or `permission denied to set role
"supabase_storage_admin"`.

## Before Adding Policies

1. Run `database/private_storage_helpers.sql` in the Supabase SQL Editor.
2. Go to Supabase Dashboard > Storage > Policies.
3. Add the policies below on the `objects` table.
4. After policies are saved, make the `posts` and `avatars` buckets private
   from Storage bucket settings.

## posts Bucket

Policy name: `SnapWork store members can read post objects`

Operation: `SELECT`

Target roles: `authenticated`

USING:

```sql
bucket_id = 'posts'
AND public.can_access_post_storage_object(name)
```

Policy name: `SnapWork users can upload own post objects`

Operation: `INSERT`

Target roles: `authenticated`

WITH CHECK:

```sql
bucket_id = 'posts'
AND split_part(name, '/', 1) = auth.uid()::text
```

Policy name: `SnapWork users can update own post objects`

Operation: `UPDATE`

Target roles: `authenticated`

USING and WITH CHECK:

```sql
bucket_id = 'posts'
AND split_part(name, '/', 1) = auth.uid()::text
```

Policy name: `SnapWork users can delete own post objects`

Operation: `DELETE`

Target roles: `authenticated`

USING:

```sql
bucket_id = 'posts'
AND split_part(name, '/', 1) = auth.uid()::text
```

## avatars Bucket

Policy name: `SnapWork store members can read avatar objects`

Operation: `SELECT`

Target roles: `authenticated`

USING:

```sql
bucket_id = 'avatars'
AND public.can_access_avatar_storage_object(name)
```

Policy name: `SnapWork users can upload own avatar objects`

Operation: `INSERT`

Target roles: `authenticated`

WITH CHECK:

```sql
bucket_id = 'avatars'
AND split_part(name, '/', 1) = auth.uid()::text
```

Policy name: `SnapWork users can update own avatar objects`

Operation: `UPDATE`

Target roles: `authenticated`

USING and WITH CHECK:

```sql
bucket_id = 'avatars'
AND split_part(name, '/', 1) = auth.uid()::text
```

Policy name: `SnapWork users can delete own avatar objects`

Operation: `DELETE`

Target roles: `authenticated`

USING:

```sql
bucket_id = 'avatars'
AND split_part(name, '/', 1) = auth.uid()::text
```

## Verification

After both buckets are private, confirm that:

- Existing post images, videos, thumbnails, and avatars still display.
- Uploading a new post still works.
- Updating an avatar still works.
- A public `/storage/v1/object/public/posts/...` URL no longer opens directly.

Emergency rollback:

```sql
UPDATE storage.buckets
SET public = true
WHERE id IN ('posts', 'avatars');
```
