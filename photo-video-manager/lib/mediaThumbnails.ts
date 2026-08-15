import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

const THUMBNAIL_WIDTH = 720;
const THUMBNAIL_QUALITY = 0.72;
const AVATAR_WIDTH = 1024;
const AVATAR_QUALITY = 0.82;
const POSTS_PUBLIC_PATH = "/storage/v1/object/public/posts/";
const POSTS_SIGNED_PATH = "/storage/v1/object/sign/posts/";
const POSTS_AUTHENTICATED_PATH = "/storage/v1/object/authenticated/posts/";
const POSTS_STORAGE_PATHS = [
  POSTS_PUBLIC_PATH,
  POSTS_SIGNED_PATH,
  POSTS_AUTHENTICATED_PATH,
];
const VIDEO_THUMBNAIL_CAPTURE_TIMES_MS = [3000, 1000, 0];
const LEGACY_VIDEO_THUMBNAIL_REFRESH_BEFORE = Date.parse(
  "2026-06-14T00:00:00.000Z",
);

export type MediaType = "photo" | "video";

async function createLocalVideoFrame(mediaUri: string): Promise<string> {
  let lastError: unknown;

  for (const time of VIDEO_THUMBNAIL_CAPTURE_TIMES_MS) {
    try {
      const thumbnail = await VideoThumbnails.getThumbnailAsync(mediaUri, {
        time,
        quality: 0.8,
      });
      return thumbnail.uri;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create video thumbnail");
}

export async function createLocalMediaThumbnail(
  mediaUri: string,
  mediaType: MediaType,
): Promise<string> {
  let sourceUri = mediaUri;

  if (mediaType === "video") {
    sourceUri = await createLocalVideoFrame(mediaUri);
  }

  const resized = await manipulateAsync(
    sourceUri,
    [{ resize: { width: THUMBNAIL_WIDTH } }],
    {
      compress: THUMBNAIL_QUALITY,
      format: SaveFormat.JPEG,
    },
  );

  return resized.uri;
}

export async function createOptimizedAvatar(imageUri: string): Promise<string> {
  const resized = await manipulateAsync(
    imageUri,
    [{ resize: { width: AVATAR_WIDTH } }],
    {
      compress: AVATAR_QUALITY,
      format: SaveFormat.JPEG,
    },
  );

  return resized.uri;
}

export function getMediaThumbnailPath(originalPath: string): string {
  const extensionIndex = originalPath.lastIndexOf(".");
  const basePath =
    extensionIndex > originalPath.lastIndexOf("/")
      ? originalPath.slice(0, extensionIndex)
      : originalPath;

  return `${basePath}_thumb.jpg`;
}

export function getMediaThumbnailUrl(mediaUrl: string): string {
  if (!mediaUrl || mediaUrl.startsWith("file://")) {
    return mediaUrl;
  }

  try {
    const url = new URL(mediaUrl);
    const prefix = POSTS_STORAGE_PATHS.find((candidate) =>
      url.pathname.startsWith(candidate)
    );

    if (!prefix) {
      return mediaUrl;
    }

    const originalPath = decodeURIComponent(url.pathname.slice(prefix.length));
    const thumbnailPath = getMediaThumbnailPath(originalPath)
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    url.pathname = `${prefix}${thumbnailPath}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return mediaUrl;
  }
}

export function hasDedicatedThumbnail(mediaUrl: string): boolean {
  return getMediaThumbnailUrl(mediaUrl) !== mediaUrl;
}

export function getPostStoragePathFromUrl(mediaUrl: string): string | null {
  if (!mediaUrl || mediaUrl.startsWith("file://")) {
    return null;
  }

  try {
    const url = new URL(mediaUrl);
    const prefix = POSTS_STORAGE_PATHS.find((candidate) =>
      url.pathname.startsWith(candidate)
    );

    return prefix
      ? decodeURIComponent(url.pathname.slice(prefix.length))
      : null;
  } catch {
    return null;
  }
}

export function shouldRefreshLegacyVideoThumbnail(
  createdAt?: Date | string | null,
): boolean {
  if (!createdAt) return false;

  const timestamp =
    createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);

  return (
    Number.isFinite(timestamp) &&
    timestamp < LEGACY_VIDEO_THUMBNAIL_REFRESH_BEFORE
  );
}
