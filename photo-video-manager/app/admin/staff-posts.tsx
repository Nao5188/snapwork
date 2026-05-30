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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { authService, storeService, supabase } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import PostCard from '@/components/PostCard';

interface PostItem {
  id: string;
  title: string;
  menu_name: string;
  media_url: string;
  is_video: boolean;
  likes_count: number;
  created_at: string;
  user_id: string;
  mediaItems: { id: string; mediaUrl: string; isVideo: boolean; displayOrder: number }[];
  userProfile?: { id: string; username: string; display_name: string; avatar_url?: string };
}

export default function StaffPostsScreen() {
  const router = useRouter();
  const { userId, displayName } = useLocalSearchParams<{ userId: string; displayName: string }>();
  const { colors, isDark } = useAppTheme();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await authService.getCurrentUser();
      if (!user) { router.replace('/login'); return; }

      const activeStoreId = await storeService.getActiveStoreId(user.id);
      if (!activeStoreId) { router.back(); return; }

      const [{ data: postsData, error }, { data: profile }] = await Promise.all([
        supabase
          .from('posts')
          .select('id, title, menu_name, media_url, is_video, likes_count, created_at, user_id')
          .eq('store_id', activeStoreId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('public_profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', userId)
          .maybeSingle(),
      ]);

      if (error) throw error;

      const result: PostItem[] = (postsData ?? []).map(p => ({
        ...p,
        mediaItems: p.media_url ? [{
          id: 'main',
          mediaUrl: p.media_url,
          isVideo: p.is_video,
          displayOrder: 0,
        }] : [],
        userProfile: profile ? {
          id: profile.id,
          username: profile.username ?? '',
          display_name: profile.display_name ?? 'ユーザー',
          avatar_url: profile.avatar_url,
        } : undefined,
      }));

      setPosts(result);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '投稿の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [router, userId]);

  useFocusEffect(useCallback(() => { loadPosts(); }, [loadPosts]));

  const renderPost = ({ item, index }: { item: PostItem; index: number }) => {
    const createdDate = new Date(item.created_at);
    return (
      <PostCard
        post={{
          id: item.id,
          title: item.title,
          menuName: item.menu_name,
          mediaUri: item.media_url,
          mediaItems: item.mediaItems,
          isVideo: item.is_video,
          createdAt: createdDate,
          shootingDate: createdDate,
          likesCount: item.likes_count ?? 0,
          userProfile: item.userProfile,
        }}
        index={index}
        showProfile={true}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {displayName ?? 'スタッフ'}の投稿
        </Text>
        <View style={styles.navButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.countText, { color: colors.textMuted }]}>
              {posts.length}件の投稿
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>投稿がありません</Text>
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
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { paddingBottom: 100 },
  emptyList: { flex: 1 },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
