import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { authService, storeService, supabase } from '@/lib/supabase';
import { useSignedStorageUrlResolver } from '@/lib/signedStorageUrls';
import { getStoreRoleLabel, isStoreAdminRole, normalizeStoreMemberRole } from '@/lib/storeRoles';
import type { StoreMemberRole } from '@/lib/storeRoles';
import { useAppTheme } from '@/lib/ThemeContext';

type PeriodFilter = 'month' | 'all' | 'custom';
type StaffSort = 'posts' | 'approved';
type DatePickerTarget = 'start' | 'end';
type SummaryModalType = 'staff';
type ReviewStatus = 'pending' | 'approved' | 'revision_requested' | 'rejected';

interface CustomRange {
  startDate: Date;
  endDate: Date;
}

interface StaffMember {
  id: string;
  user_id: string;
  role: StoreMemberRole;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface PostRecord {
  id: string;
  user_id: string;
  created_at: string;
  review_status: ReviewStatus;
}

interface StaffSummary extends StaffMember {
  postCount: number;
  approvedCount: number;
  approvalRate: number;
}

interface PeriodBucket {
  key: string;
  label: string;
  sortTime: number;
  postCount: number;
  approvedCount: number;
  approvalRate: number;
}

const ACCENT = '#2196F3';
const APPROVED = '#1E9B50';
const WARNING = '#E07B00';
const NEUTRAL = '#64748B';

const PERIOD_OPTIONS: {
  label: string;
  value: PeriodFilter;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { label: '全期間', value: 'all', icon: 'albums-outline' },
  { label: '今月', value: 'month', icon: 'calendar-number-outline' },
  { label: '手動', value: 'custom', icon: 'calendar-clear-outline' },
];

const STAFF_SORT_OPTIONS: {
  label: string;
  value: StaffSort;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { label: '投稿数順', value: 'posts', icon: 'images-outline' },
  { label: '採用数順', value: 'approved', icon: 'checkmark-circle-outline' },
];

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const startOfMonth = (date: Date) => {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
};

const formatDate = (value: Date) => (
  `${value.getFullYear()}/${value.getMonth() + 1}/${value.getDate()}`
);

const formatShortDate = (value: Date) => (
  `${value.getMonth() + 1}/${value.getDate()}`
);

const formatMonth = (value: Date) => (
  `${value.getFullYear()}/${value.getMonth() + 1}`
);

const formatRate = (value: number) => {
  if (!Number.isFinite(value)) return '0%';
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
};

const getRateBarWidth = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0%' as const;
  const width = Math.min(100, Math.max(0, value));
  return `${width}%` as `${number}%`;
};

const getInitial = (name: string) => {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0) : '?';
};

const isMissingReviewStatusError = (error: any) => {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;
  return error?.code === '42703' || error?.code === 'PGRST204' || message.includes('review_status');
};

const normalizeReviewStatus = (status: unknown): ReviewStatus => {
  if (
    status === 'approved'
    || status === 'revision_requested'
    || status === 'rejected'
    || status === 'pending'
  ) {
    return status;
  }

  return 'pending';
};

const getDefaultCustomRange = (): CustomRange => {
  const today = new Date();
  return {
    startDate: startOfMonth(today),
    endDate: today,
  };
};

const getPeriodRange = (period: PeriodFilter, customRange: CustomRange) => {
  const now = new Date();

  switch (period) {
    case 'month':
      return {
        startDate: startOfMonth(now),
        endDate: endOfDay(now),
        label: '今月',
      };
    case 'all':
      return {
        startDate: null,
        endDate: null,
        label: '全期間',
      };
    case 'custom': {
      const startDate = startOfDay(customRange.startDate);
      const endDate = endOfDay(customRange.endDate);
      return {
        startDate,
        endDate,
        label: `手動: ${formatDate(startDate)}〜${formatDate(endDate)}`,
      };
    }
    default:
      return {
        startDate: startOfMonth(now),
        endDate: endOfDay(now),
        label: '今月',
      };
  }
};

async function loadStoreMembers(storeId: string): Promise<StaffMember[]> {
  const rpcResult = await supabase.rpc('get_store_members_with_profiles', {
    p_store_id: storeId,
  } as any);

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return rpcResult.data.map((member: any) => ({
      id: member.id ?? `${storeId}:${member.user_id}`,
      user_id: member.user_id,
      role: normalizeStoreMemberRole(member.role),
      display_name: member.display_name ?? member.username ?? 'ユーザー',
      username: member.username ?? '',
      avatar_url: member.avatar_url ?? null,
    }));
  }

  if (rpcResult.error) {
    console.warn('get_store_members_with_profiles fallback:', rpcResult.error.message);
  }

  const { data: membersData, error } = await supabase
    .from('store_members')
    .select('id, user_id, role, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const userIds = (membersData ?? []).map(member => member.user_id);

  const { data: profiles } = userIds.length > 0
    ? await supabase
      .from('public_profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map(profile => [profile.id, profile]));

  return (membersData ?? []).map(member => {
    const profile = profileMap.get(member.user_id);
    return {
      id: member.id,
      user_id: member.user_id,
      role: normalizeStoreMemberRole(member.role),
      display_name: profile?.display_name ?? profile?.username ?? 'ユーザー',
      username: profile?.username ?? '',
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

async function loadProfilesAsMembers(storeId: string, userIds: string[]): Promise<StaffMember[]> {
  if (userIds.length === 0) return [];

  const { data } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map((data ?? []).map(profile => [profile.id, profile]));

  return userIds.map(userId => {
    const profile = profileMap.get(userId);
    return {
      id: `${storeId}:${userId}:former`,
      user_id: userId,
      role: 'staff',
      display_name: profile?.display_name ?? profile?.username ?? '退会済みスタッフ',
      username: profile?.username ?? '',
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

async function loadPosts(storeId: string, period: PeriodFilter, customRange: CustomRange) {
  const range = getPeriodRange(period, customRange);

  const buildQuery = (columns: string) => {
    let query = supabase
      .from('posts')
      .select(columns)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (range.startDate) query = query.gte('created_at', range.startDate.toISOString());
    if (range.endDate) query = query.lte('created_at', range.endDate.toISOString());

    return query;
  };

  let result: { data: any[] | null; error: any } = await buildQuery('id, user_id, created_at, review_status');
  let missingReviewStatus = false;

  if (result.error && isMissingReviewStatusError(result.error)) {
    missingReviewStatus = true;
    result = await buildQuery('id, user_id, created_at');
  }

  if (result.error) throw result.error;

  return {
    posts: (result.data ?? []).map(post => ({
      id: post.id,
      user_id: post.user_id,
      created_at: post.created_at,
      review_status: normalizeReviewStatus(post.review_status),
    })) as PostRecord[],
    missingReviewStatus,
  };
}

export default function StatisticsScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [staffSort, setStaffSort] = useState<StaffSort>('posts');
  const [customRange, setCustomRange] = useState<CustomRange>(() => getDefaultCustomRange());
  const [tempCustomRange, setTempCustomRange] = useState<CustomRange>(() => getDefaultCustomRange());
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget | null>(null);
  const [customRangeModalVisible, setCustomRangeModalVisible] = useState(false);
  const [summaryModalType, setSummaryModalType] = useState<SummaryModalType | null>(null);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<StoreMemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);

  const periodRange = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);
  const statistics = useMemo(() => {
    const summaryMap = new Map<string, StaffSummary>();

    members.forEach(member => {
      summaryMap.set(member.user_id, {
        ...member,
        postCount: 0,
        approvedCount: 0,
        approvalRate: 0,
      });
    });

    posts.forEach(post => {
      if (!summaryMap.has(post.user_id)) {
        summaryMap.set(post.user_id, {
          id: post.user_id,
          user_id: post.user_id,
          role: 'staff',
          display_name: '退会済みスタッフ',
          username: '',
          avatar_url: null,
          postCount: 0,
          approvedCount: 0,
          approvalRate: 0,
        });
      }

      const summary = summaryMap.get(post.user_id)!;
      summary.postCount += 1;
      if (post.review_status === 'approved') summary.approvedCount += 1;
    });

    const staffSummaries = Array.from(summaryMap.values())
      .map(summary => ({
        ...summary,
        approvalRate: summary.postCount > 0
          ? Math.round((summary.approvedCount / summary.postCount) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => {
        if (b.postCount !== a.postCount) return b.postCount - a.postCount;
        if (b.approvedCount !== a.approvedCount) return b.approvedCount - a.approvedCount;
        return a.display_name.localeCompare(b.display_name, 'ja');
      });

    const totalPosts = posts.length;
    const approvedPosts = posts.filter(post => post.review_status === 'approved').length;
    const approvalRate = totalPosts > 0
      ? Math.round((approvedPosts / totalPosts) * 1000) / 10
      : 0;
    const postingStaffCount = staffSummaries.filter(summary => summary.postCount > 0).length;

    const bucketMap = new Map<string, PeriodBucket>();
    const sortedDates = posts
      .map(post => new Date(post.created_at))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    const bucketStart = periodRange.startDate ?? sortedDates[0] ?? null;
    const bucketEnd = periodRange.endDate ?? sortedDates[sortedDates.length - 1] ?? null;
    const days = bucketStart && bucketEnd
      ? Math.ceil((endOfDay(bucketEnd).getTime() - startOfDay(bucketStart).getTime()) / 86400000)
      : 0;
    const groupByMonth = days > 31;

    posts.forEach(post => {
      const date = new Date(post.created_at);
      if (Number.isNaN(date.getTime())) return;

      const key = groupByMonth
        ? `${date.getFullYear()}-${date.getMonth() + 1}`
        : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const label = groupByMonth ? formatMonth(date) : formatShortDate(date);
      const sortTime = groupByMonth
        ? new Date(date.getFullYear(), date.getMonth(), 1).getTime()
        : startOfDay(date).getTime();

      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          key,
          label,
          sortTime,
          postCount: 0,
          approvedCount: 0,
          approvalRate: 0,
        });
      }

      const bucket = bucketMap.get(key)!;
      bucket.postCount += 1;
      if (post.review_status === 'approved') bucket.approvedCount += 1;
    });

    const periodBuckets = Array.from(bucketMap.values())
      .map(bucket => ({
        ...bucket,
        approvalRate: bucket.postCount > 0
          ? Math.round((bucket.approvedCount / bucket.postCount) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => a.sortTime - b.sortTime);
    const maxBucketPosts = Math.max(0, ...periodBuckets.map(bucket => bucket.postCount));

    return {
      totalPosts,
      approvedPosts,
      approvalRate,
      postingStaffCount,
      staffSummaries,
      ranking: staffSummaries.filter(summary => summary.postCount > 0),
      periodBuckets,
      maxBucketPosts,
    };
  }, [members, posts, periodRange.endDate, periodRange.startDate]);

  const sortedStaffSummaries = useMemo(() => {
    const summaries = statistics.staffSummaries.filter(summary => summary.postCount > 0);

    return [...summaries].sort((a, b) => {
      if (staffSort === 'approved') {
        if (b.approvedCount !== a.approvedCount) return b.approvedCount - a.approvedCount;
        if (b.postCount !== a.postCount) return b.postCount - a.postCount;
        if (b.approvalRate !== a.approvalRate) return b.approvalRate - a.approvalRate;
        return a.display_name.localeCompare(b.display_name, 'ja');
      }

      if (b.postCount !== a.postCount) return b.postCount - a.postCount;
      if (b.approvedCount !== a.approvedCount) return b.approvedCount - a.approvedCount;
      if (b.approvalRate !== a.approvalRate) return b.approvalRate - a.approvalRate;
      return a.display_name.localeCompare(b.display_name, 'ja');
    });
  }, [staffSort, statistics.staffSummaries]);

  const avatarStorageUrls = useMemo(
    () => members.map(member => member.avatar_url),
    [members]
  );
  const resolveAvatarStorageUrl = useSignedStorageUrlResolver('avatars', avatarStorageUrls);

  const loadStatistics = useCallback(async () => {
    try {
      setLoading(true);
      setSetupWarning(null);

      const { data: { user } } = await authService.getCurrentUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const activeStoreId = await storeService.getActiveStoreId(user.id);
      if (!activeStoreId) {
        router.back();
        return;
      }

      const { data: currentMembership, error: currentMembershipError } = await supabase
        .from('store_members')
        .select('role')
        .eq('store_id', activeStoreId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (currentMembershipError) throw currentMembershipError;

      const role = currentMembership ? normalizeStoreMemberRole(currentMembership.role) : null;
      setCurrentUserRole(role);

      if (!isStoreAdminRole(role)) {
        Alert.alert('権限がありません', '投稿集計はオーナーまたは管理者のみ利用できます。', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        setMembers([]);
        setPosts([]);
        return;
      }

      const [storeMembers, postsResult] = await Promise.all([
        loadStoreMembers(activeStoreId),
        loadPosts(activeStoreId, period, customRange),
      ]);

      if (postsResult.missingReviewStatus) {
        setSetupWarning('採用済みの集計には承認機能用のDB更新が必要です。Supabaseで database/post_review_status.sql を実行してください。');
      }

      const memberUserIds = new Set(storeMembers.map(member => member.user_id));
      const missingProfileIds = [...new Set(postsResult.posts.map(post => post.user_id))]
        .filter(userId => !memberUserIds.has(userId));
      const formerMembers = await loadProfilesAsMembers(activeStoreId, missingProfileIds);

      setMembers([...storeMembers, ...formerMembers]);
      setPosts(postsResult.posts);
    } catch (error) {
      console.error('StatisticsScreen load error:', error);
      Alert.alert('エラー', '投稿集計の取得に失敗しました。時間をおいてもう一度お試しください。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customRange, period, router]);

  useFocusEffect(
    useCallback(() => {
      loadStatistics();
    }, [loadStatistics])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadStatistics();
  };

  const openCustomRangeModal = () => {
    setTempCustomRange(customRange);
    setDatePickerTarget(null);
    setCustomRangeModalVisible(true);
  };

  const handlePeriodPress = (nextPeriod: PeriodFilter) => {
    if (nextPeriod === 'custom') {
      openCustomRangeModal();
      return;
    }

    setPeriod(nextPeriod);
    setDatePickerTarget(null);
    setCustomRangeModalVisible(false);
  };

  const updateTempCustomDate = (target: DatePickerTarget, date: Date) => {
    setTempCustomRange(previous => {
      if (target === 'start') {
        const startDate = startOfDay(date);
        const endDate = previous.endDate.getTime() < startDate.getTime()
          ? endOfDay(date)
          : previous.endDate;
        return { startDate, endDate };
      }

      const endDate = endOfDay(date);
      const startDate = previous.startDate.getTime() > endDate.getTime()
        ? startOfDay(date)
        : previous.startDate;
      return { startDate, endDate };
    });
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android' && event.type === 'dismissed') {
      setDatePickerTarget(null);
      return;
    }

    if (datePickerTarget && selectedDate) {
      updateTempCustomDate(datePickerTarget, selectedDate);
    }

    if (Platform.OS === 'android') {
      setDatePickerTarget(null);
    }
  };

  const applyCustomRange = () => {
    setCustomRange(tempCustomRange);
    setPeriod('custom');
    setCustomRangeModalVisible(false);
    setDatePickerTarget(null);
  };

  const renderAvatar = (staff: StaffMember, size = 44) => (
    <View
      style={[
        styles.avatarFrame,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isDark ? '#273345' : '#EAF3FF',
          borderColor: colors.borderLight,
        },
      ]}
    >
      {staff.avatar_url ? (
        <Image
          source={{ uri: resolveAvatarStorageUrl(staff.avatar_url) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={[styles.avatarInitial, { color: ACCENT }]}>
          {getInitial(staff.display_name)}
        </Text>
      )}
    </View>
  );

  const renderStatCard = (
    label: string,
    value: string,
    icon: keyof typeof Ionicons.glyphMap,
    color: string,
    detail?: string,
    onPress?: () => void
  ) => {
    const cardStyle = [
      styles.statCard,
      { backgroundColor: colors.surface, borderColor: colors.borderLight },
    ];
    const content = (
      <>
        <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
        {detail ? <Text style={[styles.statDetail, { color: colors.textSecondary }]}>{detail}</Text> : null}
        {onPress ? (
          <View style={styles.statCardChevron}>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        ) : null}
      </>
    );

    if (onPress) {
      return (
        <TouchableOpacity
          style={cardStyle}
          onPress={onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {content}
        </TouchableOpacity>
      );
    }

    return <View style={cardStyle}>{content}</View>;
  };

  const renderPeriodPicker = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>期間</Text>
        <Text style={[styles.sectionMeta, { color: colors.textMuted }]}>{periodRange.label}</Text>
      </View>
      <View style={styles.periodGrid}>
        {PERIOD_OPTIONS.map(option => {
          const active = period === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.periodButton,
                {
                  backgroundColor: active ? ACCENT : colors.surface,
                  borderColor: active ? ACCENT : colors.borderLight,
                },
              ]}
              onPress={() => handlePeriodPress(option.value)}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={option.icon}
                size={17}
                color={active ? '#FFFFFF' : colors.textSecondary}
              />
              <Text style={[styles.periodButtonText, { color: active ? '#FFFFFF' : colors.text }]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderManualPeriodModal = () => {
    const activePickerValue = datePickerTarget === 'start'
      ? tempCustomRange.startDate
      : tempCustomRange.endDate;
    const pickerDisplay = Platform.OS === 'ios' ? 'inline' : 'calendar';

    const renderDateField = (target: DatePickerTarget, label: string, date: Date) => {
      const active = datePickerTarget === target;

      return (
        <TouchableOpacity
          style={[
            styles.manualDateField,
            {
              borderColor: active ? ACCENT : colors.borderLight,
              backgroundColor: active ? '#EAF4FE' : colors.surface,
            },
          ]}
          onPress={() => setDatePickerTarget(target)}
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
        visible={customRangeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomRangeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCustomRangeModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="手動期間選択を閉じる"
          />
          <View style={[styles.manualPeriodModal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>期間を選択</Text>
              <TouchableOpacity
                style={[styles.modalCloseButton, { backgroundColor: isDark ? '#273345' : '#F1F2F6' }]}
                onPress={() => setCustomRangeModalVisible(false)}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.manualDateRow}>
              {renderDateField('start', '開始日', tempCustomRange.startDate)}
              {renderDateField('end', '終了日', tempCustomRange.endDate)}
            </View>

            {datePickerTarget ? (
              <View style={[styles.manualPickerWrap, { borderColor: colors.borderLight, backgroundColor: colors.surface2 }]}>
                <DateTimePicker
                  value={activePickerValue}
                  mode="date"
                  display={pickerDisplay}
                  maximumDate={endOfDay(new Date())}
                  onChange={handleDateChange}
                  locale="ja-JP"
                />
              </View>
            ) : null}

            <View style={styles.manualPeriodActions}>
              <TouchableOpacity
                style={[styles.manualPeriodSecondaryButton, { borderColor: colors.borderLight }]}
                onPress={() => setCustomRangeModalVisible(false)}
                activeOpacity={0.78}
              >
                <Text style={[styles.manualPeriodSecondaryText, { color: colors.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.manualPeriodPrimaryButton}
                onPress={applyCustomRange}
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

  const renderSummaryModal = () => {
    if (!summaryModalType) return null;

    const title = '投稿スタッフ';
    const detailTitle = 'メンバー';
    const detailRows = sortedStaffSummaries.map(summary => ({
      id: summary.user_id,
      label: summary.display_name,
    }));
    const emptyText = '投稿したスタッフはいません';

    return (
      <Modal
        visible={Boolean(summaryModalType)}
        transparent
        animationType="fade"
        onRequestClose={() => setSummaryModalType(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSummaryModalType(null)}
            accessibilityRole="button"
            accessibilityLabel={`${title}の詳細を閉じる`}
          />
          <View style={[styles.summaryModal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
              <TouchableOpacity
                style={[styles.modalCloseButton, { backgroundColor: isDark ? '#273345' : '#F1F2F6' }]}
                onPress={() => setSummaryModalType(null)}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.summaryDetailTitle, { color: colors.text }]}>{detailTitle}</Text>
            <ScrollView
              style={styles.summaryDetailScroll}
              contentContainerStyle={styles.summaryDetailList}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {detailRows.length === 0 ? (
                <View style={[styles.summaryDetailEmpty, { borderColor: colors.borderLight }]}>
                  <Text style={[styles.summaryDetailEmptyText, { color: colors.textMuted }]}>{emptyText}</Text>
                </View>
              ) : (
                detailRows.map(row => (
                  <View
                    key={row.id}
                    style={[styles.summaryDetailRow, { borderBottomColor: colors.borderLight }]}
                    >
                      <View style={styles.summaryDetailText}>
                      <Text style={[styles.summaryDetailLabel, { color: colors.text }]} numberOfLines={1}>
                        {row.label}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderStaffSortControl = () => (
    <View style={[styles.staffSortControl, { backgroundColor: isDark ? colors.surface2 : '#EEF2F7' }]}>
      {STAFF_SORT_OPTIONS.map(option => {
        const active = staffSort === option.value;

        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.staffSortButton,
              active && { backgroundColor: colors.surface },
            ]}
            onPress={() => setStaffSort(option.value)}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={option.icon}
              size={15}
              color={active ? ACCENT : colors.textSecondary}
            />
            <Text style={[styles.staffSortButtonText, { color: active ? ACCENT : colors.textSecondary }]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStaffRow = (summary: StaffSummary, index: number) => (
    <View
      key={summary.user_id}
      style={[styles.staffRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
    >
      <View style={styles.rankColumn}>
        <Text style={[styles.rankText, { color: index < 3 ? WARNING : colors.textMuted }]}>
          {index + 1}
        </Text>
      </View>
      {renderAvatar(summary)}
      <View style={styles.staffMain}>
        <View style={styles.staffNameRow}>
          <Text style={[styles.staffName, { color: colors.text }]} numberOfLines={1}>
            {summary.display_name}
          </Text>
          <View style={[styles.roleBadge, { backgroundColor: isDark ? '#273345' : '#F1F5F9' }]}>
            <Text style={[styles.roleBadgeText, { color: colors.textSecondary }]}>
              {getStoreRoleLabel(summary.role)}
            </Text>
          </View>
        </View>
        <View style={styles.staffMetricsRow}>
          <Text style={[styles.staffMetric, { color: colors.textSecondary }]}>投稿 {summary.postCount}件</Text>
          <Text style={[styles.staffMetric, { color: APPROVED }]}>採用 {summary.approvedCount}件</Text>
          <Text style={[styles.staffMetric, { color: colors.textSecondary }]}>採用率 {formatRate(summary.approvalRate)}</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2A3442' : '#EEF2F7' }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: getRateBarWidth(summary.approvalRate),
                backgroundColor: summary.approvalRate > 0 ? APPROVED : NEUTRAL,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>採用・投稿集計</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {currentUserRole ? getStoreRoleLabel(currentUserRole) : '管理'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleRefresh}
          activeOpacity={0.7}
          disabled={loading || refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Ionicons name="refresh" size={22} color={colors.text} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {setupWarning ? (
            <View style={[styles.warningBox, { backgroundColor: isDark ? '#3A2A12' : '#FFF7E6', borderColor: isDark ? '#73511D' : '#F5D58B' }]}>
              <Ionicons name="alert-circle-outline" size={18} color={WARNING} />
              <Text style={[styles.warningText, { color: isDark ? '#FFD18A' : '#8A5200' }]}>
                {setupWarning}
              </Text>
            </View>
          ) : null}

          {renderPeriodPicker()}

          <View style={styles.summaryGrid}>
            {renderStatCard(
              '採用数',
              `${statistics.approvedPosts}件`,
              'checkmark-circle-outline',
              APPROVED,
              periodRange.label
            )}
            {renderStatCard('採用率', formatRate(statistics.approvalRate), 'trending-up-outline', WARNING)}
            {renderStatCard(
              '投稿数',
              `${statistics.totalPosts}件`,
              'images-outline',
              ACCENT
            )}
            {renderStatCard(
              '投稿スタッフ',
              `${statistics.postingStaffCount}人`,
              'people-outline',
              NEUTRAL,
              undefined,
              () => setSummaryModalType('staff')
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>スタッフ別の内訳</Text>
              <Text style={[styles.sectionMeta, { color: colors.textMuted }]}>
                投稿あり {sortedStaffSummaries.length}人
              </Text>
            </View>
            {renderStaffSortControl()}
            {sortedStaffSummaries.length === 0 ? (
              <View style={[styles.emptyBlock, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                <Ionicons name="trophy-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>ランキング対象の投稿はありません</Text>
              </View>
            ) : (
              <View style={styles.staffList}>
                {sortedStaffSummaries.map(renderStaffRow)}
              </View>
            )}
          </View>
        </ScrollView>
      )}
      {renderManualPeriodModal()}
      {renderSummaryModal()}
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
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 18,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionMeta: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodButton: {
    minHeight: 40,
    minWidth: 84,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    minHeight: 118,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  statValue: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  statDetail: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  statCardChevron: {
    position: 'absolute',
    top: 14,
    right: 12,
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bucketList: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  bucketRow: {
    gap: 7,
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bucketLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  bucketCount: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  bucketRate: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
  },
  staffList: {
    gap: 10,
  },
  staffSortControl: {
    flexDirection: 'row',
    borderRadius: 13,
    padding: 4,
    gap: 4,
  },
  staffSortButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  staffSortButtonText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  staffRow: {
    minHeight: 82,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rankColumn: {
    width: 24,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  avatarFrame: {
    overflow: 'hidden',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  staffMain: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  staffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staffName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  staffMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  staffMetric: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  emptyBlock: {
    minHeight: 118,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
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
  manualPeriodModal: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  summaryModal: {
    maxHeight: '86%',
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
  modalHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
    letterSpacing: 0,
    marginBottom: 4,
  },
  manualDateValue: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
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
    letterSpacing: 0,
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
    letterSpacing: 0,
  },
  summaryModalHero: {
    minHeight: 86,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  summaryModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryModalHeroText: {
    flex: 1,
    minWidth: 0,
  },
  summaryModalLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  summaryModalValue: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  summaryFactGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  summaryFact: {
    flex: 1,
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  summaryFactLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  summaryFactValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  summaryDetailTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8,
  },
  summaryDetailScroll: {
    maxHeight: 280,
  },
  summaryDetailList: {
    paddingBottom: 2,
  },
  summaryDetailRow: {
    minHeight: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  summaryDetailText: {
    flex: 1,
    minWidth: 0,
  },
  summaryDetailLabel: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  summaryDetailSubValue: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  summaryDetailValue: {
    flexShrink: 0,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  summaryDetailEmpty: {
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  summaryDetailEmptyText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
});
