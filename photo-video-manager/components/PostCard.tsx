import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Animated,
  Pressable,
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
  mediaUri: string;
  mediaItems?: MediaItem[];
  isVideo: boolean;
  createdAt: Date;
  shootingDate: Date;
  description?: string;
  userProfile?: UserProfile;
  likesCount?: number;
  isLiked?: boolean;
}

interface PostCardProps {
  post: Post;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onLike?: () => void;
  showActions?: boolean;
  showProfile?: boolean;
}

// 相対時間を計算するヘルパー関数
const getRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'たった今';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}分前`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}時間前`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}日前`;
  } else if (diffInSeconds < 2592000) {
    const weeks = Math.floor(diffInSeconds / 604800);
    return `${weeks}週間前`;
  } else {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }
};

export default function PostCard({
  post,
  onPress,
  onEdit,
  onDelete,
  onLike,
  showActions = false,
  showProfile = true
}: PostCardProps) {
  const [isLiked, setIsLiked] = useState(post.isLiked || false);
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef<number>(0);

  const canEdit = () => {
    const now = Date.now();
    const postTime = post.createdAt.getTime();
    const daysSincePost = (now - postTime) / (1000 * 60 * 60 * 24);
    return daysSincePost <= 30;
  };

  // 複数メディアまたは単一メディアを取得
  const getMediaItems = (): MediaItem[] => {
    if (post.mediaItems && post.mediaItems.length > 0) {
      const sortedItems = post.mediaItems.sort((a: any, b: any) =>
        (a.displayOrder || a.display_order || 0) - (b.displayOrder || b.display_order || 0)
      );
      return sortedItems.map((item: any) => ({
        id: item.id,
        mediaUrl: item.mediaUrl || item.media_url,
        isVideo: item.isVideo || item.is_video,
        displayOrder: item.displayOrder || item.display_order || 0
      }));
    }
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
    if (post.userProfile?.avatar_url &&
        !post.userProfile.avatar_url.includes('placeholder') &&
        !post.userProfile.avatar_url.startsWith('file://')) {
      return { uri: post.userProfile.avatar_url };
    }
    return null;
  };

  // ダブルタップでいいね
  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;

    if (now - lastTap.current < DOUBLE_PRESS_DELAY) {
      // ダブルタップ検出
      if (!isLiked) {
        handleLike();
      }
      triggerHeartAnimation();
    }
    lastTap.current = now;
  };

  const triggerHeartAnimation = () => {
    setShowHeartAnimation(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 200,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowHeartAnimation(false);
    });
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
    onLike?.();
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    setCurrentMediaIndex(index);
  };

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <Pressable style={styles.mediaItem} onPress={handleDoubleTap}>
      <Image
        source={{ uri: item.mediaUrl }}
        style={styles.mediaImage}
        contentFit="cover"
      />
      {item.isVideo && (
        <View style={styles.videoPlayButton}>
          <Ionicons name="play" size={32} color="white" />
        </View>
      )}
    </Pressable>
  );

  // ドットインジケーター
  const renderDotIndicators = () => {
    if (mediaItems.length <= 1) return null;

    return (
      <View style={styles.dotContainer}>
        {mediaItems.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentMediaIndex && styles.dotActive
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Profile Header - Instagram style */}
      {showProfile && post.userProfile && (
        <View style={styles.profileHeader}>
          <TouchableOpacity style={styles.profileLeft}>
            <View style={styles.avatarRing}>
              {getAvatarSource() ? (
                <Image
                  source={getAvatarSource()}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.defaultAvatar}>
                  <Ionicons name="person" size={22} color="#666" />
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.displayName}>{post.userProfile.display_name}</Text>
              {post.menuName && (
                <Text style={styles.locationText}>{post.menuName}</Text>
              )}
            </View>
          </TouchableOpacity>

          {showActions && canEdit() && (
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => {
                // 三点メニューをタップした時のアクション
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#262626" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Media - Larger Instagram style */}
      <View style={styles.mediaContainer}>
        {mediaItems.length > 0 ? (
          <>
            {mediaItems.length === 1 ? (
              <Pressable style={styles.singleMediaWrapper} onPress={handleDoubleTap}>
                <Image
                  source={{ uri: mediaItems[0].mediaUrl }}
                  style={styles.singleMediaImage}
                  contentFit="cover"
                />
                {mediaItems[0].isVideo && (
                  <View style={styles.videoPlayButton}>
                    <Ionicons name="play" size={32} color="white" />
                  </View>
                )}
              </Pressable>
            ) : (
              <FlatList
                data={mediaItems}
                renderItem={renderMediaItem}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                pagingEnabled
                onScroll={handleScroll}
                scrollEventThrottle={16}
                style={styles.mediaList}
              />
            )}

            {/* ハートアニメーション */}
            {showHeartAnimation && (
              <Animated.View
                style={[
                  styles.heartAnimation,
                  { transform: [{ scale: heartScale }] }
                ]}
              >
                <Ionicons name="heart" size={80} color="white" />
              </Animated.View>
            )}

            {/* ドットインジケーター */}
            {renderDotIndicators()}
          </>
        ) : (
          <View style={styles.noMediaContainer}>
            <Ionicons name="image-outline" size={48} color="#ccc" />
            <Text style={styles.noMediaText}>画像なし</Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionBar}>
        <View style={styles.actionLeft}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
            <Ionicons
              name={isLiked ? "thumbs-up" : "thumbs-up-outline"}
              size={24}
              color={isLiked ? "#0095F6" : "#262626"}
            />
          </TouchableOpacity>
          {showActions && canEdit() && (
            <>
              <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
                <Ionicons name="create-outline" size={24} color="#262626" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={onDelete}>
                <Ionicons name="trash-outline" size={24} color="#ED4956" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Likes Count */}
      {likesCount > 0 && (
        <Text style={styles.likesCount}>いいね！ {likesCount.toLocaleString()}件</Text>
      )}

      {/* Caption */}
      <View style={styles.captionContainer}>
        {post.userProfile && (
          <Text style={styles.caption}>
            <Text style={styles.captionUsername}>{post.userProfile.display_name}</Text>
            {'  '}
            {post.title}
          </Text>
        )}
        {post.description && (
          <Text style={styles.captionMore} numberOfLines={2}>
            {post.description}
          </Text>
        )}
      </View>

      {/* Timestamp */}
      <Text style={styles.timestamp}>{getRelativeTime(post.createdAt)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#C13584',
    padding: 2,
    marginRight: 10,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
  },
  defaultAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  locationText: {
    fontSize: 12,
    color: '#262626',
    marginTop: 1,
  },
  moreButton: {
    padding: 8,
  },
  mediaContainer: {
    width: width,
    height: width,
    position: 'relative',
    backgroundColor: '#fafafa',
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
    width: width,
    height: width,
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  videoPlayButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -24,
    marginLeft: -24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -40,
    marginLeft: -40,
  },
  dotContainer: {
    position: 'absolute',
    bottom: 12,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 2,
  },
  dotActive: {
    backgroundColor: '#0095F6',
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
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginRight: 8,
  },
  likesCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  captionContainer: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  caption: {
    fontSize: 14,
    color: '#262626',
    lineHeight: 18,
  },
  captionUsername: {
    fontWeight: '600',
  },
  captionMore: {
    fontSize: 14,
    color: '#8e8e8e',
    lineHeight: 18,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    color: '#8e8e8e',
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
});
