import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import SkeletonLoader from './SkeletonLoader';
import { useAppTheme } from '@/lib/ThemeContext';

const { width } = Dimensions.get('window');
const CARD_MEDIA_HEIGHT = width * 1.2;

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
}

interface PostCardProps {
  post: Post;
  index?: number;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
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
  } else {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    if (year === now.getFullYear()) {
      return `${month}月${day}日`;
    }
    return `${year}年${month}月${day}日`;
  }
};

export default function PostCard({
  post,
  index = 0,
  onPress,
  onEdit,
  onDelete,
  onDownload,
  onLike,
  showActions = false,
  showProfile = true
}: PostCardProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [imageLoading, setImageLoading] = useState<Set<string>>(new Set(['initial']));
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, string>>({});
  const [reduceMotion, setReduceMotion] = useState(false);
  const { colors } = useAppTheme();

  // 控えめなスライドインアニメーション
  const slideAnim = useRef(new Animated.Value(15)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // reduceMotion設定を確認
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const generateThumbnail = useCallback(async (id: string, uri: string) => {
    if (!uri) return;
    try {
      // time: 1000ms を使用して空白フレームを回避
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000, quality: 0.6 });
      setVideoThumbnails(prev => ({ ...prev, [id]: thumbUri }));
    } catch {
      // サムネイル生成失敗時はフォールバック（暗い背景）を表示
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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


  const mediaItems = useMemo((): MediaItem[] => {
    if (post.mediaItems && post.mediaItems.length > 0) {
      const sortedItems = [...post.mediaItems].sort((a: any, b: any) =>
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
  }, [post.mediaItems, post.mediaUri, post.isVideo]);

  useEffect(() => {
    mediaItems.forEach(item => {
      if (item.isVideo && !videoThumbnails[item.id]) {
        generateThumbnail(item.id, item.mediaUrl);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaItems]);

  const singleItem = mediaItems.length === 1 ? mediaItems[0] : null;
  const isSingleVideoPlaying = singleItem ? playingVideoId === singleItem.id : false;

  const getAvatarSource = () => {
    if (post.userProfile?.avatar_url &&
        !post.userProfile.avatar_url.includes('placeholder') &&
        !post.userProfile.avatar_url.startsWith('file://')) {
      return { uri: post.userProfile.avatar_url };
    }
    return null;
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    setCurrentMediaIndex(index);
  };

  const handleMorePress = () => {
    if (Platform.OS === 'ios') {
      if (showActions && onDownload) {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ['キャンセル', '保存', '編集', '削除'], destructiveButtonIndex: 3, cancelButtonIndex: 0 },
          (buttonIndex) => {
            if (buttonIndex === 1) onDownload?.();
            else if (buttonIndex === 2) onEdit?.();
            else if (buttonIndex === 3) onDelete?.();
          }
        );
      } else if (showActions) {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ['キャンセル', '編集', '削除'], destructiveButtonIndex: 2, cancelButtonIndex: 0 },
          (buttonIndex) => {
            if (buttonIndex === 1) onEdit?.();
            else if (buttonIndex === 2) onDelete?.();
          }
        );
      } else if (onDownload) {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ['キャンセル', '保存'], cancelButtonIndex: 0 },
          (buttonIndex) => {
            if (buttonIndex === 1) onDownload?.();
          }
        );
      }
    } else {
      const buttons: any[] = [
        ...(onDownload ? [{ text: '保存', onPress: () => onDownload() }] : []),
        ...(showActions ? [
          { text: '編集', onPress: () => onEdit?.() },
          { text: '削除', style: 'destructive', onPress: () => onDelete?.() },
        ] : []),
        { text: 'キャンセル', style: 'cancel' },
      ];
      Alert.alert('操作を選択', '', buttons);
    }
  };

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => {
    const isPlaying = playingVideoId === item.id;
    return (
      <Pressable
        style={styles.mediaItem}
        onPress={item.isVideo
          ? () => setPlayingVideoId(isPlaying ? null : item.id)
          : undefined
        }
      >
        {item.isVideo ? (
          isPlaying ? (
            <Video
              source={{ uri: item.mediaUrl }}
              style={styles.mediaImage}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isMuted={false}
              useNativeControls
              onPlaybackStatusUpdate={(status: any) => {
                if (status.isLoaded && status.didJustFinish) {
                  setPlayingVideoId(null);
                }
              }}
            />
          ) : (
            <View style={[styles.mediaImage, styles.videoThumbnailBg]}>
              {videoThumbnails[item.id] ? (
                <Image
                  source={{ uri: videoThumbnails[item.id] }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.4)" />
              )}
            </View>
          )
        ) : imageErrors.has(item.id) ? (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="image-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.placeholderText, { color: colors.textMuted }]}>画像を読み込めません</Text>
          </View>
        ) : (
          <>
            {imageLoading.has(item.id) && (
              <View style={styles.skeletonContainer}>
                <SkeletonLoader width="100%" height={CARD_MEDIA_HEIGHT} borderRadius={0} />
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
        {item.isVideo && !isPlaying && (
          <View style={styles.videoPlayButton}>
            <Ionicons name="play" size={32} color="white" />
          </View>
        )}
      </Pressable>
    );
  };

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
          backgroundColor: colors.surface,
        },
      ]}
    >
      {/* Profile Header */}
      {(showProfile && post.userProfile) || showActions ? (
        <View style={[styles.profileHeader, { backgroundColor: colors.surface }]}>
          {showProfile && post.userProfile ? (
            <TouchableOpacity style={styles.profileLeft} activeOpacity={0.7}>
              <View style={[styles.avatarContainer, { borderColor: colors.borderLight }]}>
                {getAvatarSource() ? (
                  <Image
                    source={getAvatarSource()}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.defaultAvatar, { backgroundColor: colors.surface2 }]}>
                    <Ionicons name="person" size={20} color={colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.displayName, { color: colors.text }]}>{post.userProfile.display_name}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.profileLeft} />
          )}

          {(showActions || onDownload) && (
            <TouchableOpacity
              style={styles.moreButton}
              activeOpacity={0.7}
              onPress={handleMorePress}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Media */}
      <View style={[styles.mediaContainer, { backgroundColor: colors.surface2 }]}>
        {mediaItems.length > 0 ? (
          <>
            {mediaItems.length === 1 && singleItem ? (
              <Pressable
                style={styles.singleMediaWrapper}
                onPress={singleItem.isVideo
                  ? () => setPlayingVideoId(isSingleVideoPlaying ? null : singleItem.id)
                  : undefined
                }
              >
                {singleItem.isVideo ? (
                  isSingleVideoPlaying ? (
                    <Video
                      source={{ uri: singleItem.mediaUrl }}
                      style={styles.singleMediaImage}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay
                      isMuted={false}
                      useNativeControls
                      onPlaybackStatusUpdate={(status: any) => {
                        if (status.isLoaded && status.didJustFinish) {
                          setPlayingVideoId(null);
                        }
                      }}
                    />
                  ) : (
                    <View style={[styles.singleMediaImage, styles.videoThumbnailBg]}>
                      {videoThumbnails[singleItem.id] ? (
                        <Image
                          source={{ uri: videoThumbnails[singleItem.id] }}
                          style={StyleSheet.absoluteFillObject}
                          contentFit="cover"
                        />
                      ) : (
                        <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.4)" />
                      )}
                    </View>
                  )
                ) : imageErrors.has(singleItem.id) ? (
                  <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface2 }]}>
                    <Ionicons name="image-outline" size={48} color={colors.textMuted} />
                    <Text style={[styles.placeholderText, { color: colors.textMuted }]}>画像を読み込めません</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: singleItem.mediaUrl }}
                    style={styles.singleMediaImage}
                    contentFit="cover"
                    onError={() => handleImageError(singleItem.id)}
                  />
                )}
                {singleItem.isVideo && !isSingleVideoPlaying && (
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
                snapToInterval={width}
                decelerationRate="fast"
                onScroll={handleScroll}
                scrollEventThrottle={16}
                style={styles.mediaList}
              />
            )}

            {renderDotIndicators()}
          </>
        ) : (
          <View style={[styles.noMediaContainer, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="image-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.noMediaText, { color: colors.textMuted }]}>画像なし</Text>
          </View>
        )}
      </View>

      {/* Post Info Card */}
      <View style={[styles.postInfoCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {/* Title */}
        {post.title && (
          <Text style={[styles.postTitle, { color: colors.text }]}>{post.title}</Text>
        )}

        {/* Categories */}
        {post.description && (
          <View style={styles.categoriesContainer}>
            {post.description.split(',').map((category, index) => (
              <View key={index} style={[styles.categoryButton, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.categoryButtonText, { color: colors.textSecondary }]}>{category.trim()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Timestamp */}
        <View style={styles.timestampContainer}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.timestamp, { color: colors.textMuted }]}>{getRelativeTime(post.createdAt)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
    marginHorizontal: 0,
    borderRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
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
    marginRight: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#f5f5f5',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fafafa',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#444444',
    letterSpacing: -0.2,
  },
  moreButton: {
    padding: 8,
    marginRight: -4,
  },
  mediaContainer: {
    width: width,
    height: CARD_MEDIA_HEIGHT,
    position: 'relative',
    backgroundColor: '#fafafa',
    marginHorizontal: 0,
    borderRadius: 0,
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
    backgroundColor: '#fafafa',
  },
  mediaList: {
    width: '100%',
    height: '100%',
  },
  mediaItem: {
    width: width,
    height: CARD_MEDIA_HEIGHT,
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fafafa',
  },
  videoThumbnailBg: {
    backgroundColor: '#1a1a1a',
  },
  videoPlayButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 28,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotContainer: {
    position: 'absolute',
    bottom: 14,
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
    backgroundColor: '#fafafa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noMediaText: {
    color: '#999999',
    fontSize: 14,
    marginTop: 8,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999999',
    fontSize: 13,
    marginTop: 8,
  },
  postInfoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  categoryButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  categoryButtonText: {
    fontSize: 12,
    color: '#444444',
    fontWeight: '600',
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#444444',
    marginBottom: 8,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#999999',
  },
});
