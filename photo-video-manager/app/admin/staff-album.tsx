import React, { useCallback, useState } from 'react';
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
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { authService, storeService, supabase } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';

const { width } = Dimensions.get('window');
const THUMB_SIZE = (width - 16 * 2 - 8 * 2) / 3;

interface StaffAlbum {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  role: 'owner' | 'staff';
  post_count: number;
  thumbnails: string[];
}

export default function StaffAlbumScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [albums, setAlbums] = useState<StaffAlbum[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlbums = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await authService.getCurrentUser();
      if (!user) { router.replace('/login'); return; }

      const activeStoreId = await storeService.getActiveStoreId(user.id);
      if (!activeStoreId) { router.back(); return; }

      const { data: membersData, error: membersError } = await supabase
        .from('store_members')
        .select('user_id, role')
        .eq('store_id', activeStoreId);

      if (membersError) throw membersError;
      if (!membersData || membersData.length === 0) { setAlbums([]); return; }

      const userIds = membersData.map(m => m.user_id);
      const roleMap = new Map(membersData.map(m => [m.user_id, m.role as 'owner' | 'staff']));

      const [{ data: profiles }, { data: posts }] = await Promise.all([
        supabase
          .from('public_profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds),
        supabase
          .from('posts')
          .select('user_id, media_url')
          .eq('store_id', activeStoreId)
          .not('media_url', 'is', null)
          .order('created_at', { ascending: false }),
      ]);

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

      // ユーザー別に投稿をグループ化
      const postsByUser = new Map<string, string[]>();
      (posts ?? []).forEach(p => {
        if (!p.media_url) return;
        if (!postsByUser.has(p.user_id)) postsByUser.set(p.user_id, []);
        postsByUser.get(p.user_id)!.push(p.media_url);
      });

      const result: StaffAlbum[] = userIds.map(userId => {
        const profile = profileMap.get(userId);
        const userPosts = postsByUser.get(userId) ?? [];
        return {
          user_id: userId,
          display_name: profile?.display_name ?? 'ユーザー',
          username: profile?.username ?? `user_${userId.slice(-6)}`,
          avatar_url: profile?.avatar_url ?? null,
          role: roleMap.get(userId) ?? 'staff',
          post_count: userPosts.length,
          thumbnails: userPosts.slice(0, 3),
        };
      }).sort((a, b) => b.post_count - a.post_count);

      setAlbums(result);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'アルバムの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { loadAlbums(); }, [loadAlbums]));

  const renderAlbum = ({ item }: { item: StaffAlbum }) => {
    const isOwner = item.role === 'owner';

    return (
      <TouchableOpacity
        style={[styles.albumCard, { backgroundColor: colors.surface }]}
        activeOpacity={0.8}
        onPress={() => router.push({
          pathname: '/admin/staff-posts',
          params: { userId: item.user_id, displayName: item.display_name },
        } as any)}
      >
        {/* スタッフ情報ヘッダー */}
        <View style={styles.albumHeader}>
          <View style={[styles.avatarContainer, { borderColor: colors.borderLight }]}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.defaultAvatar, { backgroundColor: colors.surface2 }]}>
                <Ionicons name="person" size={20} color={colors.textMuted} />
              </View>
            )}
          </View>
          <View style={styles.staffInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                {item.display_name}
              </Text>
              <View style={[
                styles.roleBadge,
                { backgroundColor: isOwner ? (isDark ? '#3d2c00' : '#FFF4E0') : (isDark ? '#18304c' : '#EAF3FF') }
              ]}>
                <Text style={[styles.roleText, { color: isOwner ? '#E07B00' : '#1F7AE0' }]}>
                  {isOwner ? 'オーナー' : 'スタッフ'}
                </Text>
              </View>
            </View>
            <Text style={[styles.postCount, { color: colors.textMuted }]}>
              {item.post_count}件の投稿
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>

        {/* サムネイルグリッド */}
        {item.thumbnails.length > 0 ? (
          <View style={styles.thumbnailRow}>
            {item.thumbnails.map((url, i) => (
              <View key={i} style={[styles.thumbnail, { backgroundColor: colors.surface2 }]}>
                <Image source={{ uri: url }} style={styles.thumbnailImage} contentFit="cover" />
              </View>
            ))}
            {item.thumbnails.length < 3 && Array.from({ length: 3 - item.thumbnails.length }).map((_, i) => (
              <View key={`empty-${i}`} style={[styles.thumbnail, { backgroundColor: colors.surface2 }]} />
            ))}
          </View>
        ) : (
          <View style={[styles.noPostsBox, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="images-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.noPostsText, { color: colors.textMuted }]}>投稿なし</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>スタッフ別アルバム</Text>
        <View style={styles.navButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={albums}
          renderItem={renderAlbum}
          keyExtractor={item => item.user_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="albums-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>スタッフがいません</Text>
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
  navButton: {
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
    gap: 12,
  },
  albumCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  albumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  avatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    borderWidth: 2,
  },
  avatar: { width: 46, height: 46 },
  defaultAvatar: {
    width: 46,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  roleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
  },
  postCount: {
    fontSize: 12,
  },
  thumbnailRow: {
    flexDirection: 'row',
    gap: 2,
  },
  thumbnail: {
    flex: 1,
    height: THUMB_SIZE,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  noPostsBox: {
    height: 80,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  noPostsText: {
    fontSize: 13,
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
