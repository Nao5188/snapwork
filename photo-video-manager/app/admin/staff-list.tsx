import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { subscribeActiveStoreChanged } from '@/lib/activeStoreEvents';
import { useSignedStorageUrlResolver } from '@/lib/signedStorageUrls';
import { getStoreRoleLabel, isStoreAdminRole, normalizeStoreMemberRole } from '@/lib/storeRoles';
import type { StoreMemberRole } from '@/lib/storeRoles';
import { useAppTheme } from '@/lib/ThemeContext';

interface StaffMember {
  id: string;
  user_id: string;
  role: StoreMemberRole;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
}

const getRoleBadgeStyle = (role: StoreMemberRole, isDark: boolean) => {
  switch (role) {
    case 'owner':
      return {
        backgroundColor: isDark ? '#3d2c00' : '#FFF4E0',
        color: '#E07B00',
      };
    case 'admin':
      return {
        backgroundColor: isDark ? '#12351F' : '#EAF8EF',
        color: '#1F8A49',
      };
    case 'staff':
    default:
      return {
        backgroundColor: isDark ? '#18304c' : '#EAF3FF',
        color: '#1F7AE0',
      };
  }
};

export default function StaffListScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<StoreMemberRole | null>(null);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);

  const ownerCount = useMemo(
    () => members.filter(member => member.role === 'owner').length,
    [members]
  );
  const adminCount = useMemo(
    () => members.filter(member => member.role === 'admin').length,
    [members]
  );
  const staffCount = useMemo(
    () => members.filter(member => member.role === 'staff').length,
    [members]
  );
  const canManageMembers = isStoreAdminRole(currentUserRole);
  const canManageRoles = currentUserRole === 'owner';
  const avatarStorageUrls = useMemo(
    () => members.map(member => member.avatar_url),
    [members]
  );
  const resolveAvatarStorageUrl = useSignedStorageUrlResolver('avatars', avatarStorageUrls);

  const getAdminActionErrorMessage = (error: any) => {
    const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;

    if (error?.code === 'PGRST202' || message.includes('store_admin_')) {
      return '管理操作用のDB更新が必要です。Supabaseで database/store_member_admin.sql を実行してください。';
    }
    if (message.includes('Only store owners can change member roles')) {
      return '役割の変更は店舗オーナーのみ実行できます。';
    }
    if (message.includes('Only store owners can remove owners or admins')) {
      return 'オーナーまたは管理者の削除は店舗オーナーのみ実行できます。';
    }
    if (message.includes('Only store owners and admins')) {
      return 'この操作はオーナーまたは管理者のみ実行できます。';
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
      const role = currentMembership ? normalizeStoreMemberRole(currentMembership.role) : null;
      setCurrentUserRole(role);

      if (!isStoreAdminRole(role)) {
        Alert.alert('権限がありません', 'スタッフ一覧管理はオーナーまたは管理者のみ利用できます。', [
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
          role: normalizeStoreMemberRole(member.role),
          created_at: member.created_at,
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
            .select('id, display_name, avatar_url')
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
          role: normalizeStoreMemberRole(m.role),
          created_at: m.created_at,
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

  useEffect(() => {
    return subscribeActiveStoreChanged(() => {
      loadMembers();
    });
  }, [loadMembers]);

  const updateMemberRole = async (member: StaffMember, role: StoreMemberRole) => {
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
      Alert.alert('完了', `${getStoreRoleLabel(role)}に変更しました。`);
    } catch (error) {
      Alert.alert('エラー', getAdminActionErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRoleChange = (member: StaffMember, role: StoreMemberRole) => {
    if (!canManageRoles) {
      Alert.alert('権限がありません', '役割の変更は店舗オーナーのみ実行できます。');
      return;
    }

    if (member.user_id === currentUserId && role !== 'owner') {
      Alert.alert('変更不可', '自分自身のオーナー権限は解除できません。');
      return;
    }

    const nextRoleLabel = getStoreRoleLabel(role);
    const title = role === 'owner' ? 'オーナーにする' : `${nextRoleLabel}にする`;
    const message = role === 'owner'
      ? `「${member.display_name}」をオーナーにしますか？\nオーナーはメンバー管理や重要な設定変更ができます。`
      : `「${member.display_name}」を${nextRoleLabel}に変更しますか？`;

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
    if (currentUserRole === 'admin' && member.role !== 'staff') {
      Alert.alert('削除不可', '管理者はスタッフのみ削除できます。');
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
      Alert.alert('権限がありません', 'この操作はオーナーまたは管理者のみ実行できます。');
      return;
    }
    if (member.user_id === currentUserId) {
      Alert.alert('操作できません', '自分自身の権限変更・削除はできません。');
      return;
    }

    const actions: any[] = [{ text: 'キャンセル', style: 'cancel' }];

    if (canManageRoles) {
      const roleActions: { role: StoreMemberRole; label: string }[] = [];

      if (member.role !== 'admin' && (member.role !== 'owner' || ownerCount > 1)) {
        roleActions.push({ role: 'admin', label: '管理者にする' });
      }
      if (member.role !== 'staff' && (member.role !== 'owner' || ownerCount > 1)) {
        roleActions.push({ role: 'staff', label: 'スタッフにする' });
      }
      if (member.role !== 'owner') {
        roleActions.push({ role: 'owner', label: 'オーナーにする' });
      }

      actions.unshift(
        ...roleActions.map(action => ({
          text: action.label,
          onPress: () => confirmRoleChange(member, action.role),
        }))
      );
    }

    const canRemoveMember = canManageRoles
      ? member.role !== 'owner' || ownerCount > 1
      : member.role === 'staff';

    if (canRemoveMember) {
      actions.splice(actions.length - 1, 0, {
        text: '店舗から削除',
        style: 'destructive',
        onPress: () => handleRemoveMember(member),
      });
    }

    if (actions.length === 1) {
      Alert.alert('操作できません', 'このメンバーに対して実行できる操作がありません。');
      return;
    }

    Alert.alert('メンバー操作', `「${member.display_name}」に対する操作を選択してください。`, actions);
  };

  const renderItem = ({ item }: { item: StaffMember }) => {
    const joinedDate = new Date(item.created_at);
    const dateStr = `${joinedDate.getFullYear()}/${joinedDate.getMonth() + 1}/${joinedDate.getDate()} 参加`;
    const isCurrentUser = item.user_id === currentUserId;
    const roleBadgeStyle = getRoleBadgeStyle(item.role, isDark);

    return (
      <View style={[styles.memberCard, { backgroundColor: colors.surface }]}>
        <View style={[styles.avatarContainer, { borderColor: colors.borderLight }]}>
          {item.avatar_url ? (
            <Image
              source={{ uri: resolveAvatarStorageUrl(item.avatar_url) }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={`staff-list-avatar-${item.user_id}`}
            />
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
              { backgroundColor: roleBadgeStyle.backgroundColor }
            ]}>
              <Text style={[styles.roleText, { color: roleBadgeStyle.color }]}>
                {getStoreRoleLabel(item.role)}
              </Text>
            </View>
          </View>
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
                <View style={[styles.summaryPill, { backgroundColor: isDark ? '#12351F' : '#EAF8EF' }]}>
                  <Text style={styles.summaryAdminText}>管理者 {adminCount}</Text>
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
  summaryAdminText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F8A49',
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
