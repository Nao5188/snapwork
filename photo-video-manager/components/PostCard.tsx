import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');


interface MediaItem {
  id: string;
  mediaUrl: string;
  isVideo: boolean;
  displayOrder: number;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface Post {
  id: string;
  title: string;
  menuName: string;
  mediaUri: string; // 後方互換性のため残す
  mediaItems?: MediaItem[]; // 新しい複数メディア対応
  isVideo: boolean;
  createdAt: Date;
  shootingDate: Date;
  description?: string;
  userProfile?: UserProfile; // ユーザープロフィール情報
}

interface PostCardProps {
  post: Post;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  showProfile?: boolean;
}

export default function PostCard({
  post,
  onPress,
  onEdit,
  onDelete,
  showActions = false,
  showProfile = true
}: PostCardProps) {
  const formatDate = (date: Date) => {
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  };

  const formatTime = (date: Date) => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const canEdit = () => {
    const now = Date.now();
    const postTime = post.createdAt.getTime();
    const daysSincePost = (now - postTime) / (1000 * 60 * 60 * 24);
    const canEditPost = daysSincePost <= 30; // 30日間に延長してテスト

    console.log('=== EDIT CHECK ===');
    console.log('Post ID:', post.id);
    console.log('Current time:', new Date(now).toLocaleString());
    console.log('Post created:', new Date(postTime).toLocaleString());
    console.log('Days since post:', daysSincePost.toFixed(2));
    console.log('Can edit (≤30 days):', canEditPost);
    console.log('==================');

    return canEditPost;
  };

  // 複数メディアまたは単一メディアを取得
  const getMediaItems = (): MediaItem[] => {
    if (post.mediaItems && post.mediaItems.length > 0) {
      // display_order または displayOrder プロパティでソート
      const sortedItems = post.mediaItems.sort((a, b) =>
        (a.displayOrder || a.display_order || 0) - (b.displayOrder || b.display_order || 0)
      );
      return sortedItems.map(item => ({
        id: item.id,
        mediaUrl: item.mediaUrl || item.media_url,
        isVideo: item.isVideo || item.is_video,
        displayOrder: item.displayOrder || item.display_order || 0
      }));
    }
    // 後方互換性: 単一メディアの場合
    if (post.mediaUri) {
      return [{
        id: '0',
        mediaUrl: post.mediaUri,
        isVideo: post.isVideo,
        displayOrder: 0
      }];
    }
    return [];
  };

  const mediaItems = getMediaItems();

  // デフォルトアバター画像のURL
  const getAvatarSource = () => {
    if (post.userProfile?.avatar_url && !post.userProfile.avatar_url.includes('placeholder')) {
      return { uri: post.userProfile.avatar_url };
    }
    // デフォルトアバター（Ioniconsのperson-circle）
    return null;
  };

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <View style={styles.mediaItem}>
      <Image
        source={{ uri: item.mediaUrl }}
        style={styles.mediaImage}
        contentFit="cover"
      />
      {item.isVideo && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={20} color="white" />
        </View>
      )}
      {mediaItems.length > 1 && (
        <View style={styles.mediaCounter}>
          <Text style={styles.mediaCounterText}>{index + 1}/{mediaItems.length}</Text>
        </View>
      )}
    </View>
  );

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Profile Section - Top */}
      {showProfile && post.userProfile && (
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {getAvatarSource() ? (
              <Image
                source={getAvatarSource()}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.defaultAvatar}>
                <Ionicons name="person" size={20} color="#666" />
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName}>{post.userProfile.display_name}</Text>
              <Text style={styles.username}>@{post.userProfile.username}</Text>
            </View>
            <Text style={styles.postTime}>
              {formatDate(post.shootingDate)} {formatTime(post.createdAt)}
            </Text>
          </View>
        </View>
      )}

      {/* Media */}
      <View style={styles.mediaContainer}>
        {mediaItems.length > 0 ? (
          mediaItems.length === 1 ? (
            // 単一メディアの場合
            <View style={styles.singleMediaWrapper}>
              <Image
                source={{ uri: mediaItems[0].mediaUrl }}
                style={styles.singleMediaImage}
                contentFit="cover"
              />
              {mediaItems[0].isVideo && (
                <View style={styles.videoIndicator}>
                  <Ionicons name="play" size={20} color="white" />
                </View>
              )}
            </View>
          ) : (
            // 複数メディアの場合
            <FlatList
              data={mediaItems}
              renderItem={renderMediaItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              style={styles.mediaList}
            />
          )
        ) : (
          // フォールバック表示
          <View style={styles.noMediaContainer}>
            <Ionicons name="image-outline" size={40} color="#ccc" />
            <Text style={styles.noMediaText}>画像なし</Text>
          </View>
        )}

      </View>
      
      {/* Content */}
      <View style={styles.content}>
        <View style={styles.postContent}>
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.menuName}>{post.menuName}</Text>
        </View>
        
        {post.description && (
          <Text style={styles.description} numberOfLines={2}>
            {post.description}
          </Text>
        )}
        
        <View style={styles.footer}>
          {(() => {
            console.log('=== FOOTER DEBUG ===');
            console.log('Post ID:', post.id);
            console.log('showActions:', showActions);
            console.log('canEdit():', canEdit());
            console.log('===================');
            return null;
          })()}
          {showActions && (
            <View style={styles.actions}>
              {canEdit() && (
                <>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEdit?.();
                    }}
                  >
                    <Ionicons name="create-outline" size={16} color="#666" />
                    <Text style={styles.actionText}>編集</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onDelete?.();
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ff4444" />
                    <Text style={[styles.actionText, { color: '#ff4444' }]}>削除</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
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
  mediaContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  singleMediaWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  singleMediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  mediaList: {
    width: '100%',
    height: '100%',
  },
  mediaItem: {
    width: width - 32,
    height: 200,
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  mediaCounter: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mediaCounterText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  noMediaContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noMediaText: {
    color: '#8e8e8e',
    fontSize: 14,
    marginTop: 8,
  },
  videoIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  defaultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
    marginRight: 8,
  },
  username: {
    fontSize: 14,
    color: '#8e8e8e',
    fontWeight: '400',
  },
  postTime: {
    fontSize: 13,
    color: '#8e8e8e',
    fontWeight: '400',
  },
  postContent: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '400',
    color: '#262626',
    marginBottom: 8,
    lineHeight: 20,
  },
  menuName: {
    fontSize: 14,
    color: '#0095f6',
    fontWeight: '500',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
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
});