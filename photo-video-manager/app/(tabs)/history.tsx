import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  Alert,
  RefreshControl,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { postService, authService, supabase, userService } from '@/lib/supabase';
import PostCard from '@/components/PostCard';

interface PostHistoryItem {
  id: string;
  title: string;
  menu_name: string;
  media_url: string;
  is_video: boolean;
  likes_count: number;
  categories?: string;
  description?: string;
  created_at: string;
  user_id: string;
  isOwner?: boolean;
  mediaItems?: Array<{
    id: string;
    media_url: string;
    is_video: boolean;
    display_order: number;
  }>;
  users?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export default function HistoryScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 画面がフォーカスされるたびに投稿を再読み込み
  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [])
  );

  const loadPosts = async () => {
    try {
      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      setCurrentUserId(user.id);

      const { data: currentProfile } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (postsError) {
        throw postsError;
      }

      if (postsData && postsData.length > 0) {
        const userIds = [...new Set(postsData.map(post => post.user_id))];

        const { data: usersData } = await supabase
          .from('users')
          .select('id, username, display_name, avatar_url, email')
          .in('id', userIds);

        const userMap = new Map();
        if (usersData) {
          usersData.forEach(user => {
            userMap.set(user.id, user);
          });
        }

        const postsWithProfiles = await Promise.all(postsData.map(async post => {
          let userProfile = userMap.get(post.user_id);

          let mediaItems = [];

          mediaItems.push({
            id: 'media_0',
            media_url: post.media_url,
            is_video: post.is_video,
            display_order: 0,
          });

          if (post.menu_name && post.menu_name.includes('|EXTRA_MEDIA:')) {
            const parts = post.menu_name.split('|EXTRA_MEDIA:');
            const extraUrls = parts[1] ? parts[1].split(',') : [];

            extraUrls.forEach((url: string, index: number) => {
              if (url.trim()) {
                mediaItems.push({
                  id: `media_${index + 1}`,
                  media_url: url.trim(),
                  is_video: false,
                  display_order: index + 1,
                });
              }
            });
          }

          try {
            const postMediaItems = await postService.getPostMedia(post.id);
            if (postMediaItems && postMediaItems.length > 0) {
              mediaItems = postMediaItems;
            }
          } catch (error) {
            // post_mediaテーブルが存在しない場合は既存のmediaItemsを使用
          }

          if (!userProfile) {
            if (post.user_id === user.id && currentProfile) {
              userProfile = currentProfile;
            } else {
              try {
                const createdProfile = await userService.createMissingUserProfile(post.user_id);
                if (createdProfile) {
                  userProfile = createdProfile;
                } else {
                  userProfile = {
                    id: post.user_id,
                    username: `user_${post.user_id.slice(-6)}`,
                    display_name: `ユーザー${post.user_id.slice(-4)}`,
                    avatar_url: null
                  };
                }
              } catch (error) {
                userProfile = {
                  id: post.user_id,
                  username: `user_${post.user_id.slice(-6)}`,
                  display_name: `ユーザー${post.user_id.slice(-4)}`,
                  avatar_url: null
                };
              }
            }
          }

          let displayMenuName = post.menu_name;
          if (post.menu_name && post.menu_name.includes('|EXTRA_MEDIA:')) {
            displayMenuName = post.menu_name.split('|EXTRA_MEDIA:')[0];
          }

          return {
            ...post,
            menu_name: displayMenuName,
            mediaItems,
            users: userProfile,
            isOwner: post.user_id === user.id
          };
        }));

        setPosts(postsWithProfiles);
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error('Error loading posts:', error);
      Alert.alert('エラー', '投稿データの読み込みに失敗しました。');
      setPosts([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  };

  const handleEditPost = (post: PostHistoryItem) => {
    Alert.alert(
      '投稿を編集',
      `「${post.title}」を編集しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '編集する', onPress: () => {
          router.push(`/post/edit/${post.id}`);
        }}
      ]
    );
  };

  const handleDeletePost = (post: PostHistoryItem) => {
    Alert.alert(
      '投稿を削除',
      `「${post.title}」を削除しますか？\nこの操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除する', style: 'destructive', onPress: async () => {
          try {
            setPosts(prevPosts => prevPosts.filter(p => p.id !== post.id));
            await postService.deletePost(post.id);
            Alert.alert('完了', '投稿を削除しました。');
          } catch (error: any) {
            loadPosts();
            Alert.alert(
              'エラー',
              `削除に失敗しました。\n${error?.message || 'もう一度お試しください。'}`
            );
          }
        }}
      ]
    );
  };

  const handleLike = (postId: string) => {
    // いいね機能の実装（バックエンド連携）
    console.log('Like post:', postId);
  };

  const renderPostItem = ({ item }: { item: PostHistoryItem }) => {
    const createdDate = new Date(item.created_at);
    const isOwner = item.isOwner || false;

    const postCardData = {
      id: item.id,
      title: item.title,
      menuName: item.menu_name,
      mediaUri: item.media_url,
      mediaItems: item.mediaItems?.map(media => ({
        id: media.id,
        mediaUrl: media.media_url,
        isVideo: media.is_video,
        displayOrder: media.display_order
      })),
      isVideo: item.is_video,
      createdAt: createdDate,
      shootingDate: createdDate,
      description: item.categories,
      likesCount: item.likes_count || 0,
      userProfile: item.users ? {
        id: item.user_id || '',
        username: item.users.username || '',
        display_name: item.users.display_name || '',
        avatar_url: item.users.avatar_url
      } : undefined
    };

    return (
      <PostCard
        post={postCardData}
        showActions={isOwner}
        showProfile={true}
        onEdit={() => handleEditPost(item)}
        onDelete={() => handleDeletePost(item)}
        onLike={() => handleLike(item.id)}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="camera-outline" size={64} color="#c7c7c7" />
      </View>
      <Text style={styles.emptyTitle}>まだ投稿がありません</Text>
      <Text style={styles.emptySubtitle}>
        カメラで撮影して最初の投稿を{'\n'}作成しましょう
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push('/')}
      >
        <Text style={styles.emptyButtonText}>写真を撮影する</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>ポスト</Text>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity style={styles.headerButton} onPress={onRefresh}>
          <Ionicons name="sync-outline" size={24} color="#262626" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {renderHeader()}

      <FlatList
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#262626"
          />
        }
        ListEmptyComponent={renderEmptyState}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#262626',
    fontFamily: 'System',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerButton: {
    padding: 4,
  },
  list: {
    paddingBottom: 20,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#dbdbdb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '300',
    color: '#262626',
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8e8e8e',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#0095F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
