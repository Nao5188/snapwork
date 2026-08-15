import AsyncStorage from '@react-native-async-storage/async-storage';

import { storeService, supabase } from './supabase';
import { isStoreAdminRole } from './storeRoles';
import type { StoreMemberRole } from './storeRoles';

const USER_INFO_CACHE_PREFIX = 'drawer_user_info_v2:';
const LEGACY_USER_INFO_CACHE_PREFIX = 'drawer_user_info_v1:';

export interface DrawerUserInfo {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  storeId: string | null;
  storeName: string | null;
  storeInviteCode: string | null;
  role: StoreMemberRole | null;
  stores: {
    id: string;
    name: string;
    role: StoreMemberRole;
  }[];
}

const refreshRequests = new Map<string, Promise<DrawerUserInfo | null>>();
const memoryCache = new Map<string, DrawerUserInfo>();

const getUserInfoCacheKey = (userId: string) => `${USER_INFO_CACHE_PREFIX}${userId}`;

const normalizeAvatarUrl = (avatarUrl?: string | null) => {
  if (
    !avatarUrl ||
    avatarUrl.startsWith('file://') ||
    avatarUrl.includes('placeholder') ||
    avatarUrl.includes('ui-avatars.com')
  ) {
    return null;
  }

  return avatarUrl;
};

const parseCachedUserInfo = (rawValue: string | null, userId: string): DrawerUserInfo | null => {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<DrawerUserInfo> & { userId?: string };
    if (parsed.userId !== userId) {
      return null;
    }

    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : 'ユーザー',
      username: typeof parsed.username === 'string' ? parsed.username : '',
      avatarUrl: normalizeAvatarUrl(parsed.avatarUrl),
      storeId: null,
      storeName: typeof parsed.storeName === 'string' ? parsed.storeName : null,
      // Authorization data must always be refreshed from the server.
      storeInviteCode: null,
      role: null,
      stores: [],
    };
  } catch {
    return null;
  }
};

export const getCachedDrawerUserInfo = async (userId: string): Promise<DrawerUserInfo | null> => {
  const memoryCachedUserInfo = memoryCache.get(userId);
  if (memoryCachedUserInfo) {
    return memoryCachedUserInfo;
  }

  const legacyCacheKey = `${LEGACY_USER_INFO_CACHE_PREFIX}${userId}`;
  const [rawValue] = await Promise.all([
    AsyncStorage.getItem(getUserInfoCacheKey(userId)),
    AsyncStorage.removeItem(legacyCacheKey).catch((error) => {
      console.warn('DrawerMenu: legacy user info cache removal failed', error);
    }),
  ]);
  return parseCachedUserInfo(rawValue, userId);
};

export const refreshDrawerUserInfo = (userId: string): Promise<DrawerUserInfo | null> => {
  const existingRequest = refreshRequests.get(userId);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const [{ data, error }, memberships] = await Promise.all([
      supabase
        .from('users')
        .select('username, display_name, avatar_url')
        .eq('id', userId)
        .single(),
      storeService.getMyMemberships(userId),
    ]);

    if (error) throw error;
    if (!data) return null;

    const activeStoreId = await storeService.getActiveStoreId(userId);
    const activeMembership = memberships.find(
      membership => membership.store_id === activeStoreId
    ) ?? memberships[0] ?? null;
    const storeInviteCode = isStoreAdminRole(activeMembership?.role)
      ? await storeService.getStoreNumber(activeMembership.store_id).catch((error) => {
          console.warn('DrawerMenu: store number fetch failed', error);
          return null;
        })
      : null;

    const userInfo: DrawerUserInfo = {
      displayName: data.display_name || data.username || 'ユーザー',
      username: data.username || '',
      avatarUrl: normalizeAvatarUrl(data.avatar_url),
      storeId: activeMembership?.store_id ?? null,
      storeName: activeMembership?.store?.name ?? null,
      storeInviteCode,
      role: activeMembership?.role ?? null,
      stores: memberships.map(membership => ({
        id: membership.store_id,
        name: membership.store?.name ?? '名称未設定の店舗',
        role: membership.role,
      })),
    };

    memoryCache.set(userId, userInfo);

    try {
      await AsyncStorage.setItem(
        getUserInfoCacheKey(userId),
        JSON.stringify({
          userId,
          cachedAt: Date.now(),
          displayName: userInfo.displayName,
          username: userInfo.username,
          avatarUrl: userInfo.avatarUrl,
          storeName: userInfo.storeName,
        })
      );
    } catch (error) {
      console.warn('DrawerMenu: user info cache write failed', error);
    }

    return userInfo;
  })();

  refreshRequests.set(userId, request);
  const clearRequest = () => {
    if (refreshRequests.get(userId) === request) refreshRequests.delete(userId);
  };
  void request.then(clearRequest, clearRequest);

  return request;
};
