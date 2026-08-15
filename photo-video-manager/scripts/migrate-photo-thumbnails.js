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
const writeChanges = process.argv.includes('--write');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PAGE_SIZE = 1000;

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

async function listBucketFiles(prefix = '') {
  const files = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from('posts').list(prefix, {
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
          contentType: entry.metadata?.mimetype ?? entry.metadata?.contentType ?? '',
        });
      } else {
        files.push(...await listBucketFiles(entryPath));
      }
    }
    if (entries.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return files;
}

function storagePathFromUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const marker = '/storage/v1/object/public/posts/';
    return url.pathname.startsWith(marker)
      ? decodeURIComponent(url.pathname.slice(marker.length))
      : null;
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

async function main() {
  const [posts, postMedia, mediaLibrary, files] = await Promise.all([
    fetchAllRows('posts', 'media_url, menu_name'),
    fetchAllRows('post_media', 'media_url').catch(() => []),
    fetchAllRows('media_library', 'file_path').catch(() => []),
    listBucketFiles(),
  ]);

  const references = new Set();
  for (const post of posts) {
    const mainPath = storagePathFromUrl(post.media_url);
    if (mainPath) references.add(mainPath);
    const extraMatch = post.menu_name?.match(/\|EXTRA_MEDIA:(.+)$/);
    for (const mediaUrl of extraMatch?.[1]?.split(',') ?? []) {
      const extraPath = storagePathFromUrl(mediaUrl.trim());
      if (extraPath) references.add(extraPath);
    }
  }
  for (const media of postMedia) {
    const mediaPath = storagePathFromUrl(media.media_url);
    if (mediaPath) references.add(mediaPath);
  }
  for (const media of mediaLibrary) {
    const mediaPath = storagePathFromUrl(media.file_path);
    if (mediaPath) references.add(mediaPath);
  }

  const fileMap = new Map(files.map(file => [file.path, file]));
  const candidates = [...references].filter(originalPath => {
    const file = fileMap.get(originalPath);
    if (!file || fileMap.has(thumbnailPath(originalPath))) return false;
    return !file.contentType.startsWith('video/')
      && !/\.(mov|mp4|m4v|avi|webm)$/i.test(originalPath);
  });

  console.log(`Photo thumbnails missing: ${candidates.length}`);
  candidates.forEach(candidate => console.log(`  ${candidate}`));

  if (!writeChanges) {
    console.log('Dry run only. Re-run with --write after upgrading to Pro and enabling Image Transformations.');
    return;
  }

  let succeeded = 0;
  let failed = 0;
  for (const originalPath of candidates) {
    try {
      const { data } = supabase.storage.from('posts').getPublicUrl(originalPath, {
        transform: { width: 720, quality: 72, resize: 'contain' },
      });
      const response = await fetch(data.publicUrl);
      if (response.status === 403) {
        throw new Error(
          'Image Transformations returned HTTP 403. Upgrade to Pro and enable '
          + 'Storage > Settings > Image Transformations before retrying.'
        );
      }
      if (!response.ok) {
        throw new Error(`Transformation returned HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        throw new Error(`Unexpected content type: ${contentType}`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const { error } = await supabase.storage
        .from('posts')
        .upload(thumbnailPath(originalPath), bytes, {
          contentType,
          cacheControl: '31536000',
          upsert: false,
        });
      if (error) throw error;

      succeeded += 1;
      console.log(`Created: ${thumbnailPath(originalPath)}`);
    } catch (error) {
      failed += 1;
      console.warn(`Failed: ${originalPath}: ${error.message}`);
      if (String(error.message).includes('Image Transformations returned HTTP 403')) {
        break;
      }
    }
  }

  console.log(`Completed. Created ${succeeded}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error('Thumbnail migration failed:', error.message);
  process.exitCode = 1;
});
