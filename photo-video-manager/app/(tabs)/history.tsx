import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { postService, authService, storeService, supabase, userService } from '@/lib/supabase';
import { isStoreAdminRole, normalizeStoreMemberRole } from '@/lib/storeRoles';
import type { StoreMemberRole } from '@/lib/storeRoles';
import {
  getMediaThumbnailUrl,
  hasDedicatedThumbnail,
  shouldRefreshLegacyVideoThumbnail,
} from '@/lib/mediaThumbnails';
import {
  getSignedPostMediaUrl,
  useSignedStorageUrlResolver,
} from '@/lib/signedStorageUrls';
import { useVideoThumbnailRepair } from '@/lib/useVideoThumbnailRepair';
import { subscribeActiveStoreChanged } from '@/lib/activeStoreEvents';
import PostCard from '@/components/PostCard';
import { PostCardSkeleton } from '@/components/SkeletonLoader';
import DrawerMenu from '@/components/DrawerMenu';
import { useAppTheme } from '@/lib/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_LOGO = require('@/assets/images/HCINCLogo.png');

type ReviewStatus = 'pending' | 'approved' | 'revision_requested' | 'rejected';

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
  review_status?: ReviewStatus;
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

export default function HistoryScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [posts, setPosts] = useState<PostHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloadModalPost, setDownloadModalPost] = useState<PostHistoryItem | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [thumbnailErrors, setThumbnailErrors] = useState<Set<string>>(new Set());
  const {
    failedKeys: failedVideoThumbnailKeys,
    repairVideoThumbnail,
    thumbnailUrls: repairedVideoThumbnailUrls,
  } = useVideoThumbnailRepair();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [userRole, setUserRole] = useState<StoreMemberRole | null>(null);
  const { colors, isDark } = useAppTheme();

  const flatListRef = useRef<FlatList>(null);

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // アニメーション
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress' as any, () => {
      scrollToTop();
    });
    return unsubscribe;
  }, [navigation, scrollToTop]);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const activeStoreId = await storeService.getActiveStoreId(user.id);
      if (!activeStoreId) {
        setUserRole(null);
        setPosts([]);
        router.replace('/store-onboarding');
        return;
      }

      const { data: memberData } = await supabase
        .from('store_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('store_id', activeStoreId)
        .maybeSingle();

      setUserRole(memberData ? normalizeStoreMemberRole(memberData.role) : null);

      const { data: currentProfile } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .eq('store_id', activeStoreId)
        .order('created_at', { ascending: false });

      if (postsError) {
        throw postsError;
      }

      if (postsData && postsData.length > 0) {
        const userIds = [...new Set(postsData.map(post => post.user_id))];

        // public_profilesビューを使用（emailを除外した安全なビュー）
        const { data: profileUsersData, error: profileUsersError } = await supabase
          .from('public_profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        let usersData = profileUsersData ?? [];
        if (profileUsersError) {
          console.warn('Failed to fetch public profiles, falling back to users:', profileUsersError);
          const { data: directUsersData, error: directUsersError } = await supabase
            .from('users')
            .select('id, username, display_name, avatar_url')
            .in('id', userIds);

          if (directUsersError) {
            console.warn('Failed to fetch user profiles:', directUsersError);
          } else {
            usersData = directUsersData ?? [];
          }
        }

        const userMap = new Map();
        usersData.forEach(user => {
          userMap.set(user.id, user);
        });

        // post_mediaを一括取得（N+1クエリ対策）
        const postIds = postsData.map(post => post.id);
        const postMediaMap = new Map<string, any[]>();
        try {
          const { data: allPostMedia } = await supabase
            .from('post_media')
            .select('*')
            .in('post_id', postIds)
            .order('display_order', { ascending: true });
          if (allPostMedia) {
            allPostMedia.forEach(item => {
              if (!postMediaMap.has(item.post_id)) {
                postMediaMap.set(item.post_id, []);
              }
              postMediaMap.get(item.post_id)!.push(item);
            });
          }
        } catch (error) {
          console.warn('Error fetching post_media batch:', error);
        }

        const postsWithProfiles = await Promise.all(postsData.map(async post => {
          let userProfile = userMap.get(post.user_id);

          let mediaItems: any[] = [];

          // post.media_url が有効な場合のみ追加
          if (post.media_url && post.media_url.trim() !== '') {
            // is_videoが未設定の場合はURLの拡張子で判定（過去データの救済）
            const lowerUrl = post.media_url.toLowerCase();
            const isVideoByUrl = lowerUrl.includes('.mp4') || lowerUrl.includes('.mov') ||
              lowerUrl.includes('.avi') || lowerUrl.includes('.webm');
            mediaItems.push({
              id: 'media_0',
              media_url: post.media_url,
              is_video: post.is_video || isVideoByUrl,
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

          // 一括取得済みのpost_mediaを使用
          const postMediaItems = postMediaMap.get(post.id) || [];
          if (postMediaItems.length > 0) {
            const validItems = postMediaItems.filter(
              (item: any) => item.media_url && item.media_url.trim() !== ''
            );
            if (validItems.length > 0) {
              mediaItems = validItems;
            }
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
              } catch {
                userProfile = {
                  id: post.user_id,
                  username: `user_${post.user_id.slice(-6)}`,
                  display_name: `ユーザー${post.user_id.slice(-4)}`,
                  avatar_url: null
                };
              }
            }
          }

          // displayMenuNameから|CATEGORIES:と|EXTRA_MEDIA:を除去し、カテゴリーを抽出
          let displayMenuName = post.menu_name || '';
          let extractedCategories = '';

          if (displayMenuName.includes('|CATEGORIES:')) {
            const parts = displayMenuName.split('|CATEGORIES:');
            displayMenuName = parts[0];
            // カテゴリー部分を抽出（EXTRA_MEDIAの前まで）
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
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [loadPosts])
  );

  useEffect(() => {
    return subscribeActiveStoreChanged(() => {
      loadPosts();
    });
  }, [loadPosts]);

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
            await postService.deletePost(post.id);
            setPosts(prevPosts => prevPosts.filter(p => p.id !== post.id));
            Alert.alert('完了', '投稿を削除しました。');
          } catch (error: any) {
            Alert.alert(
              'エラー',
              `削除に失敗しました。\n${error?.message || 'もう一度お試しください。'}`
            );
          }
        }}
      ]
    );
  };

  const getDownloadItems = useCallback((post: PostHistoryItem) => {
    if (post.mediaItems && post.mediaItems.length > 0) return post.mediaItems;
    if (post.media_url) {
      return [{ id: 'main', media_url: post.media_url, is_video: post.is_video, display_order: 0 }];
    }
    return [];
  }, []);

  const downloadPreviewStorageUrls = useMemo(() => {
    if (!downloadModalPost) return [];

    return getDownloadItems(downloadModalPost).flatMap((item) => {
      const thumbnailKey = `${downloadModalPost.id}:${item.id}`;
      const thumbnailUrl = getMediaThumbnailUrl(item.media_url);
      const repairedThumbnailUrl = repairedVideoThumbnailUrls[thumbnailKey];

      return repairedThumbnailUrl
        ? [thumbnailUrl, repairedThumbnailUrl]
        : [thumbnailUrl];
    });
  }, [downloadModalPost, getDownloadItems, repairedVideoThumbnailUrls]);
  const resolveDownloadPreviewStorageUrl = useSignedStorageUrlResolver('posts', downloadPreviewStorageUrls);
  const resolveDownloadVideoThumbnailStorageUrl = useSignedStorageUrlResolver(
    'posts',
    downloadPreviewStorageUrls,
    { deferStorageUrlsUntilSigned: true },
  );

  useEffect(() => {
    if (!downloadModalPost || !shouldRefreshLegacyVideoThumbnail(downloadModalPost.created_at)) {
      return;
    }

    getDownloadItems(downloadModalPost).forEach((item) => {
      if (item.is_video && hasDedicatedThumbnail(item.media_url)) {
        const thumbnailKey = `${downloadModalPost.id}:${item.id}`;
        repairVideoThumbnail(thumbnailKey, item.media_url, { markFailed: false });
      }
    });
  }, [downloadModalPost, getDownloadItems, repairVideoThumbnail]);

  const updatePostReviewStatus = async (postId: string) => {
    const { error } = await supabase.rpc('set_post_review_status', {
      p_post_ids: [postId],
      p_status: 'approved',
    } as any);

    if (error) throw error;

    setPosts(prevPosts => prevPosts.map(post => (
      post.id === postId
        ? { ...post, review_status: 'approved' }
        : post
    )));
  };

  const getReviewStatusErrorMessage = (error: any) => {
    const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;

    if (
      error?.code === 'PGRST202'
      || error?.code === 'PGRST204'
      || error?.code === '42703'
      || message.includes('set_post_review_status')
      || message.includes('review_status')
    ) {
      return '承認機能用のDB更新状況を確認してください。';
    }

    if (error?.code === '42501' || message.includes('permission')) {
      return '店舗のオーナーまたは管理者権限を確認してください。';
    }

    return message.trim() || 'フィルタ検索から承認ステータスを変更してください。';
  };

  const executeDownload = async (post: PostHistoryItem, indices: number[]) => {
    const items = getDownloadItems(post);
    const targetItems = indices
      .map(index => ({ item: items[index], index }))
      .filter(({ item }) => Boolean(item?.media_url));

    if (targetItems.length !== indices.length || targetItems.length === 0) {
      Alert.alert('エラー', '保存対象のメディアを確認できませんでした。');
      return;
    }

    let successCount = 0;
    for (const { item, index } of targetItems) {
      try {
        let saveUri: string;
        if (item.media_url.startsWith('file://')) {
          saveUri = item.media_url;
        } else {
          const ext = item.is_video ? 'mp4' : 'jpg';
          const fileUri = `${FileSystem.cacheDirectory}media_${Date.now()}_${index}.${ext}`;
          const downloadUrl = await getSignedPostMediaUrl(item.media_url);
          const result = await FileSystem.downloadAsync(downloadUrl, fileUri);
          if (!result?.uri) continue;
          saveUri = result.uri;
        }
        await MediaLibrary.saveToLibraryAsync(saveUri);
        successCount++;
      } catch (itemError) {
        console.error('Failed to save item:', itemError);
      }
    }

    if (successCount !== targetItems.length) {
      Alert.alert(
        '保存未完了',
        `${successCount}/${targetItems.length}件を保存しました。すべて保存できなかったため、承認ステータスは変更していません。`
      );
      return;
    }

    if (post.review_status === 'approved') {
      Alert.alert('保存完了', `${successCount}件のメディアをカメラロールに保存しました。`);
      return;
    }

    try {
      await updatePostReviewStatus(post.id);
      Alert.alert(
        '保存・承認完了',
        `${successCount}件のメディアをカメラロールに保存し、投稿を承認済みにしました。`
      );
    } catch (error: any) {
      console.error('Failed to approve saved post:', error);
      Alert.alert(
        '保存完了・承認失敗',
        `メディアは保存しましたが、承認済みへの変更に失敗しました。\n${getReviewStatusErrorMessage(error)}`
      );
    }
  };

  const prepareDownloadPost = async (post: PostHistoryItem) => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限エラー', 'カメラロールへのアクセス権限が必要です。\n設定からアクセスを許可してください。');
      return;
    }
    const items = getDownloadItems(post);
    if (items.length === 0) {
      Alert.alert('エラー', '保存できる画像がありません。');
      return;
    }
    if (items.length === 1) {
      await executeDownload(post, [0]);
    } else {
      setDownloadModalPost(post);
      setSelectedIndices(new Set(items.map((_, i) => i)));
    }
  };

  const handleDownloadPost = (post: PostHistoryItem) => {
    if (post.review_status === 'rejected') {
      Alert.alert(
        '却下済みの投稿',
        'この投稿を承認済みに変更して、メディアを保存しますか？',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '保存して承認',
            onPress: () => {
              void prepareDownloadPost(post);
            },
          },
        ]
      );
      return;
    }

    void prepareDownloadPost(post);
  };

  const handleLike = (_postId: string) => {
    // いいね機能は今後実装予定
  };

  const renderPostItem = ({ item, index }: { item: PostHistoryItem; index: number }) => {
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
        index={index}
        showActions={isOwner}
        showProfile={true}
        onEdit={() => handleEditPost(item)}
        onDelete={() => handleDeletePost(item)}
        onDownload={isStoreAdminRole(userRole) ? () => handleDownloadPost(item) : undefined}
        downloadLabel={item.review_status === 'approved' ? '保存' : '保存して承認'}
        onLike={() => handleLike(item.id)}
      />
    );
  };

  const renderSkeletons = () => (
    <View style={styles.skeletonContainer}>
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
      <Text style={styles.emptyTitle} testID="history-empty-text">まだ投稿がありません</Text>
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

  const renderDownloadModal = () => {
    if (!downloadModalPost) return null;
    const items = getDownloadItems(downloadModalPost);
    const allSelected = selectedIndices.size === items.length;
    const shouldApprove = downloadModalPost.review_status !== 'approved';
    const thumbnailSize = (SCREEN_WIDTH - 40 - 8) / 3;

    const toggleIndex = (i: number) => {
      setSelectedIndices(prev => {
        const next = new Set(prev);
        if (next.has(i)) {
          next.delete(i);
        } else {
          next.add(i);
        }
        return next;
      });
    };

    const toggleAll = () => {
      setSelectedIndices(allSelected ? new Set() : new Set(items.map((_, i) => i)));
    };

    return (
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={() => setDownloadModalPost(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>保存する写真を選択</Text>
              <Text style={styles.modalSubtitle}>{selectedIndices.size} / {items.length} 枚選択中</Text>
            </View>

            <TouchableOpacity style={styles.selectAllButton} onPress={toggleAll} activeOpacity={0.7}>
              <Ionicons
                name={allSelected ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={18}
                color={allSelected ? '#2196F3' : '#888'}
              />
              <Text style={[styles.selectAllText, allSelected && styles.selectAllTextActive]}>
                {allSelected ? '選択を解除' : 'すべて選択'}
              </Text>
            </TouchableOpacity>

            <ScrollView style={styles.thumbnailScroll} contentContainerStyle={styles.thumbnailGrid}>
              {items.map((item, index) => {
                const isSelected = selectedIndices.has(index);
                const thumbnailKey = `${downloadModalPost.id}:${item.id}`;
                const thumbnailFailed = item.is_video
                  ? failedVideoThumbnailKeys.has(thumbnailKey)
                  : thumbnailErrors.has(thumbnailKey);
                const thumbnailUrl = getMediaThumbnailUrl(item.media_url);
                const repairedThumbnailUrl = repairedVideoThumbnailUrls[thumbnailKey] ?? thumbnailUrl;
                const hasThumbnail = hasDedicatedThumbnail(item.media_url);
                const resolvedThumbnailUrl = item.is_video
                  ? resolveDownloadVideoThumbnailStorageUrl(repairedThumbnailUrl)
                  : resolveDownloadPreviewStorageUrl(thumbnailUrl);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.thumbnailWrapper, { width: thumbnailSize, height: thumbnailSize }]}
                    onPress={() => toggleIndex(index)}
                    activeOpacity={0.8}
                  >
                    {thumbnailFailed || (item.is_video && !hasThumbnail) || !resolvedThumbnailUrl ? (
                      <View style={[styles.thumbnailImage, styles.videoThumbnailFallback]}>
                        <Ionicons
                          name={item.is_video ? 'videocam-outline' : 'image-outline'}
                          size={28}
                          color="#888"
                        />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: resolvedThumbnailUrl }}
                        style={styles.thumbnailImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={`history-download-${thumbnailKey}`}
                        onError={() => {
                          if (item.is_video && hasThumbnail) {
                            repairVideoThumbnail(thumbnailKey, item.media_url, { force: true });
                          } else if (!thumbnailFailed && hasThumbnail) {
                            setThumbnailErrors(prev => new Set(prev).add(thumbnailKey));
                          }
                        }}
                      />
                    )}
                    {item.is_video && (
                      <View style={styles.videoIcon}>
                        <Ionicons name="play" size={14} color="#fff" />
                      </View>
                    )}
                    <View style={[styles.thumbnailOverlay, isSelected && styles.thumbnailOverlaySelected]} />
                    <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setDownloadModalPost(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, selectedIndices.size === 0 && styles.modalSaveButtonDisabled]}
                onPress={async () => {
                  const indices = Array.from(selectedIndices);
                  setDownloadModalPost(null);
                  await executeDownload(downloadModalPost, indices);
                }}
                disabled={selectedIndices.size === 0}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.modalSaveText}>
                  {shouldApprove ? '保存して承認' : '保存'} ({selectedIndices.size}枚)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderHeader = () => (
    <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.hamburgerButton}
        onPress={() => setDrawerVisible(true)}
        activeOpacity={0.7}
        testID="history-menu-button"
      >
        <Ionicons name="menu" size={26} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity onPress={scrollToTop} activeOpacity={0.7} style={styles.headerTitleButton}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>タイムライン</Text>
      </TouchableOpacity>
      <Image
        source={HEADER_LOGO}
        style={styles.headerLogo}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        transition={0}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="history-screen">
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <DrawerMenu isVisible={drawerVisible} onClose={() => setDrawerVisible(false)} />
      {renderDownloadModal()}
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#1a1a1a"
              />
            }
            ListEmptyComponent={renderEmptyState}
            testID="history-posts-list"
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  hamburgerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  headerTitleButton: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  headerLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
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
    backgroundColor: '#2196F3',
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
  // ダウンロード選択モーダル
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#444444',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectAllText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  selectAllTextActive: {
    color: '#2196F3',
  },
  thumbnailScroll: {
    maxHeight: 340,
  },
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 4,
  },
  thumbnailWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  videoThumbnailFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  thumbnailOverlaySelected: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  videoIcon: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    padding: 3,
  },
  checkCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  modalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
  },
  modalSaveButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalSaveButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
