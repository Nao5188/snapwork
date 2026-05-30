import React, { useCallback, useMemo, useState } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { authService, storeService, supabase } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';

interface StaffMember {
  id: string;
  user_id: string;
  role: 'owner' | 'staff';
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
}

export default function StaffListScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'staff' | null>(null);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);

  const ownerCount = useMemo(
    () => members.filter(member => member.role === 'owner').length,
    [members]
  );
  const staffCount = Math.max(0, members.length - ownerCount);
  const canManageMembers = currentUserRole === 'owner';

  const getAdminActionErrorMessage = (error: any) => {
    const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;

    if (error?.code === 'PGRST202' || message.includes('store_admin_')) {
      return '管理操作用のDB更新が必要です。Supabaseで database/store_member_admin.sql を実行してください。';
    }
    if (error?.code === '42501' || message.includes('Only store owners')) {
      return 'この操作は店舗オーナーのみ実行できます。';
    }
    if (message.includes('At least one owner')) {
      return '店舗には少なくとも1名のオーナーが必要です。';
    }
    if (message.includes('remove yourself') || message.includes('own owner role')) {
      return '自分自身の権限変更・削除はできません。';
    }
    return '操作に失敗しました。';
  };

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      setSetupWarning(null);
      const { data: { user } } = await authService.getCurrentUser();
      if (!user) { router.replace('/login'); return; }
      setCurrentUserId(user.id);

      const activeStoreId = await storeService.getActiveStoreId(user.id);
      if (!activeStoreId) { router.back(); return; }
      setActiveStoreId(activeStoreId);

      const { data: currentMembership, error: currentMembershipError } = await supabase
        .from('store_members')
        .select('role')
        .eq('store_id', activeStoreId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (currentMembershipError) throw currentMembershipError;
      const role = currentMembership?.role === 'owner' ? 'owner' : 'staff';
      setCurrentUserRole(role);

      if (role !== 'owner') {
        Alert.alert('権限がありません', 'スタッフ一覧管理は店舗オーナーのみ利用できます。', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        setMembers([]);
        return;
      }

      const rpcResult = await supabase.rpc('get_store_members_with_profiles', {
        p_store_id: activeStoreId,
      } as any);

      if (!rpcResult.error && Array.isArray(rpcResult.data)) {
        const userIds = rpcResult.data.map((member: any) => member.user_id);
        const { data: postCounts } = userIds.length > 0
          ? await supabase
            .from('posts')
            .select('user_id')
            .eq('store_id', activeStoreId)
            .in('user_id', userIds)
          : { data: [] };

        const countMap = new Map<string, number>();
        (postCounts ?? []).forEach(post => {
          countMap.set(post.user_id, (countMap.get(post.user_id) ?? 0) + 1);
        });

        const result: StaffMember[] = rpcResult.data.map((member: any) => ({
          id: member.id ?? `${activeStoreId}:${member.user_id}`,
          user_id: member.user_id,
          role: member.role === 'owner' ? 'owner' : 'staff',
          created_at: member.created_at,
          username: member.username ?? '',
          display_name: member.display_name ?? 'ユーザー',
          avatar_url: member.avatar_url ?? null,
          post_count: countMap.get(member.user_id) ?? 0,
        }));

        setMembers(result);
        return;
      }

      const isListRpcMissing = rpcResult.error?.code === 'PGRST202';
      if (isListRpcMissing) {
        setSetupWarning('DB更新が未適用のため、自分の行だけ表示される場合があります。Supabaseで database/store_member_admin.sql を実行してください。');
      } else if (rpcResult.error) {
        console.warn('get_store_members_with_profiles fallback:', rpcResult.error.message);
      }

      const { data: membersData, error } = await supabase
        .from('store_members')
        .select('id, user_id, role, created_at')
        .eq('store_id', activeStoreId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!membersData) { setMembers([]); return; }
      if (isListRpcMissing && membersData.length <= 1) {
        setSetupWarning('スタッフ一覧取得用のDB更新が未適用です。店舗メンバー全員を表示するには database/store_member_admin.sql をSupabaseで実行してください。');
      }

      const userIds = membersData.map(m => m.user_id);

      const [{ data: profiles }, { data: postCounts }] = userIds.length > 0
        ? await Promise.all([
          supabase
            .from('public_profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', userIds),
          supabase
            .from('posts')
            .select('user_id')
            .eq('store_id', activeStoreId)
            .in('user_id', userIds),
        ])
        : [{ data: [] }, { data: [] }];

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));
      const countMap = new Map<string, number>();
      (postCounts ?? []).forEach(p => {
        countMap.set(p.user_id, (countMap.get(p.user_id) ?? 0) + 1);
      });

      const result: StaffMember[] = membersData.map(m => {
        const profile = profileMap.get(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          created_at: m.created_at,
          username: profile?.username ?? `user_${m.user_id.slice(-6)}`,
          display_name: profile?.display_name ?? 'ユーザー',
          avatar_url: profile?.avatar_url ?? null,
          post_count: countMap.get(m.user_id) ?? 0,
        };
      });

      setMembers(result);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'スタッフ情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { loadMembers(); }, [loadMembers]));

  const updateMemberRole = async (member: StaffMember, role: 'owner' | 'staff') => {
    if (!activeStoreId) return;
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc('store_admin_set_member_role', {
        p_store_id: activeStoreId,
        p_target_user_id: member.user_id,
        p_role: role,
      } as any);

      if (error) throw error;

      setMembers(prev => prev.map(item => (
        item.user_id === member.user_id ? { ...item, role } : item
      )));
      Alert.alert('完了', role === 'owner'
        ? '管理者権限を付与しました。'
        : 'スタッフ権限に変更しました。'
      );
    } catch (error) {
      Alert.alert('エラー', getAdminActionErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRoleChange = (member: StaffMember, role: 'owner' | 'staff') => {
    if (member.user_id === currentUserId && role === 'staff') {
      Alert.alert('変更不可', '自分自身の管理者権限は解除できません。');
      return;
    }

    const title = role === 'owner' ? '管理者権限を付与' : 'スタッフ権限に戻す';
    const message = role === 'owner'
      ? `「${member.display_name}」に管理者権限を付与しますか？`
      : `「${member.display_name}」をスタッフ権限に変更しますか？`;

    Alert.alert(title, message, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '変更する', onPress: () => updateMemberRole(member, role) },
    ]);
  };

  const handleRemoveMember = (member: StaffMember) => {
    if (member.user_id === currentUserId) {
      Alert.alert('削除不可', '自分自身は削除できません。');
      return;
    }
    if (member.role === 'owner' && ownerCount <= 1) {
      Alert.alert('削除不可', '店舗には少なくとも1名のオーナーが必要です。');
      return;
    }
    if (!activeStoreId) return;

    Alert.alert(
      'メンバーを削除',
      `「${member.display_name}」を店舗メンバーから削除しますか？\nこのユーザーは店舗の投稿閲覧・投稿作成ができなくなります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              const { error } = await supabase.rpc('store_admin_remove_member', {
                p_store_id: activeStoreId,
                p_target_user_id: member.user_id,
              } as any);
              if (error) throw error;
              setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
              Alert.alert('完了', 'メンバーを削除しました。');
            } catch (error) {
              Alert.alert('エラー', getAdminActionErrorMessage(error));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const openMemberActions = (member: StaffMember) => {
    if (!canManageMembers) {
      Alert.alert('権限がありません', 'この操作は店舗オーナーのみ実行できます。');
      return;
    }
    if (member.user_id === currentUserId) {
      Alert.alert('操作できません', '自分自身の権限変更・削除はできません。');
      return;
    }

    const actions: any[] = [{ text: 'キャンセル', style: 'cancel' }];

    if (member.role === 'staff') {
      actions.unshift({
        text: '管理者権限を付与',
        onPress: () => confirmRoleChange(member, 'owner'),
      });
    } else if (ownerCount > 1) {
      actions.unshift({
        text: 'スタッフ権限に戻す',
        onPress: () => confirmRoleChange(member, 'staff'),
      });
    }

    if (member.role === 'staff' || ownerCount > 1) {
      actions.splice(actions.length - 1, 0, {
        text: '店舗から削除',
        style: 'destructive',
        onPress: () => handleRemoveMember(member),
      });
    }

    Alert.alert('メンバー操作', `「${member.display_name}」に対する操作を選択してください。`, actions);
  };

  const renderItem = ({ item }: { item: StaffMember }) => {
    const joinedDate = new Date(item.created_at);
    const dateStr = `${joinedDate.getFullYear()}/${joinedDate.getMonth() + 1}/${joinedDate.getDate()} 参加`;
    const isOwner = item.role === 'owner';
    const isCurrentUser = item.user_id === currentUserId;

    return (
      <View style={[styles.memberCard, { backgroundColor: colors.surface }]}>
        <View style={[styles.avatarContainer, { borderColor: colors.borderLight }]}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.defaultAvatar, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="person" size={22} color={colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
              {item.display_name}
            </Text>
            {isCurrentUser && (
              <View style={[styles.selfBadge, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.selfBadgeText, { color: colors.textMuted }]}>自分</Text>
              </View>
            )}
            <View style={[
              styles.roleBadge,
              { backgroundColor: isOwner ? (isDark ? '#3d2c00' : '#FFF4E0') : (isDark ? '#18304c' : '#EAF3FF') }
            ]}>
              <Text style={[styles.roleText, { color: isOwner ? '#E07B00' : '#1F7AE0' }]}>
                {isOwner ? 'オーナー' : 'スタッフ'}
              </Text>
            </View>
          </View>
          <Text style={[styles.username, { color: colors.textMuted }]}>@{item.username}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="images-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.post_count}件の投稿</Text>
            <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{dateStr}</Text>
          </View>
        </View>

        {canManageMembers && (
          <TouchableOpacity
            style={[styles.actionButton, actionLoading && styles.actionButtonDisabled]}
            onPress={() => openMemberActions(item)}
            disabled={actionLoading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${item.display_name}の操作`}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>スタッフ一覧管理</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={members}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>スタッフがいません</Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {setupWarning && (
                <View style={[styles.warningBox, { backgroundColor: isDark ? '#3A2A12' : '#FFF7E6', borderColor: isDark ? '#73511D' : '#F5D58B' }]}>
                  <Ionicons name="alert-circle-outline" size={18} color="#D98200" />
                  <Text style={[styles.warningText, { color: isDark ? '#FFD18A' : '#8A5200' }]}>
                    {setupWarning}
                  </Text>
                </View>
              )}
              <Text style={[styles.countText, { color: colors.textMuted }]}>
                {members.length}名のメンバー
              </Text>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryPill, { backgroundColor: isDark ? '#3d2c00' : '#FFF4E0' }]}>
                  <Text style={styles.summaryOwnerText}>オーナー {ownerCount}</Text>
                </View>
                <View style={[styles.summaryPill, { backgroundColor: isDark ? '#18304c' : '#EAF3FF' }]}>
                  <Text style={styles.summaryStaffText}>スタッフ {staffCount}</Text>
                </View>
              </View>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
    gap: 10,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  listHeader: {
    marginBottom: 8,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  summaryOwnerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E07B00',
  },
  summaryStaffText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F7AE0',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 2,
  },
  avatar: {
    width: 50,
    height: 50,
  },
  defaultAvatar: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  selfBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  username: {
    fontSize: 12,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
  },
  metaDot: {
    fontSize: 11,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  removeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
