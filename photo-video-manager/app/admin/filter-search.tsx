import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { authService, storeService, supabase } from '@/lib/supabase';
import { getStoreRoleLabel, isStoreAdminRole, normalizeStoreMemberRole } from '@/lib/storeRoles';
import type { StoreMemberRole, StoreRoleFilter } from '@/lib/storeRoles';
import {
  getMediaThumbnailUrl,
  hasDedicatedThumbnail,
  shouldRefreshLegacyVideoThumbnail,
} from '@/lib/mediaThumbnails';
import {
  getSignedPostMediaUrl,
  useSignedStorageUrlResolver,
} from '@/lib/signedStorageUrls';
import { useVideoThumbnailRepair } from '@/lib/useVideoThumbnailRepair';
import { subscribeActiveStoreChanged } from '@/lib/activeStoreEvents';
import { useAppTheme } from '@/lib/ThemeContext';

type RoleFilter = StoreRoleFilter;
type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'custom';
type MediaFilter = 'all' | 'photo' | 'video';
type SortFilter = 'newest' | 'oldest';
type ReviewStatus = 'pending' | 'approved' | 'rejected';
type ReviewStatusFilter = 'all' | ReviewStatus;
type SelectedMediaFilter = Exclude<MediaFilter, 'all'>;
type ManualDateField = 'start' | 'end';

interface ManualPeriodRange {
  startDate: Date;
  endDate: Date;
}

interface StaffOption {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url?: string | null;
  role: StoreMemberRole;
}

interface MediaItem {
  id: string;
  mediaUrl: string;
  isVideo: boolean;
  displayOrder: number;
}

interface PostItem {
  id: string;
  title: string;
  menu_name: string;
  displayMenuName: string;
  media_url: string;
  is_video: boolean;
  created_at: string;
  user_id: string;
  review_status: ReviewStatus;
  categories: string[];
  mediaItems: MediaItem[];
  users?: {
    username: string;
    display_name: string;
    avatar_url?: string | null;
  };
}

const ACCENT = '#2196F3';
const ACCENT_SOFT = '#EAF4FE';
const CUSTOM_CATEGORIES_KEY = 'custom_menu_categories';
const getStoreCustomCategoriesKey = (storeId: string) => `${CUSTOM_CATEGORIES_KEY}:${storeId}`;
const getLegacyStoreCustomCategoriesKey = (storeId: string) => `${CUSTOM_CATEGORIES_KEY}_${storeId}`;

const PERIOD_OPTIONS: { label: string; value: PeriodFilter }[] = [
  { label: 'すべて', value: 'all' },
  { label: '今日', value: 'today' },
  { label: '今週', value: 'week' },
  { label: '今月', value: 'month' },
  { label: '手動', value: 'custom' },
];

const ROLE_OPTIONS: { label: string; value: RoleFilter }[] = [
  { label: 'すべて', value: 'all' },
  { label: 'オーナー', value: 'owner' },
  { label: '管理者', value: 'admin' },
  { label: 'スタッフ', value: 'staff' },
];

const MEDIA_OPTIONS: { label: string; value: MediaFilter }[] = [
  { label: 'すべて', value: 'all' },
  { label: '写真のみ', value: 'photo' },
  { label: '動画のみ', value: 'video' },
];

const SORT_OPTIONS: {
  label: string;
  value: SortFilter;
  icon: keyof typeof Ionicons.glyphMap;
  column: 'created_at';
  ascending: boolean;
}[] = [
  { label: '新しい順（投稿日）', value: 'newest', icon: 'arrow-down-outline', column: 'created_at', ascending: false },
  { label: '古い順（投稿日）', value: 'oldest', icon: 'arrow-up-outline', column: 'created_at', ascending: true },
];

const REVIEW_STATUS_OPTIONS: {
  label: string;
  value: ReviewStatus;
  icon: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}[] = [
  {
    label: '承認待ち',
    value: 'pending',
    icon: 'time-outline',
    backgroundColor: '#FFF7E8',
    borderColor: '#F8D79B',
    textColor: '#A15C00',
  },
  {
    label: '承認済み',
    value: 'approved',
    icon: 'checkmark-circle-outline',
    backgroundColor: '#EAF8EF',
    borderColor: '#BDE8C8',
    textColor: '#1F7A3D',
  },
  {
    label: '却下',
    value: 'rejected',
    icon: 'close-circle-outline',
    backgroundColor: '#F1F2F6',
    borderColor: '#DEE2EA',
    textColor: '#5D6678',
  },
];

const REVIEW_STATUS_FILTER_OPTIONS: {
  label: string;
  value: ReviewStatusFilter;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { label: 'すべて', value: 'all', icon: 'apps-outline' },
  ...REVIEW_STATUS_OPTIONS
    .filter(option => option.value === 'pending' || option.value === 'approved')
    .map(option => ({
      label: option.label,
      value: option.value,
      icon: option.icon,
    })),
];

type CategoryOption = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const DEFAULT_CATEGORY_OPTIONS: CategoryOption[] = [
  { label: 'すべて', value: 'all', icon: 'apps-outline' },
  { label: 'カット', value: 'カット', icon: 'cut-outline' },
  { label: 'カラー', value: 'カラー', icon: 'color-palette-outline' },
  { label: 'パーマ', value: 'パーマ', icon: 'water-outline' },
  { label: 'ブリーチ', value: 'ブリーチ', icon: 'sparkles-outline' },
  { label: '縮毛', value: '縮毛', icon: 'sparkles-outline' },
  { label: 'トリートメント', value: 'トリートメント', icon: 'flask-outline' },
];

const CATEGORY_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  カット: 'cut-outline',
  カラー: 'color-palette-outline',
  パーマ: 'water-outline',
  ブリーチ: 'sparkles-outline',
  縮毛: 'sparkles-outline',
  縮毛矯正: 'sparkles-outline',
  トリートメント: 'flask-outline',
};

const HIDDEN_CATEGORY_VALUES = new Set(['ヘッドスパ']);

function getPeriodStart(period: PeriodFilter): string | null {
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString();
    }
    default:
      return null;
  }
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function createDefaultManualPeriodRange(): ManualPeriodRange {
  const endDate = endOfDay(new Date());
  const startDate = startOfDay(new Date());
  startDate.setMonth(startDate.getMonth() - 3);

  return { startDate, endDate };
}

function getPeriodRange(period: PeriodFilter, manualRange: ManualPeriodRange) {
  if (period === 'custom') {
    return {
      startIso: manualRange.startDate.toISOString(),
      endIso: manualRange.endDate.toISOString(),
    };
  }

  return {
    startIso: getPeriodStart(period),
    endIso: null,
  };
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function getPeriodLabel(period: PeriodFilter, manualRange: ManualPeriodRange) {
  const now = new Date();
  if (period === 'custom') {
    return `${formatDate(manualRange.startDate)} 〜 ${formatDate(manualRange.endDate)}`;
  }

  const startIso = getPeriodStart(period);
  if (!startIso) return 'すべての期間';
  return `${formatDate(new Date(startIso))} 〜 ${formatDate(now)}`;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return 'たった今';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分前`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}時間前`;
  const diffInDays = Math.floor(diffInSeconds / 86400);
  if (diffInDays < 7) return `${diffInDays}日前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function parseMenuName(rawMenuName: string) {
  let displayMenuName = rawMenuName || '';
  let categoryText = '';

  if (displayMenuName.includes('|CATEGORIES:')) {
    const parts = displayMenuName.split('|CATEGORIES:');
    displayMenuName = parts[0];
    categoryText = parts[1]?.split('|EXTRA_MEDIA:')[0] || '';
  }

  if (displayMenuName.includes('|EXTRA_MEDIA:')) {
    displayMenuName = displayMenuName.split('|EXTRA_MEDIA:')[0];
  }

  const categories = categoryText
    .split(',')
    .map(category => normalizeCategory(category))
    .filter(category => category.length > 0 && !isHiddenCategory(category));

  return {
    displayMenuName: displayMenuName.trim(),
    categories,
  };
}

function normalizeCategory(category: string) {
  return category.trim().normalize('NFKC');
}

function isHiddenCategory(category: string) {
  return HIDDEN_CATEGORY_VALUES.has(normalizeCategory(category));
}

function categoryMatches(postCategories: string[], selectedCategories: string[]) {
  if (selectedCategories.length === 0) return true;
  const normalizedSelectedCategories = new Set(selectedCategories.map(category => normalizeCategory(category)));
  return postCategories.some(category => normalizedSelectedCategories.has(normalizeCategory(category)));
}

function toggleSelection<T extends string>(selectedValues: T[], value: T) {
  return selectedValues.includes(value)
    ? selectedValues.filter(selectedValue => selectedValue !== value)
    : [...selectedValues, value];
}

function parseStoredCategories(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map(category => normalizeCategory(`${category}`))
        .filter(category => category.length > 0 && !isHiddenCategory(category));
    }
  } catch {
    // Older values may be comma-separated plain text.
  }

  return value
    .split(',')
    .map(category => normalizeCategory(category))
    .filter(category => category.length > 0 && !isHiddenCategory(category));
}

function buildCategoryOptions(categories: string[]) {
  const seen = new Set<string>();
  const options = [...DEFAULT_CATEGORY_OPTIONS];
  DEFAULT_CATEGORY_OPTIONS.forEach(option => seen.add(normalizeCategory(option.value)));

  categories.forEach(category => {
    const normalizedCategory = normalizeCategory(category);
    if (!normalizedCategory || isHiddenCategory(normalizedCategory) || seen.has(normalizedCategory)) return;
    seen.add(normalizedCategory);
    options.push({
      label: normalizedCategory,
      value: normalizedCategory,
      icon: CATEGORY_ICON_MAP[normalizedCategory] ?? 'pricetag-outline',
    });
  });

  return options;
}

function normalizeReviewStatus(status: unknown): ReviewStatus {
  if (
    status === 'approved'
    || status === 'rejected'
    || status === 'pending'
  ) {
    return status;
  }
  return 'pending';
}

function getReviewStatusOption(status: ReviewStatus) {
  return REVIEW_STATUS_OPTIONS.find(option => option.value === status) ?? REVIEW_STATUS_OPTIONS[0];
}

function isMissingReviewStatusError(error: any) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;
  return message.includes('review_status') || error?.code === '42703' || error?.code === 'PGRST204';
}

function getReviewStatusUpdateErrorMessage(error: any) {
  const rawMessage = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;

  if (
    isMissingReviewStatusError(error)
    || error?.code === 'PGRST202'
    || rawMessage.includes('set_post_review_status')
  ) {
    return '承認機能用のDB更新が必要です。Supabaseで database/post_review_status.sql を実行してください。';
  }

  if (rawMessage.includes('Only store owners can change review status')) {
    return '承認変更用のDB関数が古い状態です。管理者でも承認変更できるよう、Supabaseで database/post_review_status.sql を再実行してください。';
  }

  if (rawMessage.includes('Only store owners and admins can change review status')) {
    return 'この操作は店舗のオーナーまたは管理者のみ実行できます。役割設定を確認してください。';
  }

  if (error?.code === '42501' || rawMessage.includes('row-level security') || rawMessage.includes('permission')) {
    return '承認変更用SQLの適用状況、または店舗の役割設定を確認してください。';
  }

  return rawMessage.trim() || 'もう一度お試しください。';
}

function getMediaThumbnailKey(postId: string, media: MediaItem) {
  return `${postId}:${media.id}:${media.mediaUrl}`;
}

export default function FilterSearchScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState(DEFAULT_CATEGORY_OPTIONS);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<StoreMemberRole | null>(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [manualPeriodModalVisible, setManualPeriodModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [previewPost, setPreviewPost] = useState<PostItem | null>(null);
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [thumbnailErrors, setThumbnailErrors] = useState<Set<string>>(new Set());
  const {
    failedKeys: failedVideoThumbnailKeys,
    repairVideoThumbnail,
    thumbnailUrls: repairedVideoThumbnailUrls,
  } = useVideoThumbnailRepair();
  const isFocusedRef = useRef(false);

  const [searchText, setSearchText] = useState('');
  const [staffSearchText, setStaffSearchText] = useState('');
  const [staffPickerRole, setStaffPickerRole] = useState<RoleFilter>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [selectedRoles, setSelectedRoles] = useState<StoreMemberRole[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('all');
  const [manualPeriodRange, setManualPeriodRange] = useState<ManualPeriodRange>(() => createDefaultManualPeriodRange());
  const [tempManualPeriodRange, setTempManualPeriodRange] = useState<ManualPeriodRange>(() => createDefaultManualPeriodRange());
  const [activeManualDateField, setActiveManualDateField] = useState<ManualDateField | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedMediaTypes, setSelectedMediaTypes] = useState<SelectedMediaFilter[]>([]);
  const [selectedReviewStatuses, setSelectedReviewStatuses] = useState<ReviewStatus[]>([]);
  const [selectedSort, setSelectedSort] = useState<SortFilter>('newest');

  const sortOption = useMemo(
    () => SORT_OPTIONS.find(option => option.value === selectedSort) ?? SORT_OPTIONS[0],
    [selectedSort]
  );

  const selectedPosts = useMemo(
    () => posts.filter(post => selectedPostIds.has(post.id)),
    [posts, selectedPostIds]
  );

  const canUseAdminFilters = isStoreAdminRole(currentUserRole);
  const selectionMode = canUseAdminFilters && selectedPostIds.size > 0;

  const postStorageUrls = useMemo(() => (
    posts.flatMap((post) => {
      const mediaItems = post.mediaItems.length > 0
        ? post.mediaItems
        : post.media_url
          ? [{
              id: 'main',
              mediaUrl: post.media_url,
              isVideo: post.is_video,
              displayOrder: 0,
            }]
          : [];

      return mediaItems.flatMap((media) => {
        const thumbnailKey = getMediaThumbnailKey(post.id, media);
        const thumbnailUrl = getMediaThumbnailUrl(media.mediaUrl);
        const repairedThumbnailUrl = repairedVideoThumbnailUrls[thumbnailKey];

        return repairedThumbnailUrl
          ? [media.mediaUrl, thumbnailUrl, repairedThumbnailUrl]
          : [media.mediaUrl, thumbnailUrl];
      });
    })
  ), [posts, repairedVideoThumbnailUrls]);
  const resolvePostStorageUrl = useSignedStorageUrlResolver('posts', postStorageUrls);
  const resolveVideoThumbnailStorageUrl = useSignedStorageUrlResolver(
    'posts',
    postStorageUrls,
    { deferStorageUrlsUntilSigned: true },
  );

  const avatarStorageUrls = useMemo(() => ([
    ...staffOptions.map(staff => staff.avatar_url),
    ...posts.map(post => post.users?.avatar_url),
  ]), [posts, staffOptions]);
  const resolveAvatarStorageUrl = useSignedStorageUrlResolver('avatars', avatarStorageUrls);

  useEffect(() => {
    posts.forEach((post) => {
      if (!shouldRefreshLegacyVideoThumbnail(post.created_at)) return;

      post.mediaItems.forEach((media) => {
        if (media.isVideo && hasDedicatedThumbnail(media.mediaUrl)) {
          repairVideoThumbnail(getMediaThumbnailKey(post.id, media), media.mediaUrl, { markFailed: false });
        }
      });
    });
  }, [posts, repairVideoThumbnail]);

  const selectedStaffOption = useMemo(
    () => staffOptions.find(staff => staff.user_id === selectedStaff) ?? null,
    [selectedStaff, staffOptions]
  );

  const selectedStaffLabel = selectedStaffOption?.display_name ?? 'すべてのスタッフ';
  const selectedStaffMeta = selectedStaffOption
    ? getStoreRoleLabel(selectedStaffOption.role)
    : `${staffOptions.length}名から選択`;

  const filteredStaffOptions = useMemo(() => {
    const query = staffSearchText.trim().toLowerCase();
    return staffOptions.filter(staff => {
      const matchesRole = staffPickerRole === 'all' || staff.role === staffPickerRole;
      const matchesText = query.length === 0
        || staff.display_name.toLowerCase().includes(query)
        || staff.username.toLowerCase().includes(query);
      return matchesRole && matchesText;
    });
  }, [staffOptions, staffPickerRole, staffSearchText]);

  const resetSearchState = useCallback(() => {
    setSearchText('');
    setStaffSearchText('');
    setStaffPickerRole('all');
    setSelectedStaff('all');
    setSelectedRoles([]);
    setSelectedPeriod('all');
    setManualPeriodRange(createDefaultManualPeriodRange());
    setTempManualPeriodRange(createDefaultManualPeriodRange());
    setActiveManualDateField(null);
    setSelectedCategories([]);
    setSelectedMediaTypes([]);
    setSelectedReviewStatuses([]);
    setSelectedSort('newest');
    setPosts([]);
    setHasSearched(false);
    setSelectedPostIds(new Set());
    setPreviewPost(null);
    setPreviewMediaIndex(0);
    setSortModalVisible(false);
    setStaffModalVisible(false);
    setManualPeriodModalVisible(false);
    setCategoryModalVisible(false);
    setNewCategoryName('');
    setCurrentUserRole(null);
  }, []);

  const loadStoreStaffOptions = useCallback(async (storeId: string, currentUserId: string) => {
    const rpcResult = await supabase.rpc('get_store_members_with_profiles', {
      p_store_id: storeId,
    } as any);

    if (!rpcResult.error && Array.isArray(rpcResult.data) && rpcResult.data.length > 0) {
      return rpcResult.data.map((member: any) => ({
        user_id: member.user_id,
        username: member.username ?? '',
        display_name: member.display_name ?? 'ユーザー',
        avatar_url: member.avatar_url ?? null,
        role: normalizeStoreMemberRole(member.role),
      })) as StaffOption[];
    }

    if (rpcResult.error && rpcResult.error.code !== 'PGRST202') {
      console.warn('get_store_members_with_profiles fallback:', rpcResult.error.message);
    }

    const [{ data: membersData }, { data: storePostUsers }] = await Promise.all([
      supabase
        .from('store_members')
        .select('user_id, role')
        .eq('store_id', storeId),
      supabase
        .from('posts')
        .select('user_id')
        .eq('store_id', storeId),
    ]);

    const members = membersData ?? [];
    const roleMap = new Map(members.map(member => [member.user_id, normalizeStoreMemberRole(member.role)]));
    const userIds = Array.from(new Set([
      ...members.map(member => member.user_id),
      ...(storePostUsers ?? []).map(post => post.user_id),
    ]));

    if (userIds.length === 0) return [];

    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);

    const profileMap = new Map((profiles ?? []).map(profile => [profile.id, profile]));

    return userIds.map(userId => {
      const profile = profileMap.get(userId);
      return {
        user_id: userId,
        username: profile?.username ?? '',
        display_name: profile?.display_name ?? (userId === currentUserId ? '自分' : 'ユーザー'),
        avatar_url: profile?.avatar_url ?? null,
        role: roleMap.get(userId) ?? (userId === currentUserId ? 'owner' : 'staff'),
      };
    });
  }, []);

  const loadCategoryOptions = useCallback(async (storeId: string) => {
    const [storeStored, legacyStoreStored] = await Promise.all([
      AsyncStorage.getItem(getStoreCustomCategoriesKey(storeId)),
      AsyncStorage.getItem(getLegacyStoreCustomCategoriesKey(storeId)),
    ]);

    const { data: storePosts } = await supabase
      .from('posts')
      .select('menu_name')
      .eq('store_id', storeId);

    const usedCategories = (storePosts ?? []).flatMap(post => parseMenuName(post.menu_name ?? '').categories);
    const savedCategories = [
      ...parseStoredCategories(storeStored),
      ...parseStoredCategories(legacyStoreStored),
    ];

    return buildCategoryOptions([...savedCategories, ...usedCategories]);
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      resetSearchState();

      const { data: { user } } = await authService.getCurrentUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const storeId = await storeService.getActiveStoreId(user.id);
      if (!storeId) {
        router.back();
        return;
      }
      setActiveStoreId(storeId);

      const [{ data: currentMembership }, staffList, nextCategoryOptions] = await Promise.all([
        supabase
          .from('store_members')
          .select('role')
          .eq('store_id', storeId)
          .eq('user_id', user.id)
          .maybeSingle(),
        loadStoreStaffOptions(storeId, user.id),
        loadCategoryOptions(storeId),
      ]);

      if (isFocusedRef.current) {
        setCurrentUserRole(currentMembership ? normalizeStoreMemberRole(currentMembership.role) : 'staff');
        setStaffOptions(staffList);
        setCategoryOptions(nextCategoryOptions);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'データの取得に失敗しました。');
    } finally {
      if (isFocusedRef.current) {
        setLoading(false);
      }
    }
  }, [loadCategoryOptions, loadStoreStaffOptions, resetSearchState, router]);

  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    loadInitialData();

    return () => {
      isFocusedRef.current = false;
      resetSearchState();
      setLoading(false);
    };
  }, [loadInitialData, resetSearchState]));

  useEffect(() => {
    return subscribeActiveStoreChanged(() => {
      if (isFocusedRef.current) {
        loadInitialData();
      }
    });
  }, [loadInitialData]);

  const fetchPosts = async ({
    storeId,
    staff,
    roles,
    period,
    manualRange,
    text,
    categories,
    mediaTypes,
    reviewStatuses,
    sort,
  }: {
    storeId: string;
    staff: string;
    roles: StoreMemberRole[];
    period: PeriodFilter;
    manualRange: ManualPeriodRange;
    text: string;
    categories: string[];
    mediaTypes: SelectedMediaFilter[];
    reviewStatuses: ReviewStatus[];
    sort: SortFilter;
  }) => {
    try {
      setHasSearched(true);
      setLoading(true);
      setSelectedPostIds(new Set());
      setPreviewPost(null);
      setPreviewMediaIndex(0);

      const effectiveStaff = canUseAdminFilters ? staff : 'all';
      const effectiveRoles = canUseAdminFilters ? roles : [];
      const effectiveMediaTypes = canUseAdminFilters ? mediaTypes : [];
      const effectiveReviewStatuses = canUseAdminFilters ? reviewStatuses : [];

      let filteredUserIds: string[] | null = null;
      if (effectiveStaff !== 'all') {
        filteredUserIds = [effectiveStaff];
      } else if (effectiveRoles.length > 0) {
        filteredUserIds = staffOptions
          .filter(staffOption => effectiveRoles.includes(staffOption.role))
          .map(staffOption => staffOption.user_id);
      }

      if (filteredUserIds && filteredUserIds.length === 0) {
        if (isFocusedRef.current) setPosts([]);
        return;
      }

      const order = SORT_OPTIONS.find(option => option.value === sort) ?? SORT_OPTIONS[0];
      const basePostColumns = 'id, title, menu_name, media_url, is_video, created_at, user_id';
      const periodRange = getPeriodRange(period, manualRange);
      const buildPostsQuery = (selectColumns: string) => {
        let postsQuery = supabase
          .from('posts')
          .select(selectColumns)
          .eq('store_id', storeId)
          .order(order.column, { ascending: order.ascending });

        if (filteredUserIds) postsQuery = postsQuery.in('user_id', filteredUserIds);
        if (effectiveMediaTypes.length === 1) postsQuery = postsQuery.eq('is_video', effectiveMediaTypes[0] === 'video');
        if (effectiveReviewStatuses.length > 0) postsQuery = postsQuery.in('review_status', effectiveReviewStatuses);
        if (periodRange.startIso) postsQuery = postsQuery.gte('created_at', periodRange.startIso);
        if (periodRange.endIso) postsQuery = postsQuery.lte('created_at', periodRange.endIso);

        return postsQuery;
      };

      let postsResult: { data: any[] | null; error: any } = await buildPostsQuery(`${basePostColumns}, review_status`);
      if (postsResult.error && isMissingReviewStatusError(postsResult.error)) {
        if (effectiveReviewStatuses.length > 0) {
          Alert.alert(
            'ステータス検索を利用できません',
            '承認機能用のDB更新が必要です。Supabaseで database/post_review_status.sql を実行してください。'
          );
          if (isFocusedRef.current) setPosts([]);
          return;
        }
        postsResult = await buildPostsQuery(basePostColumns);
      }

      const { data: postsData, error } = postsResult;
      if (error) throw error;

      if (!postsData || postsData.length === 0) {
        if (isFocusedRef.current) setPosts([]);
        return;
      }

      const postIds = postsData.map(post => post.id);
      const allUserIds = [...new Set(postsData.map(post => post.user_id))];

      const [{ data: profilesData }, { data: allPostMedia }] = await Promise.all([
        supabase
          .from('public_profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', allUserIds),
        supabase
          .from('post_media')
          .select('id, post_id, media_url, is_video, display_order')
          .in('post_id', postIds)
          .order('display_order', { ascending: true }),
      ]);

      const profileMap = new Map((profilesData ?? []).map(profile => [profile.id, profile]));
      const postMediaMap = new Map<string, any[]>();
      (allPostMedia ?? []).forEach(mediaItem => {
        if (!postMediaMap.has(mediaItem.post_id)) postMediaMap.set(mediaItem.post_id, []);
        postMediaMap.get(mediaItem.post_id)!.push(mediaItem);
      });

      const normalizedText = text.trim().toLowerCase();
      const result: PostItem[] = postsData
        .map(post => {
          const profile = profileMap.get(post.user_id);
          const parsedMenu = parseMenuName(post.menu_name);
          const postMediaItems = postMediaMap.get(post.id) ?? [];
          const mediaItems = postMediaItems.length > 0
            ? postMediaItems
              .filter(mediaItem => mediaItem.media_url && mediaItem.media_url.trim() !== '')
              .map(mediaItem => ({
                id: mediaItem.id,
                mediaUrl: mediaItem.media_url,
                isVideo: mediaItem.is_video,
                displayOrder: mediaItem.display_order ?? 0,
              }))
            : (post.media_url ? [{
              id: 'main',
              mediaUrl: post.media_url,
              isVideo: post.is_video,
              displayOrder: 0,
            }] : []);

          return {
            ...post,
            displayMenuName: parsedMenu.displayMenuName,
            review_status: normalizeReviewStatus(post.review_status),
            categories: parsedMenu.categories,
            mediaItems,
            users: profile ? {
              username: profile.username ?? '',
              display_name: profile.display_name ?? 'ユーザー',
              avatar_url: profile.avatar_url,
            } : undefined,
          };
        })
        .filter(post => {
          const matchesText = normalizedText.length === 0
            || post.title.toLowerCase().includes(normalizedText)
            || post.displayMenuName.toLowerCase().includes(normalizedText)
            || post.categories.some((postCategory: string) => postCategory.toLowerCase().includes(normalizedText));

          const matchesCategory = categoryMatches(post.categories, categories);
          const matchesReviewStatus = effectiveReviewStatuses.length === 0 || effectiveReviewStatuses.includes(post.review_status);

          return matchesText && matchesCategory && matchesReviewStatus;
        });

      if (isFocusedRef.current) {
        setPosts(result);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '検索に失敗しました。');
    } finally {
      if (isFocusedRef.current) {
        setLoading(false);
      }
    }
  };

  const applyFilters = (
    staff = selectedStaff,
    roles = selectedRoles,
    period = selectedPeriod,
    manualRange = manualPeriodRange,
    text = searchText,
    categories = selectedCategories,
    mediaTypes = selectedMediaTypes,
    reviewStatuses = selectedReviewStatuses,
    sort = selectedSort,
  ) => {
    if (!activeStoreId) return;
    fetchPosts({
      storeId: activeStoreId,
      staff,
      roles,
      period,
      manualRange,
      text,
      categories,
      mediaTypes,
      reviewStatuses,
      sort,
    });
  };

  const clearCurrentResults = () => {
    setPosts([]);
    setHasSearched(false);
    setSelectedPostIds(new Set());
    setPreviewPost(null);
    setPreviewMediaIndex(0);
  };

  const openCategoryModal = () => {
    setNewCategoryName('');
    setCategoryModalVisible(true);
  };

  const closeCategoryModal = () => {
    setNewCategoryName('');
    setCategoryModalVisible(false);
  };

  const saveCustomCategory = async () => {
    const normalizedCategory = normalizeCategory(newCategoryName);

    if (!normalizedCategory) {
      Alert.alert('エラー', 'カテゴリ名を入力してください。');
      return;
    }

    if (normalizedCategory === 'all' || normalizedCategory === 'すべて' || isHiddenCategory(normalizedCategory)) {
      Alert.alert('エラー', 'このカテゴリ名は使用できません。');
      return;
    }

    const categoryExists = categoryOptions.some(
      option => normalizeCategory(option.value) === normalizedCategory
    );

    if (categoryExists) {
      Alert.alert('エラー', 'このカテゴリは既に存在します。');
      return;
    }

    try {
      if (!activeStoreId) {
        Alert.alert('エラー', '店舗情報を取得できませんでした。');
        return;
      }

      const [stored, legacyStored] = await Promise.all([
        AsyncStorage.getItem(getStoreCustomCategoriesKey(activeStoreId)),
        AsyncStorage.getItem(getLegacyStoreCustomCategoriesKey(activeStoreId)),
      ]);
      const savedCategories = [
        ...parseStoredCategories(stored),
        ...parseStoredCategories(legacyStored),
      ];
      const nextSavedCategories = [...savedCategories, normalizedCategory];

      await AsyncStorage.setItem(getStoreCustomCategoriesKey(activeStoreId), JSON.stringify(nextSavedCategories));

      setCategoryOptions(prev => buildCategoryOptions([
        ...prev.map(option => option.value),
        normalizedCategory,
      ]));
      setSelectedCategories(prev => (
        prev.includes(normalizedCategory) ? prev : [...prev, normalizedCategory]
      ));
      clearCurrentResults();
      closeCategoryModal();
    } catch (error) {
      console.error('Error saving filter category:', error);
      Alert.alert('エラー', 'カテゴリの追加に失敗しました。');
    }
  };

  const resetFilters = () => {
    setSearchText('');
    setSelectedStaff('all');
    setSelectedRoles([]);
    setSelectedPeriod('all');
    setManualPeriodRange(createDefaultManualPeriodRange());
    setTempManualPeriodRange(createDefaultManualPeriodRange());
    setActiveManualDateField(null);
    setManualPeriodModalVisible(false);
    setCategoryModalVisible(false);
    setNewCategoryName('');
    setSelectedCategories([]);
    setSelectedMediaTypes([]);
    setSelectedReviewStatuses([]);
    setSelectedSort('newest');
    setPosts([]);
    setHasSearched(false);
    setSelectedPostIds(new Set());
    setPreviewPost(null);
    setPreviewMediaIndex(0);
  };

  const selectStaff = (value: string) => {
    setSelectedStaff(value);
    clearCurrentResults();
  };

  const handleStaffSelect = (value: string) => {
    selectStaff(value);
    setStaffModalVisible(false);
    setStaffSearchText('');
    setStaffPickerRole('all');
  };

  const selectRole = (value: RoleFilter) => {
    setSelectedRoles(prev => (value === 'all' ? [] : toggleSelection(prev, value)));
    clearCurrentResults();
  };

  const openManualPeriodModal = () => {
    setTempManualPeriodRange(manualPeriodRange);
    setActiveManualDateField(null);
    setManualPeriodModalVisible(true);
  };

  const selectPeriod = (value: PeriodFilter) => {
    if (value === 'custom') {
      openManualPeriodModal();
      return;
    }

    setSelectedPeriod(value);
    clearCurrentResults();
  };

  const updateTempManualDate = (target: ManualDateField, date: Date) => {
    setTempManualPeriodRange(prev => {
      if (target === 'start') {
        const startDate = startOfDay(date);
        const endDate = prev.endDate.getTime() < startDate.getTime()
          ? endOfDay(date)
          : prev.endDate;
        return { startDate, endDate };
      }

      const endDate = endOfDay(date);
      const startDate = prev.startDate.getTime() > endDate.getTime()
        ? startOfDay(date)
        : prev.startDate;
      return { startDate, endDate };
    });
  };

  const handleManualDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android' && event.type === 'dismissed') {
      setActiveManualDateField(null);
      return;
    }

    if (activeManualDateField && date) {
      updateTempManualDate(activeManualDateField, date);
    }

    if (Platform.OS === 'android') {
      setActiveManualDateField(null);
    }
  };

  const applyManualPeriod = () => {
    setManualPeriodRange(tempManualPeriodRange);
    setSelectedPeriod('custom');
    setManualPeriodModalVisible(false);
    setActiveManualDateField(null);
    clearCurrentResults();
  };

  const selectCategory = (value: string) => {
    setSelectedCategories(prev => (value === 'all' ? [] : toggleSelection(prev, value)));
    clearCurrentResults();
  };

  const selectMedia = (value: MediaFilter) => {
    setSelectedMediaTypes(prev => (value === 'all' ? [] : toggleSelection(prev, value)));
    clearCurrentResults();
  };

  const selectReviewStatus = (value: ReviewStatusFilter) => {
    setSelectedReviewStatuses(prev => (value === 'all' ? [] : toggleSelection(prev, value)));
    clearCurrentResults();
  };

  const handleSortSelect = (value: SortFilter) => {
    setSelectedSort(value);
    clearCurrentResults();
    setSortModalVisible(false);
  };

  const getDownloadItems = (post: PostItem): MediaItem[] => {
    if (post.mediaItems.length > 0) return post.mediaItems;
    if (post.media_url) {
      return [{
        id: 'main',
        mediaUrl: post.media_url,
        isVideo: post.is_video,
        displayOrder: 0,
      }];
    }
    return [];
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedPostIds(new Set());
  };

  const toggleAllVisiblePosts = () => {
    if (posts.length === 0) return;
    setSelectedPostIds(prev => {
      const allSelected = posts.every(post => prev.has(post.id));
      return allSelected ? new Set() : new Set(posts.map(post => post.id));
    });
  };

  const openPostPreview = (post: PostItem) => {
    setPreviewPost(post);
    setPreviewMediaIndex(0);
  };

  const handleResultPress = (post: PostItem) => {
    if (selectionMode) {
      togglePostSelection(post.id);
      return;
    }
    openPostPreview(post);
  };

  const updateReviewStatus = async (postIds: string[], status: ReviewStatus) => {
    if (postIds.length === 0) return;

    try {
      setStatusUpdating(true);
      const rpcResult = await supabase.rpc('set_post_review_status', {
        p_post_ids: postIds,
        p_status: status,
      } as any);

      if (rpcResult.error) {
        throw rpcResult.error;
      }

      setPosts(prev => prev.map(post => (
        postIds.includes(post.id)
          ? { ...post, review_status: status }
          : post
      )));
      setPreviewPost(prev => (
        prev && postIds.includes(prev.id)
          ? { ...prev, review_status: status }
          : prev
      ));
      setSelectedPostIds(new Set());

      const statusLabel = getReviewStatusOption(status).label;
      Alert.alert('完了', `${postIds.length}件を「${statusLabel}」に変更しました。`);
    } catch (e: any) {
      Alert.alert('エラー', `ステータス変更に失敗しました。\n${getReviewStatusUpdateErrorMessage(e)}`);
    } finally {
      setStatusUpdating(false);
    }
  };

  const confirmBulkStatusChange = (status: ReviewStatus) => {
    const statusLabel = getReviewStatusOption(status).label;
    Alert.alert(
      '一括ステータス変更',
      `選択中の${selectedPostIds.size}件を「${statusLabel}」に変更しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: statusLabel,
          onPress: () => updateReviewStatus(Array.from(selectedPostIds), status),
        },
      ]
    );
  };

  const executeDownloadPosts = async (targetPosts: PostItem[]) => {
    try {
      setDownloading(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('権限エラー', 'カメラロールへのアクセス権限が必要です。設定からアクセスを許可してください。');
        return;
      }

      if (!FileSystem.cacheDirectory) {
        Alert.alert('エラー', '一時保存先を取得できませんでした。');
        return;
      }

      let successCount = 0;
      let totalCount = 0;

      for (const post of targetPosts) {
        const items = getDownloadItems(post);
        for (const [index, item] of items.entries()) {
          if (!item.mediaUrl) continue;
          totalCount++;
          try {
            let saveUri = item.mediaUrl;
            if (!item.mediaUrl.startsWith('file://')) {
              const ext = item.isVideo ? 'mp4' : 'jpg';
              const fileUri = `${FileSystem.cacheDirectory}filter_${post.id}_${Date.now()}_${index}.${ext}`;
              const downloadUrl = await getSignedPostMediaUrl(item.mediaUrl);
              const result = await FileSystem.downloadAsync(downloadUrl, fileUri);
              if (!result?.uri) continue;
              saveUri = result.uri;
            }
            await MediaLibrary.saveToLibraryAsync(saveUri);
            successCount++;
          } catch (itemError) {
            console.error('Failed to save item:', itemError);
          }
        }
      }

      if (successCount > 0) {
        Alert.alert('保存完了', `${successCount}件のメディアをカメラロールに保存しました。`);
        setSelectedPostIds(new Set());
      } else {
        Alert.alert('エラー', totalCount > 0 ? 'メディアの保存に失敗しました。' : '保存できるメディアがありません。');
      }
    } catch (e: any) {
      Alert.alert('エラー', `保存に失敗しました。\n${e?.message || 'もう一度お試しください。'}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPosts = (targetPosts: PostItem[], confirm = true) => {
    const totalItems = targetPosts.reduce((sum, post) => sum + getDownloadItems(post).length, 0);
    if (targetPosts.length === 0 || totalItems === 0) {
      Alert.alert('エラー', '保存できるメディアがありません。');
      return;
    }

    if (!confirm) {
      executeDownloadPosts(targetPosts);
      return;
    }

    Alert.alert(
      '一括ダウンロード',
      `${targetPosts.length}件の投稿から${totalItems}件のメディアを保存しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '保存', onPress: () => executeDownloadPosts(targetPosts) },
      ]
    );
  };

  const compactFilters = useMemo(() => {
    const chips: string[] = [];
    if (canUseAdminFilters && selectedStaff !== 'all') {
      chips.push(staffOptions.find(staff => staff.user_id === selectedStaff)?.display_name ?? 'スタッフ指定');
    }
    if (canUseAdminFilters) {
      chips.push(...ROLE_OPTIONS
        .filter(option => option.value !== 'all' && selectedRoles.includes(option.value))
        .map(option => option.label));
    }
    if (selectedPeriod !== 'all') {
      chips.push(selectedPeriod === 'custom'
        ? `手動: ${formatDate(manualPeriodRange.startDate)}〜${formatDate(manualPeriodRange.endDate)}`
        : PERIOD_OPTIONS.find(option => option.value === selectedPeriod)?.label ?? '');
    }
    chips.push(...selectedCategories);
    if (canUseAdminFilters) {
      chips.push(...MEDIA_OPTIONS
        .filter(option => option.value !== 'all' && selectedMediaTypes.includes(option.value))
        .map(option => option.label));
      chips.push(...REVIEW_STATUS_FILTER_OPTIONS
        .filter(option => option.value !== 'all' && selectedReviewStatuses.includes(option.value))
        .map(option => option.label));
    }
    return chips.filter(Boolean);
  }, [
    canUseAdminFilters,
    selectedCategories,
    manualPeriodRange,
    selectedMediaTypes,
    selectedPeriod,
    selectedReviewStatuses,
    selectedRoles,
    selectedStaff,
    staffOptions,
  ]);

  const isRoleActive = (value: RoleFilter) => (
    value === 'all' ? selectedRoles.length === 0 : selectedRoles.includes(value)
  );

  const isPeriodActive = (value: PeriodFilter) => (
    value === selectedPeriod
  );

  const isCategoryActive = (value: string) => (
    value === 'all' ? selectedCategories.length === 0 : selectedCategories.includes(value)
  );

  const isMediaActive = (value: MediaFilter) => (
    value === 'all' ? selectedMediaTypes.length === 0 : selectedMediaTypes.includes(value)
  );

  const isReviewStatusActive = (value: ReviewStatusFilter) => (
    value === 'all' ? selectedReviewStatuses.length === 0 : selectedReviewStatuses.includes(value)
  );

  const renderSectionHeader = (title: string, onAllPress?: () => void) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {onAllPress ? (
        <TouchableOpacity onPress={onAllPress} activeOpacity={0.75}>
          <Text style={styles.sectionResetText}>すべて</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const FilterChip = ({
    label,
    active,
    onPress,
  }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: active
            ? ACCENT
            : (isDark ? colors.surface2 : '#F1F2F6'),
          borderColor: active ? ACCENT : (isDark ? colors.border : '#ECEEF3'),
        },
      ]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const IconChip = ({
    label,
    icon,
    active,
    onPress,
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    active: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[
        styles.iconChip,
        {
          backgroundColor: active ? ACCENT_SOFT : colors.surface,
          borderColor: active ? ACCENT : colors.borderLight,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.iconChipIcon, { backgroundColor: active ? '#DFE8FF' : colors.surface2 }]}>
        <Ionicons name={icon} size={20} color={active ? ACCENT : colors.text} />
      </View>
      <Text style={[styles.iconChipText, { color: active ? ACCENT : colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const StaffAvatar = ({ staff, active = false }: { staff?: StaffOption | null; active?: boolean }) => (
    <View
      style={[
        styles.staffAvatarFrame,
        {
          borderColor: active ? ACCENT : colors.borderLight,
          backgroundColor: active ? ACCENT_SOFT : colors.surface2,
        },
      ]}
    >
      {staff?.avatar_url ? (
        <Image
          source={{ uri: resolveAvatarStorageUrl(staff.avatar_url) }}
          style={styles.staffAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`staff-avatar-${staff.user_id}`}
        />
      ) : (
        <Ionicons name={staff ? 'person' : 'people'} size={22} color={active ? ACCENT : colors.textMuted} />
      )}
    </View>
  );

  const StaffRoleSegment = ({ role }: { role: (typeof ROLE_OPTIONS)[number] }) => {
    const active = staffPickerRole === role.value;
    return (
      <TouchableOpacity
        style={[
          styles.staffRoleSegment,
          {
            backgroundColor: active ? ACCENT : (isDark ? colors.surface2 : '#F1F2F6'),
            borderColor: active ? ACCENT : (isDark ? colors.border : '#ECEEF3'),
          },
        ]}
        onPress={() => setStaffPickerRole(role.value)}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <Text style={[styles.staffRoleSegmentText, { color: active ? '#fff' : colors.textSecondary }]}>
          {role.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const ReviewStatusBadge = ({ status, compact = false }: { status: ReviewStatus; compact?: boolean }) => {
    const option = getReviewStatusOption(status);
    return (
      <View
        style={[
          styles.reviewStatusBadge,
          compact && styles.reviewStatusBadgeCompact,
          { backgroundColor: option.backgroundColor, borderColor: option.borderColor },
        ]}
      >
        <Ionicons name={option.icon} size={compact ? 11 : 14} color={option.textColor} />
        <Text
          style={[
            styles.reviewStatusBadgeText,
            compact && styles.reviewStatusBadgeTextCompact,
            { color: option.textColor },
          ]}
          numberOfLines={1}
        >
          {option.label}
        </Text>
      </View>
    );
  };

  const renderFilterPanel = () => (
    <View style={[styles.filterCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.searchBox, { backgroundColor: isDark ? colors.surface2 : '#F3F4F7' }]}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="タイトル・本文で検索..."
          placeholderTextColor={colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={() => applyFilters()}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {canUseAdminFilters && (
        <>
          {renderSectionHeader('スタッフ', () => selectStaff('all'))}
          <TouchableOpacity
            style={[styles.staffSelectButton, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}
            onPress={() => setStaffModalVisible(true)}
            activeOpacity={0.78}
            accessibilityRole="button"
          >
            <View style={styles.staffSelectLeft}>
              <StaffAvatar staff={selectedStaffOption} active={selectedStaff !== 'all'} />
              <View style={styles.staffSelectTextGroup}>
                <Text style={[styles.staffSelectTitle, { color: colors.text }]} numberOfLines={1}>
                  {selectedStaffLabel}
                </Text>
                <Text style={[styles.staffSelectMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {selectedStaffMeta}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {renderSectionHeader('役割', () => selectRole('all'))}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {ROLE_OPTIONS.map(role => (
              <FilterChip
                key={role.value}
                label={role.label}
                active={isRoleActive(role.value)}
                onPress={() => selectRole(role.value)}
              />
            ))}
          </ScrollView>
        </>
      )}

      {renderSectionHeader('期間', () => selectPeriod('all'))}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PERIOD_OPTIONS.map(period => (
          <FilterChip
            key={period.value}
            label={period.label}
            active={isPeriodActive(period.value)}
            onPress={() => selectPeriod(period.value)}
          />
        ))}
      </ScrollView>
      <View style={[styles.periodPreview, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.periodPreviewText, { color: colors.text }]}>{getPeriodLabel(selectedPeriod, manualPeriodRange)}</Text>
      </View>

      {renderSectionHeader('カテゴリ', () => selectCategory('all'))}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categoryOptions.map(category => (
          <IconChip
            key={category.value}
            label={category.label}
            icon={category.icon}
            active={isCategoryActive(category.value)}
            onPress={() => selectCategory(category.value)}
          />
        ))}
        <TouchableOpacity
          style={[
            styles.iconChip,
            styles.addCategoryChip,
            {
              backgroundColor: colors.surface,
              borderColor: ACCENT,
            },
          ]}
          onPress={openCategoryModal}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="カテゴリを追加"
        >
          <View style={[styles.iconChipIcon, styles.addCategoryIcon]}>
            <Ionicons name="add" size={22} color={ACCENT} />
          </View>
          <Text style={[styles.iconChipText, styles.addCategoryText]} numberOfLines={1}>
            追加
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {canUseAdminFilters && (
        <>
          {renderSectionHeader('メディア種別', () => selectMedia('all'))}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {MEDIA_OPTIONS.map(media => (
              <FilterChip
                key={media.value}
                label={media.label}
                active={isMediaActive(media.value)}
                onPress={() => selectMedia(media.value)}
              />
            ))}
          </ScrollView>

          {renderSectionHeader('承認ステータス', () => selectReviewStatus('all'))}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {REVIEW_STATUS_FILTER_OPTIONS.map(status => (
              <IconChip
                key={status.value}
                label={status.label}
                icon={status.icon}
                active={isReviewStatusActive(status.value)}
                onPress={() => selectReviewStatus(status.value)}
              />
            ))}
          </ScrollView>

          <Text style={[styles.sectionTitle, styles.sortLabel, { color: colors.text }]}>並び順</Text>
          <TouchableOpacity
            style={[styles.sortSelect, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}
            onPress={() => setSortModalVisible(true)}
            activeOpacity={0.78}
          >
            <View style={styles.sortSelectLeft}>
              <Ionicons name={sortOption.icon} size={19} color={ACCENT} />
              <Text style={[styles.sortSelectText, { color: colors.text }]}>{sortOption.label}</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </>
      )}

      {compactFilters.length > 0 && (
        <View style={styles.activeFilterRow}>
          {compactFilters.map((filter, index) => (
            <View key={`${filter}-${index}`} style={styles.activeFilterPill}>
              <Text style={styles.activeFilterText}>{filter}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderSearchButtonLabel = () => {
    if (loading && hasSearched) return '検索中...';
    if (hasSearched) return `この条件で検索する（${posts.length}件）`;
    return 'この条件で検索する';
  };

  const renderFixedSearchButton = () => (
    <View style={[styles.fixedSearchBar, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        style={[styles.searchButton, loading && styles.searchButtonDisabled]}
        onPress={() => applyFilters()}
        activeOpacity={0.86}
        accessibilityRole="button"
        disabled={loading}
      >
        <LinearGradient colors={['#2196F3', '#1976D2']} style={styles.searchButtonGradient}>
          <Text style={styles.searchButtonText}>{renderSearchButtonLabel()}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderSelectionActionBar = () => (
    <View style={[styles.selectionActionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <View style={styles.selectionActionHeader}>
        <Text style={[styles.selectionActionCount, { color: colors.text }]}>
          {selectedPostIds.size}件選択中
        </Text>
        <TouchableOpacity onPress={clearSelection} activeOpacity={0.75} style={styles.selectionCancelButton}>
          <Ionicons name="close" size={16} color={colors.textSecondary} />
          <Text style={[styles.selectionCancelText, { color: colors.textSecondary }]}>解除</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.selectionActionRow}>
        <TouchableOpacity
          style={[styles.selectionActionButton, styles.selectionApproveButton]}
          onPress={() => confirmBulkStatusChange('approved')}
          activeOpacity={0.82}
          disabled={statusUpdating || downloading}
        >
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.selectionActionButtonText}>一括承認</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectionActionButton, styles.selectionRejectButton]}
          onPress={() => confirmBulkStatusChange('rejected')}
          activeOpacity={0.82}
          disabled={statusUpdating || downloading}
        >
          <Ionicons name="close-circle" size={18} color="#fff" />
          <Text style={styles.selectionActionButtonText}>一括却下</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectionActionButton, styles.selectionDownloadButton]}
          onPress={() => handleDownloadPosts(selectedPosts)}
          activeOpacity={0.82}
          disabled={statusUpdating || downloading}
        >
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.selectionActionButtonText}>{downloading ? '保存中' : '保存'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStaffOptionRow = (staff?: StaffOption) => {
    const isAll = !staff;
    const active = isAll ? selectedStaff === 'all' : selectedStaff === staff.user_id;
    const roleLabel = isAll ? `${staffOptions.length}名` : getStoreRoleLabel(staff.role);

    return (
      <TouchableOpacity
        key={staff?.user_id ?? 'all'}
        style={[
          styles.staffOptionRow,
          active && styles.staffOptionRowActive,
        ]}
        onPress={() => handleStaffSelect(staff?.user_id ?? 'all')}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <StaffAvatar staff={staff} active={active} />
        <View style={styles.staffOptionInfo}>
          <Text style={[styles.staffOptionName, { color: active ? ACCENT : colors.text }]} numberOfLines={1}>
            {staff?.display_name ?? 'すべてのスタッフ'}
          </Text>
          {staff?.username ? (
            <Text style={[styles.staffOptionUsername, { color: colors.textMuted }]} numberOfLines={1}>
              @{staff.username}
            </Text>
          ) : null}
        </View>
        <View style={[styles.staffRoleBadge, { backgroundColor: active ? '#DFE8FF' : colors.surface2 }]}>
          <Text style={[styles.staffRoleBadgeText, { color: active ? ACCENT : colors.textSecondary }]}>
            {roleLabel}
          </Text>
        </View>
        {active && <Ionicons name="checkmark-circle" size={20} color={ACCENT} />}
      </TouchableOpacity>
    );
  };

  const renderStaffModal = () => (
    <Modal
      visible={staffModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setStaffModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setStaffModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.staffModal, { backgroundColor: colors.surface }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.modalHandle} />
          <View style={styles.staffModalHeader}>
            <Text style={[styles.staffModalTitle, { color: colors.text }]}>スタッフを選択</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setStaffModalVisible(false)}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.staffModalSearch, { backgroundColor: isDark ? colors.surface2 : '#F3F4F7' }]}>
            <Ionicons name="search-outline" size={19} color={colors.textMuted} />
            <TextInput
              style={[styles.staffModalSearchInput, { color: colors.text }]}
              placeholder="スタッフ名で検索..."
              placeholderTextColor={colors.textMuted}
              value={staffSearchText}
              onChangeText={setStaffSearchText}
              returnKeyType="search"
            />
            {staffSearchText.length > 0 && (
              <TouchableOpacity onPress={() => setStaffSearchText('')} hitSlop={8}>
                <Ionicons name="close-circle" size={19} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.staffRoleFilterRow}>
            {ROLE_OPTIONS.map(role => (
              <StaffRoleSegment key={role.value} role={role} />
            ))}
          </View>

          <FlatList
            data={filteredStaffOptions}
            keyExtractor={item => item.user_id}
            renderItem={({ item }) => renderStaffOptionRow(item)}
            ListHeaderComponent={renderStaffOptionRow()}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.staffOptionList}
            ListEmptyComponent={
              <View style={styles.staffEmptyContainer}>
                <Ionicons name="people-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.staffEmptyText, { color: colors.textMuted }]}>該当するスタッフがいません</Text>
              </View>
            }
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const renderManualPeriodModal = () => {
    const activePickerValue = activeManualDateField === 'start'
      ? tempManualPeriodRange.startDate
      : tempManualPeriodRange.endDate;
    const pickerDisplay = Platform.OS === 'ios' ? 'inline' : 'calendar';

    const renderDateField = (target: ManualDateField, label: string, date: Date) => {
      const active = activeManualDateField === target;

      return (
        <TouchableOpacity
          style={[
            styles.manualDateField,
            {
              borderColor: active ? ACCENT : colors.borderLight,
              backgroundColor: active ? ACCENT_SOFT : colors.surface,
            },
          ]}
          onPress={() => setActiveManualDateField(target)}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
        >
          <View>
            <Text style={[styles.manualDateLabel, { color: colors.textMuted }]}>{label}</Text>
            <Text style={[styles.manualDateValue, { color: colors.text }]}>{formatDate(date)}</Text>
          </View>
          <Ionicons name="calendar-outline" size={20} color={active ? ACCENT : colors.textMuted} />
        </TouchableOpacity>
      );
    };

    return (
      <Modal
        visible={manualPeriodModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManualPeriodModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setManualPeriodModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="手動期間選択を閉じる"
          />
          <View style={[styles.manualPeriodModal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.staffModalHeader}>
              <Text style={[styles.staffModalTitle, { color: colors.text }]}>期間を選択</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setManualPeriodModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.manualDateRow}>
              {renderDateField('start', '開始日', tempManualPeriodRange.startDate)}
              {renderDateField('end', '終了日', tempManualPeriodRange.endDate)}
            </View>

            {activeManualDateField ? (
              <View style={[styles.manualPickerWrap, { borderColor: colors.borderLight, backgroundColor: colors.surface2 }]}>
                <DateTimePicker
                  value={activePickerValue}
                  mode="date"
                  display={pickerDisplay}
                  maximumDate={endOfDay(new Date())}
                  onChange={handleManualDateChange}
                  locale="ja-JP"
                />
              </View>
            ) : null}

            <View style={styles.manualPeriodActions}>
              <TouchableOpacity
                style={[styles.manualPeriodSecondaryButton, { borderColor: colors.borderLight }]}
                onPress={() => setManualPeriodModalVisible(false)}
                activeOpacity={0.78}
              >
                <Text style={[styles.manualPeriodSecondaryText, { color: colors.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.manualPeriodPrimaryButton}
                onPress={applyManualPeriod}
                activeOpacity={0.84}
              >
                <Text style={styles.manualPeriodPrimaryText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderCategoryModal = () => (
    <Modal
      visible={categoryModalVisible}
      transparent
      animationType="fade"
      onRequestClose={closeCategoryModal}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeCategoryModal}
          accessibilityRole="button"
          accessibilityLabel="カテゴリ追加を閉じる"
        />
        <View style={[styles.manualPeriodModal, { backgroundColor: colors.surface }]}>
          <View style={styles.modalHandle} />
          <View style={styles.staffModalHeader}>
            <Text style={[styles.staffModalTitle, { color: colors.text }]}>カテゴリを追加</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeCategoryModal}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.categoryModalInputWrap, { backgroundColor: isDark ? colors.surface2 : '#F3F4F7' }]}>
            <Ionicons name="pricetag-outline" size={19} color={colors.textMuted} />
            <TextInput
              style={[styles.categoryModalInput, { color: colors.text }]}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="カテゴリ名を入力"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              autoFocus
              onSubmitEditing={saveCustomCategory}
            />
            {newCategoryName.length > 0 && (
              <TouchableOpacity onPress={() => setNewCategoryName('')} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.manualPeriodActions}>
            <TouchableOpacity
              style={[styles.manualPeriodSecondaryButton, { borderColor: colors.borderLight }]}
              onPress={closeCategoryModal}
              activeOpacity={0.78}
            >
              <Text style={[styles.manualPeriodSecondaryText, { color: colors.textSecondary }]}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manualPeriodPrimaryButton}
              onPress={saveCustomCategory}
              activeOpacity={0.84}
            >
              <Text style={styles.manualPeriodPrimaryText}>追加</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderPreviewModal = () => {
    if (!previewPost) return null;

    const mediaItems = getDownloadItems(previewPost);
    const safeMediaIndex = mediaItems.length > 0
      ? Math.min(previewMediaIndex, mediaItems.length - 1)
      : 0;
    const activeMedia = mediaItems[safeMediaIndex];
    const createdDate = new Date(previewPost.created_at);
    const categoryLabels = previewPost.categories.length > 0
      ? previewPost.categories
      : [previewPost.is_video ? '動画' : '写真'];

    return (
      <Modal
        visible={Boolean(previewPost)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPost(null)}
      >
        <View style={styles.previewOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPreviewPost(null)}
            accessibilityRole="button"
            accessibilityLabel="投稿プレビューを閉じる"
          />
          <View style={[styles.previewModal, { backgroundColor: colors.surface }]}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderText}>
                <Text style={[styles.previewTitle, { color: colors.text }]} numberOfLines={1}>
                  投稿プレビュー
                </Text>
                <Text style={[styles.previewSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {previewPost.users?.display_name ?? 'ユーザー'} ・ {getRelativeTime(createdDate)}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setPreviewPost(null)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.previewScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.previewScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <View style={[styles.previewMediaWrap, { backgroundColor: colors.surface2 }]}>
                {activeMedia?.mediaUrl ? (
                  activeMedia.isVideo ? (
                    <Video
                      source={{ uri: resolvePostStorageUrl(activeMedia.mediaUrl) }}
                      style={styles.previewMedia}
                      resizeMode={ResizeMode.CONTAIN}
                      useNativeControls
                    />
                  ) : (
                    <Image
                      source={{ uri: resolvePostStorageUrl(activeMedia.mediaUrl) }}
                      style={styles.previewMedia}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      recyclingKey={`filter-preview-${activeMedia.id}`}
                    />
                  )
                ) : (
                  <View style={styles.previewMediaFallback}>
                    <Ionicons name="image-outline" size={44} color={colors.textMuted} />
                  </View>
                )}
              </View>

              {mediaItems.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.previewThumbRow}
                >
                  {mediaItems.map((mediaItem, index) => {
                    const active = safeMediaIndex === index;
                    const thumbnailKey = getMediaThumbnailKey(previewPost.id, mediaItem);
                    const thumbnailFailed = mediaItem.isVideo
                      ? failedVideoThumbnailKeys.has(thumbnailKey)
                      : thumbnailErrors.has(thumbnailKey);
                    const thumbnailUrl = getMediaThumbnailUrl(mediaItem.mediaUrl);
                    const repairedThumbnailUrl = repairedVideoThumbnailUrls[thumbnailKey] ?? thumbnailUrl;
                    const hasThumbnail = hasDedicatedThumbnail(mediaItem.mediaUrl);
                    const resolvedThumbnailUrl = mediaItem.isVideo
                      ? resolveVideoThumbnailStorageUrl(repairedThumbnailUrl)
                      : resolvePostStorageUrl(thumbnailUrl);
                    return (
                      <TouchableOpacity
                        key={`${mediaItem.id}-${index}`}
                        style={[
                          styles.previewThumb,
                          {
                            borderColor: active ? ACCENT : colors.borderLight,
                            backgroundColor: colors.surface2,
                          },
                        ]}
                        onPress={() => setPreviewMediaIndex(index)}
                        activeOpacity={0.78}
                      >
                        {thumbnailFailed || (mediaItem.isVideo && !hasThumbnail) || !resolvedThumbnailUrl ? (
                          <View style={styles.previewThumbVideo}>
                            <Ionicons
                              name={mediaItem.isVideo ? 'play' : 'image-outline'}
                              size={18}
                              color={active ? ACCENT : colors.textMuted}
                            />
                          </View>
                        ) : (
                          <Image
                            source={{ uri: resolvedThumbnailUrl }}
                            style={styles.previewThumbImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={`filter-preview-thumb-${thumbnailKey}`}
                            onError={() => {
                              if (mediaItem.isVideo && hasThumbnail) {
                                repairVideoThumbnail(thumbnailKey, mediaItem.mediaUrl, { force: true });
                              } else if (!thumbnailFailed && hasThumbnail) {
                                setThumbnailErrors(prev => new Set(prev).add(thumbnailKey));
                              }
                            }}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <View style={styles.previewMetaBlock}>
                <View style={styles.previewStatusRow}>
                  <ReviewStatusBadge status={previewPost.review_status} />
                </View>

                <Text style={[styles.previewPostTitle, { color: colors.text }]} numberOfLines={2}>
                  {previewPost.title || '無題'}
                </Text>
                <Text style={[styles.previewPostMenu, { color: colors.textSecondary }]}>
                  {previewPost.displayMenuName || 'メモなし'}
                </Text>

                <View style={styles.previewCategoryList}>
                  {categoryLabels.map(category => (
                    <View key={category} style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText} numberOfLines={1}>{category}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {canUseAdminFilters && (
                <View style={styles.previewStatusSection}>
                  <Text style={[styles.previewSectionTitle, { color: colors.text }]}>ステータス変更</Text>
                  <View style={styles.previewStatusActions}>
                    {REVIEW_STATUS_OPTIONS.map(option => {
                      const active = previewPost.review_status === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.previewStatusButton,
                            {
                              backgroundColor: active ? option.backgroundColor : colors.surface,
                              borderColor: active ? option.borderColor : colors.borderLight,
                            },
                          ]}
                          onPress={() => updateReviewStatus([previewPost.id], option.value)}
                          activeOpacity={0.78}
                          disabled={statusUpdating || active}
                        >
                          <Ionicons name={option.icon} size={17} color={option.textColor} />
                          <Text style={[styles.previewStatusButtonText, { color: option.textColor }]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            {canUseAdminFilters && (
              <View style={[styles.previewFooter, { borderTopColor: colors.borderLight }]}>
                <TouchableOpacity
                  style={[styles.previewFooterButton, downloading && styles.searchButtonDisabled]}
                  onPress={() => handleDownloadPosts([previewPost], false)}
                  activeOpacity={0.84}
                  disabled={downloading}
                >
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={styles.previewFooterButtonText}>{downloading ? '保存中...' : 'この投稿を保存'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const renderResultCard = ({ item }: { item: PostItem; index: number }) => {
    const media = item.mediaItems[0];
    const thumbnailKey = media ? getMediaThumbnailKey(item.id, media) : '';
    const thumbnailFailed = media?.isVideo
      ? failedVideoThumbnailKeys.has(thumbnailKey)
      : thumbnailErrors.has(thumbnailKey);
    const thumbnailUrl = media ? getMediaThumbnailUrl(media.mediaUrl) : '';
    const repairedThumbnailUrl = media ? repairedVideoThumbnailUrls[thumbnailKey] ?? thumbnailUrl : '';
    const hasThumbnail = media ? hasDedicatedThumbnail(media.mediaUrl) : false;
    const resolvedThumbnailUrl = media?.isVideo
      ? resolveVideoThumbnailStorageUrl(repairedThumbnailUrl)
      : resolvePostStorageUrl(thumbnailUrl);
    const createdDate = new Date(item.created_at);
    const selected = canUseAdminFilters && selectedPostIds.has(item.id);
    const categoryLabels = item.categories.length > 0
      ? item.categories
      : [item.is_video ? '動画' : '写真'];

    return (
      <TouchableOpacity
        style={[
          styles.resultCard,
          {
            backgroundColor: selected ? ACCENT_SOFT : colors.surface,
            borderColor: selected ? ACCENT : colors.borderLight,
          },
        ]}
        activeOpacity={0.82}
        onPress={() => handleResultPress(item)}
        onLongPress={canUseAdminFilters ? () => togglePostSelection(item.id) : undefined}
      >
        <View style={[styles.thumbnailWrap, { backgroundColor: colors.surface2 }]}>
          {media?.mediaUrl ? (
            media.isVideo ? (
              !thumbnailFailed && hasDedicatedThumbnail(media.mediaUrl) && resolvedThumbnailUrl ? (
                <Image
                  source={{ uri: resolvedThumbnailUrl }}
                  style={styles.thumbnail}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={`filter-result-${thumbnailKey}`}
                  onError={() => repairVideoThumbnail(thumbnailKey, media.mediaUrl, { force: true })}
                />
              ) : (
                <View style={styles.thumbnailFallback}>
                  <Ionicons name="videocam-outline" size={30} color={colors.textMuted} />
                </View>
              )
            ) : thumbnailFailed ? (
              <View style={styles.thumbnailFallback}>
                <Ionicons name="image-outline" size={28} color={colors.textMuted} />
              </View>
            ) : (
              <Image
                source={{ uri: resolvedThumbnailUrl }}
                style={styles.thumbnail}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={`filter-result-${thumbnailKey}`}
                onError={() => {
                  if (!thumbnailFailed && hasThumbnail) {
                    setThumbnailErrors(prev => new Set(prev).add(thumbnailKey));
                  }
                }}
              />
            )
          ) : (
            <View style={styles.thumbnailFallback}>
              <Ionicons name="image-outline" size={28} color={colors.textMuted} />
            </View>
          )}
          {canUseAdminFilters && (
            <TouchableOpacity
              style={[
                styles.cardSelectButton,
                selected && styles.cardSelectButtonActive,
              ]}
              onPress={(event) => {
                event.stopPropagation();
                togglePostSelection(item.id);
              }}
              activeOpacity={0.82}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
            >
              {selected ? (
                <Ionicons name="checkmark" size={15} color="#fff" />
              ) : (
                <Ionicons name="ellipse-outline" size={17} color="#fff" />
              )}
            </TouchableOpacity>
          )}
          {media?.isVideo && (
            <View style={styles.videoBadge}>
              <Ionicons name="play" size={12} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.categoryBadgeList}>
          {categoryLabels.map(category => (
            <View key={category} style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText} numberOfLines={1}>{category}</Text>
            </View>
          ))}
        </View>
        <ReviewStatusBadge status={item.review_status} compact />

        <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title || '無題'}
        </Text>
        <Text style={[styles.resultMenu, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.displayMenuName || 'メモなし'}
        </Text>
        <View style={styles.resultMetaRow}>
          <Text style={[styles.resultMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {item.users?.display_name ?? 'ユーザー'}
          </Text>
          <Text style={[styles.resultMeta, { color: colors.textMuted }]}>
            {getRelativeTime(createdDate)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <>
      {renderFilterPanel()}
      {hasSearched && (
        <View style={styles.resultHeader}>
          <Text style={[styles.resultCount, { color: colors.text }]}>
            {posts.length}件の投稿が見つかりました
          </Text>
          <View style={styles.resultHeaderActions}>
            {canUseAdminFilters && posts.length > 0 && (
              <TouchableOpacity onPress={toggleAllVisiblePosts} activeOpacity={0.75} style={styles.resultSelectButton}>
                <Ionicons
                  name={posts.every(post => selectedPostIds.has(post.id)) ? 'checkmark-done-outline' : 'checkmark-circle-outline'}
                  size={15}
                  color={ACCENT}
                />
                <Text style={styles.resultSelectText}>
                  {posts.every(post => selectedPostIds.has(post.id)) ? '解除' : '選択'}
                </Text>
              </TouchableOpacity>
            )}
            {canUseAdminFilters && (
              <TouchableOpacity onPress={() => setSortModalVisible(true)} activeOpacity={0.75} style={styles.resultSortButton}>
                <Text style={styles.resultSortText}>{sortOption.label.replace('（投稿日）', '')}</Text>
                <Ionicons name="chevron-down" size={16} color={ACCENT} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>フィルタ検索</Text>
        <TouchableOpacity style={styles.resetButton} onPress={resetFilters} activeOpacity={0.75}>
          <Text style={styles.resetButtonText}>リセット</Text>
        </TouchableOpacity>
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderResultCard}
          keyExtractor={item => item.id}
          numColumns={2}
          extraData={[selectedPostIds, currentUserRole]}
          columnWrapperStyle={posts.length > 0 ? styles.resultGridRow : undefined}
          contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={renderListHeader()}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                {hasSearched ? '条件に一致する投稿がありません' : '条件を選んで検索してください'}
              </Text>
              <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
                {hasSearched ? '条件を減らしてもう一度検索してください' : '検索結果はここに表示されます'}
              </Text>
            </View>
          }
        />
      )}

      {selectionMode ? renderSelectionActionBar() : (activeStoreId ? renderFixedSearchButton() : null)}

      {loading && posts.length > 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={ACCENT} />
        </View>
      )}

      {renderStaffModal()}
      {renderManualPeriodModal()}
      {renderCategoryModal()}
      {renderPreviewModal()}

      <Modal
        visible={sortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSortModalVisible(false)}
        >
          <View style={[styles.sortModal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sortModalTitle, { color: colors.text }]}>並び順</Text>
            {SORT_OPTIONS.map(option => {
              const active = selectedSort === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.sortOption, active && styles.sortOptionActive]}
                  onPress={() => handleSortSelect(option.value)}
                  activeOpacity={0.78}
                >
                  <View style={styles.sortOptionLeft}>
                    <Ionicons name={option.icon} size={20} color={active ? ACCENT : colors.textSecondary} />
                    <Text style={[styles.sortOptionText, { color: active ? ACCENT : colors.text }]}>
                      {option.label}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={20} color={ACCENT} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  navButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    position: 'absolute',
    left: 92,
    right: 92,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
  },
  resetButton: {
    minWidth: 68,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  resetButtonText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 132,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 132,
  },
  filterCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 3,
  },
  searchBox: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  sectionResetText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '800',
  },
  staffSelectButton: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  staffSelectLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  staffSelectTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  staffSelectTitle: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  staffSelectMeta: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  staffAvatarFrame: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  staffAvatar: {
    width: '100%',
    height: '100%',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '800',
  },
  periodPreview: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    marginBottom: 18,
  },
  periodPreviewText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryRow: {
    gap: 10,
    paddingBottom: 18,
  },
  iconChip: {
    width: 72,
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 5,
  },
  iconChipIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconChipText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  addCategoryChip: {
    borderStyle: 'dashed',
  },
  addCategoryIcon: {
    backgroundColor: ACCENT_SOFT,
  },
  addCategoryText: {
    color: ACCENT,
  },
  sortLabel: {
    marginBottom: 10,
  },
  sortSelect: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sortSelectText: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  activeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  activeFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: ACCENT_SOFT,
  },
  activeFilterText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '800',
  },
  fixedSearchBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    zIndex: 20,
  },
  searchButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  searchButtonDisabled: {
    opacity: 0.72,
  },
  searchButtonGradient: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  selectionActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 8,
    zIndex: 30,
  },
  selectionActionHeader: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectionActionCount: {
    fontSize: 13,
    fontWeight: '900',
  },
  selectionCancelButton: {
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  selectionCancelText: {
    fontSize: 12,
    fontWeight: '800',
  },
  selectionActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectionActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  selectionApproveButton: {
    backgroundColor: ACCENT,
  },
  selectionRejectButton: {
    backgroundColor: ACCENT,
  },
  selectionDownloadButton: {
    flex: 0.74,
    backgroundColor: ACCENT,
  },
  selectionActionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  resultCount: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  resultHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  resultSelectButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: ACCENT_SOFT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultSelectText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '800',
  },
  resultSortButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: ACCENT_SOFT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultSortText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '800',
  },
  resultGridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  thumbnailWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 11,
    overflow: 'hidden',
    marginBottom: 8,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardSelectButton: {
    position: 'absolute',
    top: 7,
    left: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(0,0,0,0.32)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardSelectButtonActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  categoryBadgeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 7,
  },
  categoryBadge: {
    maxWidth: '100%',
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: ACCENT_SOFT,
    justifyContent: 'center',
  },
  categoryBadgeText: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '900',
  },
  reviewStatusBadge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewStatusBadgeCompact: {
    minHeight: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    marginBottom: 6,
  },
  reviewStatusBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  reviewStatusBadgeTextCompact: {
    fontSize: 10,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  resultMenu: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 1,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 4,
  },
  resultMeta: {
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    right: 18,
    bottom: 92,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  emptyContainer: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 74,
    paddingBottom: 16,
  },
  staffModal: {
    flex: 1,
    maxHeight: '92%',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  manualPeriodModal: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8DEE8',
    marginBottom: 14,
  },
  staffModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  staffModalTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F2F6',
  },
  staffModalSearch: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  staffModalSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  categoryModalInputWrap: {
    minHeight: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  categoryModalInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 0,
  },
  manualDateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  manualDateField: {
    flex: 1,
    minHeight: 66,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  manualDateLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  manualDateValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  manualPickerWrap: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  manualPeriodActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  manualPeriodSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualPeriodSecondaryText: {
    fontSize: 14,
    fontWeight: '900',
  },
  manualPeriodPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  manualPeriodPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  staffRoleFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  staffRoleSegment: {
    minWidth: 64,
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  staffRoleSegmentText: {
    fontSize: 12,
    fontWeight: '900',
  },
  staffOptionList: {
    paddingBottom: 10,
  },
  staffOptionRow: {
    minHeight: 60,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  staffOptionRowActive: {
    backgroundColor: ACCENT_SOFT,
  },
  staffOptionInfo: {
    flex: 1,
    minWidth: 0,
  },
  staffOptionName: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  staffOptionUsername: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  staffRoleBadge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  staffRoleBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  staffEmptyContainer: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  staffEmptyText: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 28,
  },
  previewModal: {
    maxHeight: '92%',
    width: '100%',
    flexShrink: 1,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  previewHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  previewSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  previewScrollView: {
    flexShrink: 1,
  },
  previewScroll: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  previewMediaWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewMedia: {
    width: '100%',
    height: '100%',
  },
  previewMediaFallback: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewThumbRow: {
    gap: 8,
    paddingVertical: 12,
  },
  previewThumb: {
    width: 54,
    height: 54,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewThumbImage: {
    width: '100%',
    height: '100%',
  },
  previewThumbVideo: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewMetaBlock: {
    paddingTop: 12,
  },
  previewStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  previewPostTitle: {
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
  },
  previewPostMenu: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 3,
  },
  previewCategoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  previewStatusSection: {
    marginTop: 18,
  },
  previewSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },
  previewStatusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewStatusButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  previewStatusButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },
  previewFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  previewFooterButton: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  previewFooterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  sortModal: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  sortModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  sortOption: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortOptionActive: {
    backgroundColor: ACCENT_SOFT,
  },
  sortOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
