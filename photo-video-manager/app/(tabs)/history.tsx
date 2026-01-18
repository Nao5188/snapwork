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
  Image,
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

  // アニメーション
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

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
        // デバッグ: 投稿データの確認
        console.log('=== DEBUG: Posts Data ===');
        postsData.forEach((post, index) => {
          console.log(`Post ${index}:`, {
            id: post.id,
            title: post.title,
            media_url: post.media_url,
            menu_name: post.menu_name,
          });
        });

        const userIds = [...new Set(postsData.map(post => post.user_id))];

        // public_profilesビューを使用（emailを除外した安全なビュー）
        const { data: usersData } = await supabase
          .from('public_profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        const userMap = new Map();
        if (usersData) {
          usersData.forEach(user => {
            userMap.set(user.id, user);
          });
        }

        const postsWithProfiles = await Promise.all(postsData.map(async post => {
          let userProfile = userMap.get(post.user_id);

          let mediaItems: any[] = [];

          // デバッグ: post.media_url の確認
          console.log(`=== POST ${post.id} MEDIA DEBUG ===`);
          console.log('post.media_url:', post.media_url);
          console.log('post.media_url type:', typeof post.media_url);

          // post.media_url が有効な場合のみ追加
          if (post.media_url && post.media_url.trim() !== '') {
            mediaItems.push({
              id: 'media_0',
              media_url: post.media_url,
              is_video: post.is_video,
              display_order: 0,
            });
          }

          // EXTRA_MEDIAの抽出（CATEGORIESが含まれている場合も正しく処理）
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

          console.log('mediaItems after post.media_url:', mediaItems.length, mediaItems);

          try {
            const postMediaItems = await postService.getPostMedia(post.id);
            console.log('postMediaItems from post_media table:', postMediaItems);

            // post_media テーブルにデータがあり、かつ有効な media_url を持つアイテムがある場合のみ使用
            if (postMediaItems && postMediaItems.length > 0) {
              const validItems = postMediaItems.filter(
                (item: any) => item.media_url && item.media_url.trim() !== ''
              );
              console.log('validItems after filter:', validItems.length, validItems);
              if (validItems.length > 0) {
                mediaItems = validItems;
              }
            }
          } catch (error) {
            console.log('Error getting post_media:', error);
            // post_media テーブルにアクセスできない場合は既存の mediaItems を使用
          }

          console.log('FINAL mediaItems:', mediaItems.length, mediaItems);
          console.log('=== END POST MEDIA DEBUG ===')

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

          // displayMenuNameから|CATEGORIES:と|EXTRA_MEDIA:を除去
          let displayMenuName = post.menu_name || '';
          if (displayMenuName.includes('|CATEGORIES:')) {
            displayMenuName = displayMenuName.split('|CATEGORIES:')[0];
          }
          if (displayMenuName.includes('|EXTRA_MEDIA:')) {
            displayMenuName = displayMenuName.split('|EXTRA_MEDIA:')[0];
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
    console.log('Like post:', postId);
  };

  const renderPostItem = ({ item }: { item: PostHistoryItem }) => {
    const createdDate = new Date(item.created_at);
    const isOwner = item.isOwner || false;

    // デバッグ: PostCardに渡すデータの確認
    console.log('=== DEBUG: PostCard Data ===', {
      id: item.id,
      media_url: item.media_url,
      mediaItems: item.mediaItems,
    });

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
        <Ionicons name="camera-outline" size={48} color="#bbb" />
      </View>
      <Text style={styles.emptyTitle}>まだ投稿がありません</Text>
      <Text style={styles.emptySubtitle}>
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
    <View style={styles.header}>
      <Text style={styles.headerTitle}>ポスト</Text>
      <Image
        source={require('@/assets/images/SalonCloudロゴ.png')}
        style={styles.headerLogo}
        resizeMode="contain"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {renderHeader()}

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
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
              tintColor="#1a1a1a"
            />
          }
          ListEmptyComponent={renderEmptyState}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  headerLogo: {
    width: 90,
    height: 28,
    marginRight: -12,
  },
  content: {
    flex: 1,
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
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyButtonIcon: {
    marginLeft: 8,
  },
});
