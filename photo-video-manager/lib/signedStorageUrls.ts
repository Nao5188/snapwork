import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from './supabase';

export type PrivateStorageBucket = 'posts' | 'avatars';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CACHE_REFRESH_SKEW_MS = 5 * 60 * 1000;
const LOCAL_OR_INLINE_PREFIXES = [
  'file://',
  'content://',
  'ph://',
  'assets-library://',
  'data:',
];

type SignedUrlCacheEntry = {
  url: string;
  expiresAt: number;
};

type SignedStorageUrlResolverOptions = {
  expiresIn?: number;
  deferStorageUrlsUntilSigned?: boolean;
};

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

const getBucketPathPrefixes = (bucket: PrivateStorageBucket) => [
  `/storage/v1/object/public/${bucket}/`,
  `/storage/v1/object/sign/${bucket}/`,
  `/storage/v1/object/authenticated/${bucket}/`,
];

const isLocalOrInlineUri = (value: string) => (
  LOCAL_OR_INLINE_PREFIXES.some(prefix => value.startsWith(prefix))
);

const isSignedStorageUrl = (bucket: PrivateStorageBucket, value: string) => {
  try {
    return new URL(value).pathname.startsWith(`/storage/v1/object/sign/${bucket}/`);
  } catch {
    return false;
  }
};

const normalizeUrlList = (urls: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  urls.forEach((url) => {
    const trimmedUrl = url?.trim();
    if (!trimmedUrl || seen.has(trimmedUrl)) return;
    seen.add(trimmedUrl);
    normalized.push(trimmedUrl);
  });

  return normalized;
};

export function getStoragePathFromUrl(
  bucket: PrivateStorageBucket,
  value?: string | null,
): string | null {
  if (!value || isLocalOrInlineUri(value)) {
    return null;
  }

  try {
    const url = new URL(value);
    const prefix = getBucketPathPrefixes(bucket).find(candidate => (
      url.pathname.startsWith(candidate)
    ));

    if (!prefix) return null;

    const storagePath = decodeURIComponent(url.pathname.slice(prefix.length));
    return storagePath || null;
  } catch {
    return null;
  }
}

export async function getSignedStorageUrl(
  bucket: PrivateStorageBucket,
  value: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const storagePath = getStoragePathFromUrl(bucket, value);
  if (!storagePath) {
    return value;
  }

  const now = Date.now();
  const cacheKey = `${bucket}:${storagePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt - CACHE_REFRESH_SKEW_MS > now) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    if (__DEV__) {
      console.warn(`Failed to create signed ${bucket} storage link`);
    }
    return value;
  }

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: now + expiresIn * 1000,
  });

  return data.signedUrl;
}

export const getSignedPostMediaUrl = (mediaUrl: string) => (
  getSignedStorageUrl('posts', mediaUrl)
);

export const getSignedAvatarUrl = (avatarUrl: string) => (
  getSignedStorageUrl('avatars', avatarUrl)
);

export function useSignedStorageUrlResolver(
  bucket: PrivateStorageBucket,
  urls: Array<string | null | undefined>,
  options: SignedStorageUrlResolverOptions = {},
) {
  const {
    expiresIn = SIGNED_URL_TTL_SECONDS,
    deferStorageUrlsUntilSigned = false,
  } = options;
  const normalizedUrlKey = normalizeUrlList(urls).join('\n');
  const normalizedUrls = useMemo(
    () => normalizedUrlKey ? normalizedUrlKey.split('\n') : [],
    [normalizedUrlKey]
  );
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    if (normalizedUrls.length === 0) {
      setSignedUrls({});
      return () => {
        active = false;
      };
    }

    Promise.all(
      normalizedUrls.map(async (url) => [
        url,
        await getSignedStorageUrl(bucket, url, expiresIn),
      ] as const)
    )
      .then((entries) => {
        if (!active) return;
        setSignedUrls(Object.fromEntries(entries));
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn(`Failed to resolve signed ${bucket} storage links`);
        }
      });

    return () => {
      active = false;
    };
  }, [bucket, expiresIn, normalizedUrlKey, normalizedUrls]);

  return useCallback(
    (url?: string | null) => {
      if (!url) return '';

      const resolvedUrl = signedUrls[url];
      const isStorageUrl = getStoragePathFromUrl(bucket, url) !== null;

      if (
        deferStorageUrlsUntilSigned
        && isStorageUrl
        && (!resolvedUrl || !isSignedStorageUrl(bucket, resolvedUrl))
      ) {
        return '';
      }

      return resolvedUrl ?? url;
    },
    [bucket, deferStorageUrlsUntilSigned, signedUrls],
  );
}
