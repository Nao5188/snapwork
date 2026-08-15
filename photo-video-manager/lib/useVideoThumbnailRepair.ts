import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { fileStorageService } from './supabase';

type RepairOptions = {
  force?: boolean;
  markFailed?: boolean;
};

const inFlightRepairKeys = new Set<string>();
const repairedVideoThumbnailKeys = new Set<string>();
const REPAIRED_THUMBNAIL_STORAGE_PREFIX = 'repaired_video_thumbnail_v2:';

function hashKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getRepairStorageKey(key: string) {
  return `${REPAIRED_THUMBNAIL_STORAGE_PREFIX}${hashKey(key)}`;
}

export function useVideoThumbnailRepair() {
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());

  const repairVideoThumbnail = useCallback(async (
    key: string,
    mediaUrl: string,
    options: RepairOptions = {}
  ) => {
    if (!key || !mediaUrl || inFlightRepairKeys.has(key)) {
      return null;
    }

    if (!options.force && repairedVideoThumbnailKeys.has(key)) {
      return null;
    }

    inFlightRepairKeys.add(key);

    try {
      if (!options.force) {
        const storedMarker = await AsyncStorage.getItem(getRepairStorageKey(key));
        if (storedMarker === '1') {
          repairedVideoThumbnailKeys.add(key);
          return null;
        }
      }

      const thumbnailUrl = await fileStorageService.ensurePostVideoThumbnail(mediaUrl);
      if (thumbnailUrl) {
        repairedVideoThumbnailKeys.add(key);
        await AsyncStorage.setItem(getRepairStorageKey(key), '1').catch(() => {});
        setThumbnailUrls(prev => ({ ...prev, [key]: thumbnailUrl }));
        setFailedKeys(prev => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return thumbnailUrl;
      }
    } catch (error) {
      console.warn('Failed to repair video thumbnail:', error);
    } finally {
      inFlightRepairKeys.delete(key);
    }

    if (options.markFailed !== false) {
      setFailedKeys(prev => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
    return null;
  }, []);

  return {
    failedKeys,
    repairVideoThumbnail,
    thumbnailUrls,
  };
}
