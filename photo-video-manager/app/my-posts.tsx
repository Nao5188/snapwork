import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { postService, authService, supabase } from '@/lib/supabase';
import PostCard from '@/components/PostCard';
import { PostCardSkeleton } from '@/components/SkeletonLoader';
import { useAppTheme } from '@/lib/ThemeContext';

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
  mediaItems?: {
    id: string;
    media_url: string;
    is_video: boolean;
    display_order: number;
  }[];
  users?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

export default function MyPostsScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  const [posts, setPosts] = useState<PostHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialIndex, setInitialIndex] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: currentProfile } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      // 自分の投稿のみを取得
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (postsError) {
        throw postsError;
      }

      if (postsData && postsData.length > 0) {
        const postsWithMedia = await Promise.all(postsData.map(async post => {
          let mediaItems: any[] = [];

          if (post.media_url && post.media_url.trim() !== '') {
            mediaItems.push({
              id: 'media_0',
              media_url: post.media_url,
              is_video: post.is_video,
              display_order: 0,
            });
          }

          if (post.menu_name && post.menu_name.includes('|EXTRA_MEDIA:')) {
            const extraMediaMatch = post.menu_name.match(/\|EXTRA_MEDIA:(.+)$/);
            if (extraMediaMatch && extraMediaMatch[1]) {
              const extraUrls = extraMediaMatch[1].split(',');

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
          }

          try {
            const postMediaItems = await postService.getPostMedia(post.id);

            if (postMediaItems && postMediaItems.length > 0) {
              const validItems = postMediaItems.filter(
                (item: any) => item.media_url && item.media_url.trim() !== ''
              );
              if (validItems.length > 0) {
                mediaItems = validItems;
              }
            }
          } catch {
            // post_media テーブルにアクセスできない場合は既存の mediaItems を使用
          }

          let displayMenuName = post.menu_name || '';
          let extractedCategories = '';

          if (displayMenuName.includes('|CATEGORIES:')) {
            const parts = displayMenuName.split('|CATEGORIES:');
            displayMenuName = parts[0];
            extractedCategories = parts[1]?.split('|EXTRA_MEDIA:')[0] || '';
          }
          if (displayMenuName.includes('|EXTRA_MEDIA:')) {
            displayMenuName = displayMenuName.split('|EXTRA_MEDIA:')[0];
          }

          return {
            ...post,
            menu_name: displayMenuName,
            categories: extractedCategories,
            mediaItems,
            users: currentProfile,
            isOwner: true
          };
        }));

        setPosts(postsWithMedia);

        // タップされた投稿のインデックスを見つける
        if (postId) {
          const index = postsWithMedia.findIndex(p => p.id === postId);
          if (index !== -1) {
            setInitialIndex(index);
          }
        }
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error('Error loading posts:', error);
      Alert.alert('エラー', '投稿データの読み込みに失敗しました。');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [router, postId]);

  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [loadPosts])
  );

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
    console.log('Like post:', postId);
  };

  const renderPostItem = ({ item, index }: { item: PostHistoryItem; index: number }) => {
    const createdDate = new Date(item.created_at);

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
      description: undefined,
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
        index={index}
        showActions={true}
        showProfile={true}
        onEdit={() => handleEditPost(item)}
        onDelete={() => handleDeletePost(item)}
        onLike={() => handleLike(item.id)}
      />
    );
  };

  const renderSkeletons = () => (
    <View style={[styles.skeletonContainer, { backgroundColor: colors.background }]}>
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="camera-outline" size={48} color="#bbb" />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>まだ投稿がありません</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        カメラで撮影して最初の投稿を{'\n'}作成しましょう
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push('/')}
        activeOpacity={0.8}
      >
        <Text style={styles.emptyButtonText}>写真を撮影する</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" style={styles.emptyButtonIcon} />
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.topBarTitle, { color: colors.text }]}>自分の投稿</Text>
      <View style={styles.placeholder} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {renderHeader()}

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {loading && posts.length === 0 ? (
          renderSkeletons()
        ) : (
          <FlatList
            ref={flatListRef}
            data={posts}
            renderItem={renderPostItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.list}
            showsVerticalScrollIndicator={false}
            initialScrollIndex={initialIndex !== null && initialIndex > 0 ? initialIndex : undefined}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: false,
                });
              }, 100);
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#1a1a1a"
              />
            }
            ListEmptyComponent={renderEmptyState}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#444444',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  list: {
    paddingBottom: 100,
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
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#444444',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#444444',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyButtonIcon: {
    marginLeft: 8,
  },
  skeletonContainer: {
    paddingTop: 8,
    backgroundColor: '#fafafa',
  },
});
