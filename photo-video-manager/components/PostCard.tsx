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
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef<number>(0);

  const handleImageError = (mediaId: string) => {
    console.log('Image load error for:', mediaId);
    setImageErrors(prev => new Set(prev).add(mediaId));
  };

  const canEdit = () => {
    const now = Date.now();
    const postTime = post.createdAt.getTime();
    const daysSincePost = (now - postTime) / (1000 * 60 * 60 * 24);
    return daysSincePost <= 30;
  };

  const getMediaItems = (): MediaItem[] => {
    if (post.mediaItems && post.mediaItems.length > 0) {
      const sortedItems = post.mediaItems.sort((a: any, b: any) =>
        (a.displayOrder || a.display_order || 0) - (b.displayOrder || b.display_order || 0)
      );
      const mappedItems = sortedItems.map((item: any) => ({
        id: item.id,
        mediaUrl: item.mediaUrl || item.media_url,
        isVideo: item.isVideo || item.is_video,
        displayOrder: item.displayOrder || item.display_order || 0
      }));
      // 有効な mediaUrl を持つアイテムのみをフィルタリング
      const validItems = mappedItems.filter(item => item.mediaUrl && item.mediaUrl.trim() !== '');
      if (validItems.length > 0) {
        return validItems;
      }
    }
    // mediaItems が空または無効な場合、mediaUri にフォールバック
    if (post.mediaUri && post.mediaUri.trim() !== '') {
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

  const getAvatarSource = () => {
    if (post.userProfile?.avatar_url &&
        !post.userProfile.avatar_url.includes('placeholder') &&
        !post.userProfile.avatar_url.startsWith('file://')) {
      return { uri: post.userProfile.avatar_url };
    }
    return null;
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;

    if (now - lastTap.current < DOUBLE_PRESS_DELAY) {
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
      {imageErrors.has(item.id) ? (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={48} color="#ccc" />
          <Text style={styles.placeholderText}>画像を読み込めません</Text>
        </View>
      ) : (
        <Image
          source={{ uri: item.mediaUrl }}
          style={styles.mediaImage}
          contentFit="cover"
          onError={() => handleImageError(item.id)}
        />
      )}
      {item.isVideo && !imageErrors.has(item.id) && (
        <View style={styles.videoPlayButton}>
          <Ionicons name="play" size={32} color="white" />
        </View>
      )}
    </Pressable>
  );

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
      {/* Profile Header */}
      {showProfile && post.userProfile && (
        <View style={styles.profileHeader}>
          <TouchableOpacity style={styles.profileLeft} activeOpacity={0.7}>
            <View style={styles.avatarContainer}>
              {getAvatarSource() ? (
                <Image
                  source={getAvatarSource()}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.defaultAvatar}>
                  <Ionicons name="person" size={20} color="#999" />
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
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#1a1a1a" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Media */}
      <View style={styles.mediaContainer}>
        {mediaItems.length > 0 ? (
          <>
            {mediaItems.length === 1 ? (
              <Pressable style={styles.singleMediaWrapper} onPress={handleDoubleTap}>
                {imageErrors.has(mediaItems[0].id) ? (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={48} color="#ccc" />
                    <Text style={styles.placeholderText}>画像を読み込めません</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: mediaItems[0].mediaUrl }}
                    style={styles.singleMediaImage}
                    contentFit="cover"
                    onError={() => handleImageError(mediaItems[0].id)}
                  />
                )}
                {mediaItems[0].isVideo && !imageErrors.has(mediaItems[0].id) && (
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
          <TouchableOpacity style={styles.actionButton} onPress={handleLike} activeOpacity={0.7}>
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={26}
              color={isLiked ? "#FF3B30" : "#1a1a1a"}
            />
          </TouchableOpacity>
          {showActions && canEdit() && (
            <>
              <TouchableOpacity style={styles.actionButton} onPress={onEdit} activeOpacity={0.7}>
                <Ionicons name="create-outline" size={24} color="#1a1a1a" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={onDelete} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={24} color="#FF3B30" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Likes Count */}
      {likesCount > 0 && (
        <Text style={styles.likesCount}>いいね {likesCount.toLocaleString()}件</Text>
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
    backgroundColor: '#fff',
    marginBottom: 12,
    borderRadius: 0,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    overflow: 'hidden',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  defaultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  locationText: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  moreButton: {
    padding: 8,
  },
  mediaContainer: {
    width: width,
    height: width,
    position: 'relative',
    backgroundColor: '#f5f5f5',
  },
  singleMediaWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  singleMediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#f5f5f5',
  },
  videoPlayButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 28,
    width: 56,
    height: 56,
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
    bottom: 16,
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
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noMediaContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noMediaText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 13,
    marginTop: 8,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginRight: 4,
  },
  likesCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  captionContainer: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  caption: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
  },
  captionUsername: {
    fontWeight: '600',
  },
  captionMore: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    marginTop: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#aaa',
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginTop: 4,
  },
});
