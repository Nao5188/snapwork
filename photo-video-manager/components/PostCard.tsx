import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Animated,
  Pressable,
  AccessibilityInfo,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import SkeletonLoader from './SkeletonLoader';

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
  index?: number;
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
  index = 0,
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
  const [imageLoading, setImageLoading] = useState<Set<string>>(new Set(['initial']));
  const [reduceMotion, setReduceMotion] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartRotation = useRef(new Animated.Value(0)).current;
  const lastTap = useRef<number>(0);

  // 控えめなスライドインアニメーション
  const slideAnim = useRef(new Animated.Value(15)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // いいねボタンのアニメーション
  const likeButtonScale = useRef(new Animated.Value(1)).current;
  const likeButtonRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // reduceMotion設定を確認
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      // アニメーションを無効化
      slideAnim.setValue(0);
      fadeAnim.setValue(1);
      return;
    }

    // 控えめなアニメーション（短い時間、少ない遅延）
    const delay = Math.min(index * 50, 200); // 最大遅延を200msに制限
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduceMotion]);

  const handleImageError = (mediaId: string) => {
    console.log('Image load error for:', mediaId);
    setImageErrors(prev => new Set(prev).add(mediaId));
    setImageLoading(prev => {
      const next = new Set(prev);
      next.delete(mediaId);
      return next;
    });
  };

  const handleImageLoad = (mediaId: string) => {
    setImageLoading(prev => {
      const next = new Set(prev);
      next.delete(mediaId);
      next.delete('initial');
      return next;
    });
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
    if (reduceMotion) return;

    setShowHeartAnimation(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 120,
        friction: 10,
      }),
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 150,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowHeartAnimation(false);
    });
  };

  const handleLike = () => {
    // 触覚フィードバック
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // 強化されたいいねボタンアニメーション
    if (!reduceMotion) {
      // スケールアニメーション
      Animated.sequence([
        Animated.timing(likeButtonScale, {
          toValue: 0.7,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(likeButtonScale, {
          toValue: 1.2,
          useNativeDriver: true,
          friction: 3,
          tension: 150,
        }),
        Animated.spring(likeButtonScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 4,
          tension: 100,
        }),
      ]).start();

      // いいね時はハートがバウンドする
      if (!isLiked) {
        Animated.sequence([
          Animated.timing(likeButtonRotate, {
            toValue: -0.1,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(likeButtonRotate, {
            toValue: 0.1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(likeButtonRotate, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }

    setIsLiked(!isLiked);
    setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
    onLike?.();
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const mediaWidth = width - 32;
    const index = Math.round(offsetX / mediaWidth);
    setCurrentMediaIndex(index);
  };

  const handleMorePress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['キャンセル', '編集', '削除'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            onEdit?.();
          } else if (buttonIndex === 2) {
            onDelete?.();
          }
        }
      );
    } else {
      Alert.alert(
        '操作を選択',
        '',
        [
          { text: '編集', onPress: () => onEdit?.() },
          { text: '削除', style: 'destructive', onPress: () => onDelete?.() },
          { text: 'キャンセル', style: 'cancel' },
        ]
      );
    }
  };

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <Pressable style={styles.mediaItem} onPress={handleDoubleTap}>
      {imageErrors.has(item.id) ? (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={48} color="#ccc" />
          <Text style={styles.placeholderText}>画像を読み込めません</Text>
        </View>
      ) : (
        <>
          {imageLoading.has(item.id) && (
            <View style={styles.skeletonContainer}>
              <SkeletonLoader width="100%" height={width} borderRadius={0} />
            </View>
          )}
          <Image
            source={{ uri: item.mediaUrl }}
            style={[styles.mediaImage, imageLoading.has(item.id) && { opacity: 0 }]}
            contentFit="cover"
            onError={() => handleImageError(item.id)}
            onLoad={() => handleImageLoad(item.id)}
          />
        </>
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
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
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
            </View>
          </TouchableOpacity>

          {showActions && canEdit() && (
            <TouchableOpacity
              style={styles.moreButton}
              activeOpacity={0.7}
              onPress={handleMorePress}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color="#1a1a1a" />
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
                snapToInterval={width - 32}
                decelerationRate="fast"
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

      {/* Post Info Card */}
      <View style={styles.postInfoCard}>
        {/* Categories */}
        {post.description && (
          <View style={styles.categoriesContainer}>
            {post.description.split(',').map((category, index) => (
              <View key={index} style={styles.categoryButton}>
                <Text style={styles.categoryButtonText}>{category.trim()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Title */}
        {post.title && (
          <Text style={styles.postTitle}>{post.title}</Text>
        )}

        {/* Menu Name */}
        {post.menuName && (
          <Text style={styles.menuName}>{post.menuName}</Text>
        )}

        {/* Timestamp */}
        <View style={styles.timestampContainer}>
          <Ionicons name="time-outline" size={13} color="#aaa" />
          <Text style={styles.timestamp}>{getRelativeTime(post.createdAt)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginBottom: 16,
    marginHorizontal: 0,
    borderRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  skeletonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
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
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  moreButton: {
    padding: 12,
    marginRight: -4,
  },
  mediaContainer: {
    width: width - 32,
    height: width - 32,
    position: 'relative',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    borderRadius: 8,
    overflow: 'hidden',
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
    width: width - 32,
    height: width - 32,
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
  postInfoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryButton: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryButtonText: {
    fontSize: 13,
    color: '#5B21B6',
    fontWeight: '600',
  },
  postTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  menuName: {
    fontSize: 14,
    color: '#777',
    marginBottom: 12,
    lineHeight: 20,
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#aaa',
  },
});
