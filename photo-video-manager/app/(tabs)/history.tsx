import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Text, 
  Alert,
  RefreshControl
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { postService, authService, supabase } from '@/lib/supabase';

interface PostHistoryItem {
  id: string;
  title: string;
  menu_name: string;
  media_url: string;
  is_video: boolean;
  likes_count: number;
  created_at: string;
  user_id: string;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      // 現在のユーザーを取得
      const { data: { user } } = await authService.getCurrentUser();
      
      if (!user) {
        // ユーザーがログインしていない場合はログイン画面へリダイレクト
        router.replace('/login');
        return;
      }

      // Supabaseからpostsテーブルのデータを取得
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // データが取得できた場合は設定、なければ空配列
      setPosts(data || []);
    } catch (error) {
      console.error('Error loading posts:', error);
      Alert.alert('エラー', '投稿データの読み込みに失敗しました。');
      // エラーが発生した場合も空配列を設定
      setPosts([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  };

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  };

  const formatTime = (date: Date) => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleEditPost = (post: PostHistoryItem) => {
    Alert.alert(
      'ポスト編集',
      `「${post.title}」を編集しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '編集', onPress: () => {
          router.push(`/post/edit/${post.id}`);
        }}
      ]
    );
  };

  const handleDeletePost = (post: PostHistoryItem) => {
    Alert.alert(
      'ポスト削除',
      `「${post.title}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: async () => {
          try {
            // TODO: Supabaseから削除
            // await postService.deletePost(post.id);
            
            setPosts(prevPosts => prevPosts.filter(p => p.id !== post.id));
            Alert.alert('削除完了', 'ポストを削除しました。');
          } catch (error) {
            console.error('Error deleting post:', error);
            Alert.alert('エラー', '削除に失敗しました。');
          }
        }}
      ]
    );
  };

  const renderPostItem = ({ item }: { item: PostHistoryItem }) => (
    <TouchableOpacity 
      style={styles.postItem}
      onPress={() => Alert.alert('ポスト詳細', `タイトル: ${item.title}\nメニュー: ${item.menuName}`)}
      activeOpacity={0.7}
    >
      <View style={styles.postImageContainer}>
        <Image
          source={{ uri: item.firstMediaUri }}
          style={styles.postImage}
          contentFit="cover"
        />
        {item.isVideo && (
          <View style={styles.videoIndicator}>
            <Ionicons name="play" size={16} color="white" />
          </View>
        )}
        {item.mediaCount > 1 && (
          <View style={styles.mediaCountBadge}>
            <Ionicons name="copy-outline" size={12} color="white" />
            <Text style={styles.mediaCountText}>{item.mediaCount}</Text>
          </View>
        )}
      </View>
      
      <View style={styles.postContent}>
        <View style={styles.postHeader}>
          <Text style={styles.postTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.postDate}>
            {formatDate(item.shootingDate)} {formatTime(item.createdAt)}
          </Text>
        </View>
        
        <Text style={styles.menuName}>{item.menuName}</Text>
        
        {item.comment ? (
          <Text style={styles.postComment} numberOfLines={2}>
            {item.comment}
          </Text>
        ) : null}
        
        <View style={styles.postActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleEditPost(item)}
          >
            <Ionicons name="create-outline" size={16} color="#666" />
            <Text style={styles.actionText}>編集</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleDeletePost(item)}
          >
            <Ionicons name="trash-outline" size={16} color="#ff4444" />
            <Text style={[styles.actionText, { color: '#ff4444' }]}>削除</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-text-outline" size={80} color="#ccc" />
      <Text style={styles.emptyTitle}>ポストがありません</Text>
      <Text style={styles.emptySubtitle}>
        カメラで撮影してポストを作成しましょう
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ポスト</Text>
        <View style={styles.headerActions}>
          <Text style={styles.postCount}>{posts.length}件</Text>
          <TouchableOpacity style={styles.headerButton} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={24} color="#262626" />
          </TouchableOpacity>
        </View>
      </View>
      
      <FlatList
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
      />
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#262626',
    letterSpacing: 0.5,
  },
  postCount: {
    fontSize: 14,
    color: '#8e8e8e',
    fontWeight: '500',
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flex: 1,
    padding: 16,
  },
  postItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  postImageContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  videoIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaCountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mediaCountText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  postContent: {
    padding: 16,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    flex: 1,
    marginRight: 8,
  },
  postDate: {
    fontSize: 12,
    color: '#8e8e8e',
    fontWeight: '500',
  },
  menuName: {
    fontSize: 14,
    color: '#0095f6',
    fontWeight: '600',
    marginBottom: 8,
  },
  postComment: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8e8e8e',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
    lineHeight: 20,
  },
});