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
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import SkeletonLoader from './SkeletonLoader';
import { useAppTheme } from '@/lib/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HORIZONTAL_MARGIN = 10;
const CARD_PADDING = 10;
const MEDIA_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2 - CARD_PADDING * 2;
const DEFAULT_MEDIA_ASPECT_RATIO = 3 / 4;

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
  avatar_url?: string | null;
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
  showActions = false,
  showProfile = true
}: PostCardProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [imageLoading, setImageLoading] = useState<Set<string>>(new Set(['initial']));
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, string>>({});
  const [mediaAspectRatios, setMediaAspectRatios] = useState<Record<string, number>>({});
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

  useEffect(() => {
    let cancelled = false;

    mediaItems.forEach((item) => {
      if (!item.mediaUrl || item.isVideo || mediaAspectRatios[item.id]) {
        return;
      }

      RNImage.getSize(
        item.mediaUrl,
        (imageWidth, imageHeight) => {
          if (cancelled || imageWidth <= 0 || imageHeight <= 0) return;
          const aspectRatio = imageWidth / imageHeight;
          setMediaAspectRatios((prev) => (
            prev[item.id] ? prev : { ...prev, [item.id]: aspectRatio }
          ));
        },
        () => {
          // 取得できない場合は仮比率のまま、画像自体はそのまま表示します。
        }
      );
    });

    return () => {
      cancelled = true;
    };
  }, [mediaItems, mediaAspectRatios]);

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

  const categoryTags = useMemo(() => {
    return (post.description || '')
      .split(',')
      .map((category) => category.trim())
      .filter(Boolean)
      .map((category) => category.startsWith('#') ? category : `#${category}`);
  }, [post.description]);

  const bodyText = (post.menuName || '').trim();
  const currentMediaItem = mediaItems[currentMediaIndex] || singleItem || mediaItems[0] || null;
  const currentMediaAspectRatio = currentMediaItem
    ? mediaAspectRatios[currentMediaItem.id] || DEFAULT_MEDIA_ASPECT_RATIO
    : DEFAULT_MEDIA_ASPECT_RATIO;
  const mediaHeight = Math.round(MEDIA_WIDTH / currentMediaAspectRatio);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / MEDIA_WIDTH);
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

  const renderMediaItem = ({ item }: { item: MediaItem; index: number }) => {
    const isPlaying = playingVideoId === item.id;
    return (
      <Pressable
        style={[styles.mediaItem, { height: mediaHeight }]}
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
                <SkeletonLoader width="100%" height={mediaHeight} borderRadius={0} />
              </View>
            )}
            <Image
              source={{ uri: item.mediaUrl }}
              style={[styles.mediaImage, imageLoading.has(item.id) && { opacity: 0 }]}
              contentFit="contain"
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

  const renderMediaCounter = () => {
    if (mediaItems.length <= 1) return null;

    return (
      <View style={styles.mediaCounter}>
        <Text style={styles.mediaCounterText}>
          {currentMediaIndex + 1}/{mediaItems.length}
        </Text>
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
          borderColor: colors.borderLight,
        },
      ]}
    >
      {/* Profile Header */}
      {(showProfile && post.userProfile) || showActions ? (
        <View style={[styles.profileHeader, { backgroundColor: colors.surface }]}>
          {showProfile && post.userProfile ? (
            <TouchableOpacity style={styles.profileLeft} activeOpacity={0.7}>
              <View style={[styles.avatarContainer, { backgroundColor: colors.borderLight }]}>
                {getAvatarSource() ? (
                  <View style={styles.avatarClip}>
                    <Image
                      source={getAvatarSource()}
                      style={styles.avatar}
                      contentFit="cover"
                    />
                  </View>
                ) : (
                  <View style={[styles.avatarClip, styles.defaultAvatar, { backgroundColor: colors.surface2 }]}>
                    <View style={[styles.defaultAvatarHead, { backgroundColor: colors.textMuted }]} />
                    <View style={[styles.defaultAvatarBody, { backgroundColor: colors.textMuted }]} />
                  </View>
                )}
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                  {post.userProfile.display_name || post.userProfile.username || 'ユーザー'}
                </Text>
                <Text style={[styles.profileTimestamp, { color: colors.textMuted }]}>
                  {getRelativeTime(post.createdAt)}
                </Text>
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
      <View style={[styles.mediaContainer, { backgroundColor: colors.surface2, height: mediaHeight }]}>
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
                    contentFit="contain"
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
                snapToInterval={MEDIA_WIDTH}
                decelerationRate="fast"
                onScroll={handleScroll}
                scrollEventThrottle={16}
                style={styles.mediaList}
              />
            )}

            {renderMediaCounter()}
          </>
        ) : (
          <View style={[styles.noMediaContainer, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="image-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.noMediaText, { color: colors.textMuted }]}>画像なし</Text>
          </View>
        )}
      </View>

      {/* Post Info Card */}
      <View style={[styles.postInfoCard, { backgroundColor: colors.surface }]}>
        {post.title && (
          <Text style={[styles.postTitle, { color: colors.text }]}>{post.title}</Text>
        )}

        {bodyText ? (
          <Text style={[styles.postBody, { color: colors.textSecondary }]} numberOfLines={2}>
            {bodyText}
          </Text>
        ) : null}

        {categoryTags.length > 0 && (
          <Text style={styles.categoryText} numberOfLines={2}>
            {categoryTags.join(' ')}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: CARD_HORIZONTAL_MARGIN,
    marginTop: 10,
    marginBottom: 14,
    padding: CARD_PADDING,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
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
    paddingHorizontal: 2,
    paddingVertical: 2,
    marginBottom: 10,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    padding: 2,
    marginRight: 12,
    backgroundColor: '#f5f5f5',
  },
  avatarClip: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  avatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fafafa',
  },
  defaultAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarHead: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 3,
    opacity: 0.75,
  },
  defaultAvatarBody: {
    width: 24,
    height: 11,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    opacity: 0.75,
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444444',
    lineHeight: 20,
  },
  profileTimestamp: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 1,
  },
  moreButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -6,
  },
  mediaContainer: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#fafafa',
    borderRadius: 10,
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
    width: MEDIA_WIDTH,
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
  mediaCounter: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 42,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaCounterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 2,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#444444',
    marginBottom: 4,
    lineHeight: 22,
  },
  postBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  categoryText: {
    color: '#2F80D7',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
});
