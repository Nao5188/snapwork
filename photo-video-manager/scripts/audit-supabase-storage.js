const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 1000;

async function listBucketFiles(bucket, prefix = '') {
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;

    const entries = data ?? [];
    for (const entry of entries) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id || entry.metadata) {
        files.push({
          path: entryPath,
          size: Number(entry.metadata?.size ?? 0),
          contentType: entry.metadata?.mimetype ?? entry.metadata?.contentType ?? '',
          cacheControl: entry.metadata?.cacheControl ?? entry.metadata?.cache_control ?? '',
          updatedAt: entry.updated_at ?? entry.created_at ?? null,
        });
      } else {
        files.push(...await listBucketFiles(bucket, entryPath));
      }
    }

    if (entries.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return files;
}

async function fetchAllRows(table, columns) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function storagePathFromUrl(bucket, value) {
  if (!value || typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];
    const marker = markers.find(candidate => url.pathname.startsWith(candidate));
    return marker ? decodeURIComponent(url.pathname.slice(marker.length)) : null;
  } catch {
    return null;
  }
}

function thumbnailPath(originalPath) {
  const extensionIndex = originalPath.lastIndexOf('.');
  const basePath = extensionIndex > originalPath.lastIndexOf('/')
    ? originalPath.slice(0, extensionIndex)
    : originalPath;
  return `${basePath}_thumb.jpg`;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function isVideoFile(file) {
  return file.contentType.startsWith('video/')
    || /\.(mov|mp4|m4v|avi|webm)$/i.test(file.path);
}

function summarizeBucket(name, files, referencedPaths, bucketInfo) {
  const filePaths = new Set(files.map(file => file.path));
  const thumbnails = files.filter(file => file.path.endsWith('_thumb.jpg'));
  const originals = files.filter(file => !file.path.endsWith('_thumb.jpg'));
  const orphaned = originals.filter(file => !referencedPaths.has(file.path));
  const orphanedThumbnails = thumbnails.filter(file => {
    const expectedOriginalPrefix = file.path.slice(0, -'_thumb.jpg'.length);
    return ![...referencedPaths].some(reference => {
      const extensionIndex = reference.lastIndexOf('.');
      return reference.slice(0, extensionIndex) === expectedOriginalPrefix;
    });
  });
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const referencedFiles = originals.filter(file => referencedPaths.has(file.path));
  const referencedBytes = referencedFiles.reduce((sum, file) => sum + file.size, 0);
  const referencedVideos = referencedFiles.filter(isVideoFile);
  const referencedPhotos = referencedFiles.filter(file => !isVideoFile(file));
  const referencedVideoBytes = referencedVideos.reduce((sum, file) => sum + file.size, 0);
  const longCachedFiles = files.filter(file => Number(file.cacheControl) >= 31536000);
  const orphanBytes = [...orphaned, ...orphanedThumbnails]
    .reduce((sum, file) => sum + file.size, 0);

  console.log(`\n[${name}]`);
  console.log(`Public bucket: ${bucketInfo?.public ? 'yes' : 'no'}`);
  console.log(`Files: ${files.length} (originals ${originals.length}, thumbnails ${thumbnails.length})`);
  console.log(`Stored size: ${formatBytes(totalBytes)}`);
  console.log(`Referenced originals: ${referencedFiles.length}/${referencedPaths.size} / ${formatBytes(referencedBytes)}`);
  console.log(
    `Referenced videos: ${referencedVideos.length} / ${formatBytes(referencedVideoBytes)}`
  );
  console.log(`One-year cache metadata: ${longCachedFiles.length}/${files.length}`);
  console.log(`Potential orphans: ${orphaned.length + orphanedThumbnails.length} / ${formatBytes(orphanBytes)}`);

  if (name === 'posts') {
    const coveredPhotos = referencedPhotos
      .filter(file => filePaths.has(thumbnailPath(file.path))).length;
    const coveredVideos = referencedVideos
      .filter(file => filePaths.has(thumbnailPath(file.path))).length;
    const photoCoverage = referencedPhotos.length > 0
      ? (coveredPhotos / referencedPhotos.length) * 100
      : 100;
    const videoCoverage = referencedVideos.length > 0
      ? (coveredVideos / referencedVideos.length) * 100
      : 100;
    console.log(
      `Photo thumbnail coverage: ${coveredPhotos}/${referencedPhotos.length} `
      + `(${photoCoverage.toFixed(1)}%)`
    );
    console.log(
      `Video thumbnail coverage: ${coveredVideos}/${referencedVideos.length} `
      + `(${videoCoverage.toFixed(1)}%)`
    );
  }

  console.log('Largest files:');
  files
    .slice()
    .sort((a, b) => b.size - a.size)
    .slice(0, 15)
    .forEach(file => console.log(`  ${formatBytes(file.size).padStart(10)}  ${file.path}`));

  console.log('Largest referenced files:');
  referencedFiles
    .slice()
    .sort((a, b) => b.size - a.size)
    .slice(0, 15)
    .forEach(file => console.log(`  ${formatBytes(file.size).padStart(10)}  ${file.path}`));

  if (orphaned.length > 0 || orphanedThumbnails.length > 0) {
    console.log('Potential orphan samples:');
    [...orphaned, ...orphanedThumbnails]
      .slice(0, 20)
      .forEach(file => console.log(`  ${formatBytes(file.size).padStart(10)}  ${file.path}`));
  }

  return {
    orphanPaths: [...orphaned, ...orphanedThumbnails].map(file => file.path),
    orphanBytes,
  };
}

async function removeFiles(bucket, paths) {
  const BATCH_SIZE = 100;
  for (let index = 0; index < paths.length; index += BATCH_SIZE) {
    const batch = paths.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw error;
  }
}

async function main() {
  const [posts, postMedia, mediaLibrary, users, postFiles, avatarFiles, buckets] = await Promise.all([
    fetchAllRows('posts', 'id, media_url, menu_name'),
    fetchAllRows('post_media', 'post_id, media_url').catch(error => {
      console.warn(`post_media audit skipped: ${error.message}`);
      return [];
    }),
    fetchAllRows('media_library', 'id, file_path').catch(error => {
      console.warn(`media_library audit skipped: ${error.message}`);
      return [];
    }),
    fetchAllRows('users', 'id, avatar_url'),
    listBucketFiles('posts'),
    listBucketFiles('avatars'),
    supabase.storage.listBuckets().then(({ data, error }) => {
      if (error) throw error;
      return data ?? [];
    }),
  ]);

  const postReferences = new Set();
  for (const post of posts) {
    const mainPath = storagePathFromUrl('posts', post.media_url);
    if (mainPath) postReferences.add(mainPath);

    const extraMatch = post.menu_name?.match(/\|EXTRA_MEDIA:(.+)$/);
    for (const mediaUrl of extraMatch?.[1]?.split(',') ?? []) {
      const extraPath = storagePathFromUrl('posts', mediaUrl.trim());
      if (extraPath) postReferences.add(extraPath);
    }
  }
  for (const media of postMedia) {
    const mediaPath = storagePathFromUrl('posts', media.media_url);
    if (mediaPath) postReferences.add(mediaPath);
  }
  for (const media of mediaLibrary) {
    const mediaPath = storagePathFromUrl('posts', media.file_path);
    if (mediaPath) postReferences.add(mediaPath);
  }

  const avatarReferences = new Set(
    users
      .map(user => storagePathFromUrl('avatars', user.avatar_url))
      .filter(Boolean)
  );

  console.log(`Audited at: ${new Date().toISOString()}`);
  console.log(
    `Database rows: posts ${posts.length}, post_media ${postMedia.length}, `
    + `media_library ${mediaLibrary.length}, users ${users.length}`
  );
  const bucketMap = new Map(buckets.map(bucket => [bucket.name, bucket]));
  const postsSummary = summarizeBucket('posts', postFiles, postReferences, bucketMap.get('posts'));
  const avatarsSummary = summarizeBucket('avatars', avatarFiles, avatarReferences, bucketMap.get('avatars'));

  if (process.argv.includes('--delete-orphans')) {
    console.log('\nDeleting files that are not referenced by posts, post_media, media_library, or users...');
    await removeFiles('posts', postsSummary.orphanPaths);
    await removeFiles('avatars', avatarsSummary.orphanPaths);
    console.log(
      `Deleted ${postsSummary.orphanPaths.length + avatarsSummary.orphanPaths.length} files `
      + `(${formatBytes(postsSummary.orphanBytes + avatarsSummary.orphanBytes)}).`
    );
  }
}

main().catch(error => {
  console.error('Storage audit failed:', error.message);
  process.exitCode = 1;
});
