import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  Dimensions,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Animated,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { authService, userService, postService, fileStorageService, storeService } from '@/lib/supabase';
import { getStoreRoleLabel } from '@/lib/storeRoles';
import type { StoreMemberRole } from '@/lib/storeRoles';
import {
  getMediaThumbnailUrl,
  hasDedicatedThumbnail,
  shouldRefreshLegacyVideoThumbnail,
} from '@/lib/mediaThumbnails';
import { useSignedStorageUrlResolver } from '@/lib/signedStorageUrls';
import { useVideoThumbnailRepair } from '@/lib/useVideoThumbnailRepair';
import { subscribeActiveStoreChanged } from '@/lib/activeStoreEvents';
import DrawerMenu from '@/components/DrawerMenu';
import { useAppTheme } from '@/lib/ThemeContext';

const { width } = Dimensions.get('window');
const numColumns = 3;
const GRID_GAP = 10;
const GRID_HORIZONTAL_PADDING = 16;
const itemSize = (width - (GRID_HORIZONTAL_PADDING * 2) - (GRID_GAP * (numColumns - 1))) / numColumns;
const PROFILE_ACCENT = '#2196F3';
const PROFILE_ACCENT_SOFT = '#EAF4FE';
const HEADER_LOGO = require('@/assets/images/HCINCLogo.png');

interface UserPost {
  id: string;
  title: string;
  menuName: string;
  mediaUri: string;
  isVideo: boolean;
  createdAt: Date;
  likesCount: number;
  reviewStatus?: string;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  postsCount: number;
  adoptedPostsCount: number;
  storeName: string | null;
  role: StoreMemberRole | null;
}

const normalizeAvatarUrl = (avatarUrl?: string | null) => {
  if (
    !avatarUrl ||
    avatarUrl.startsWith('file://') ||
    avatarUrl.includes('placeholder') ||
    avatarUrl.includes('ui-avatars.com')
  ) {
    return null;
  }

  return avatarUrl;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [postThumbnailErrors, setPostThumbnailErrors] = useState<Set<string>>(new Set());
  const {
    failedKeys: failedVideoThumbnailKeys,
    repairVideoThumbnail,
    thumbnailUrls: repairedVideoThumbnailUrls,
  } = useVideoThumbnailRepair();
  const { colors } = useAppTheme();
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUserProfile = useCallback(async () => {
    try {
      setLoading(true);

      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const [profile, posts, adoptedPostsCount, memberships, activeStoreId] = await Promise.all([
        userService.getProfile(user.id),
        postService.getUserPosts(user.id),
        postService.getUserApprovedPostsCount(user.id),
        storeService.getMyMemberships(user.id).catch((storeError) => {
          console.warn('Failed to load store membership:', storeError);
          return [];
        }),
        storeService.getActiveStoreId(user.id),
      ]);
      const activeMembership = memberships.find(
        membership => membership.store_id === activeStoreId
      ) ?? memberships[0] ?? null;
      const postsCount = posts.length;

      const avatarUrl = normalizeAvatarUrl(profile.avatar_url);

      setUserProfile({
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatar: avatarUrl,
        postsCount: postsCount,
        adoptedPostsCount: adoptedPostsCount,
        storeName: activeMembership?.store?.name ?? null,
        role: activeMembership?.role ?? null,
      });

      const formattedPosts: UserPost[] = posts.map(post => ({
        id: post.id,
        title: post.title,
        menuName: post.menu_name,
        mediaUri: post.media_url,
        isVideo: post.is_video,
        createdAt: new Date(post.created_at),
        likesCount: post.likes_count,
        reviewStatus: post.review_status,
      }));

      setUserPosts(formattedPosts);
    } catch (error) {
      console.error('Error loading user profile:', error);

      const { data: { user: fallbackUser } } = await authService.getCurrentUser();
      if (fallbackUser) {
        setUserProfile({
          id: fallbackUser.id,
          username: `user_${fallbackUser.id.slice(-6)}`,
          displayName: `ユーザー${fallbackUser.id.slice(-4)}`,
          avatar: null,
          postsCount: 0,
          adoptedPostsCount: 0,
          storeName: null,
          role: null,
        });
      }

      Alert.alert('警告', 'プロフィール情報の一部を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadUserProfile();
    }, [loadUserProfile])
  );

  useEffect(() => {
    return subscribeActiveStoreChanged(() => {
      loadUserProfile();
    });
  }, [loadUserProfile]);

  useEffect(() => {
    userPosts.forEach((post) => {
      if (
        post.isVideo
        && hasDedicatedThumbnail(post.mediaUri)
        && shouldRefreshLegacyVideoThumbnail(post.createdAt)
      ) {
        const thumbnailKey = `${post.id}:${post.mediaUri}`;
        repairVideoThumbnail(thumbnailKey, post.mediaUri, { markFailed: false });
      }
    });
  }, [repairVideoThumbnail, userPosts]);

  const profilePostStorageUrls = useMemo(() => (
    userPosts.flatMap((post) => {
      const thumbnailKey = `${post.id}:${post.mediaUri}`;
      const thumbnailUrl = getMediaThumbnailUrl(post.mediaUri);
      const repairedThumbnailUrl = repairedVideoThumbnailUrls[thumbnailKey];

      return repairedThumbnailUrl
        ? [post.mediaUri, thumbnailUrl, repairedThumbnailUrl]
        : [post.mediaUri, thumbnailUrl];
    })
  ), [repairedVideoThumbnailUrls, userPosts]);
  const resolveProfilePostStorageUrl = useSignedStorageUrlResolver('posts', profilePostStorageUrls);
  const resolveProfileVideoThumbnailStorageUrl = useSignedStorageUrlResolver(
    'posts',
    profilePostStorageUrls,
    { deferStorageUrlsUntilSigned: true },
  );

  const profileAvatarStorageUrls = useMemo(
    () => [userProfile?.avatar, editAvatar],
    [editAvatar, userProfile?.avatar]
  );
  const resolveProfileAvatarStorageUrl = useSignedStorageUrlResolver('avatars', profileAvatarStorageUrls);

  const handleEditProfile = () => {
    if (!userProfile) return;
    setEditDisplayName(userProfile.displayName);
    setEditAvatar(userProfile.avatar);
    setIsEditModalVisible(true);
  };

  const handleSelectAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setEditAvatar(result.assets[0].uri);
      }
    } catch {
      Alert.alert('エラー', '画像の選択に失敗しました。');
    }
  };

  const handleSaveProfile = async () => {
    if (!userProfile) return;

    setUploading(true);

    if (!editDisplayName.trim()) {
      Alert.alert('エラー', 'ユーザー名を入力してください。');
      setUploading(false);
      return;
    }

    try {
      const isDisplayNameAvailable = await userService.checkDisplayNameAvailability(editDisplayName.trim(), userProfile.id);
      if (!isDisplayNameAvailable) {
        Alert.alert('エラー', 'このユーザー名は既に使用されています。');
        setUploading(false);
        return;
      }

      let avatarUrl = userProfile.avatar;

      if (editAvatar && editAvatar !== userProfile.avatar) {
        try {
          avatarUrl = await fileStorageService.uploadAvatar(userProfile.id, editAvatar);

          if (userProfile.avatar && !userProfile.avatar.startsWith('file://') && !userProfile.avatar.includes('placeholder') && !userProfile.avatar.includes('ui-avatars.com')) {
            try {
              await fileStorageService.deleteAvatar(userProfile.avatar);
            } catch (deleteError) {
              console.warn('Failed to delete old avatar:', deleteError);
            }
          }
        } catch {
          Alert.alert('アップロードエラー', `プロフィール画像のアップロードに失敗しました。`);
          setUploading(false);
          return;
        }
      }

      await userService.updateProfile(userProfile.id, {
        display_name: editDisplayName.trim(),
        avatar_url: avatarUrl,
      });

      const updatedProfile = {
        ...userProfile,
        displayName: editDisplayName.trim(),
        avatar: avatarUrl
      };

      setUserProfile(updatedProfile);

      setIsEditModalVisible(false);
      setEditAvatar(null);
      Alert.alert('成功', 'プロフィールを更新しました。');
    } catch {
      Alert.alert('エラー', `プロフィールの更新に失敗しました。`);
    } finally {
      setUploading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditModalVisible(false);
    setEditDisplayName('');
    setEditAvatar(null);
  };

  const handleEditPost = (postId: string) => {
    router.push(`/post/edit/${postId}`);
  };

  const handleDeletePost = (post: UserPost) => {
    Alert.alert(
      '投稿削除',
      `「${post.title}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: async () => {
          try {
            await postService.deletePost(post.id);
            setUserPosts(prevPosts => prevPosts.filter(p => p.id !== post.id));
            if (userProfile) {
              setUserProfile({
                ...userProfile,
                postsCount: Math.max(0, (userProfile.postsCount || 0) - 1),
                adoptedPostsCount: post.reviewStatus === 'approved'
                  ? Math.max(0, (userProfile.adoptedPostsCount || 0) - 1)
                  : userProfile.adoptedPostsCount,
              });
            }
            Alert.alert('削除完了', 'ポストを削除しました。');
          } catch {
            Alert.alert('エラー', `削除に失敗しました。`);
          }
        }}
      ]
    );
  };

  const handlePostMenu = (post: UserPost) => {
    Alert.alert(
      '投稿の操作',
      post.title,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '編集', onPress: () => handleEditPost(post.id) },
        { text: '削除', style: 'destructive', onPress: () => handleDeletePost(post) },
      ]
    );
  };

  const renderPostItem = ({ item }: { item: UserPost }) => {
    const thumbnailKey = `${item.id}:${item.mediaUri}`;
    const thumbnailUrl = getMediaThumbnailUrl(item.mediaUri);
    const repairedThumbnailUrl = repairedVideoThumbnailUrls[thumbnailKey] ?? thumbnailUrl;
    const thumbnailFailed = item.isVideo
      ? failedVideoThumbnailKeys.has(thumbnailKey)
      : postThumbnailErrors.has(thumbnailKey);
    const hasThumbnail = hasDedicatedThumbnail(item.mediaUri);
    const resolvedThumbnailUrl = item.isVideo
      ? resolveProfileVideoThumbnailStorageUrl(repairedThumbnailUrl)
      : resolveProfilePostStorageUrl(thumbnailUrl);
    const source = item.isVideo
      ? (!thumbnailFailed && hasThumbnail && resolvedThumbnailUrl
        ? { uri: resolvedThumbnailUrl }
        : undefined)
      : (thumbnailFailed && hasThumbnail ? undefined : { uri: resolvedThumbnailUrl });

    return (
      <Pressable
        style={styles.postItem}
        onPress={() => router.push(`/my-posts?postId=${item.id}`)}
      >
        <View style={styles.postImageWrapper}>
          {source ? (
            <Image
              source={source}
              style={styles.postImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={`profile-post-${item.id}`}
              onError={() => {
                if (item.isVideo && hasThumbnail) {
                  repairVideoThumbnail(thumbnailKey, item.mediaUri, { force: true });
                } else if (!thumbnailFailed && hasThumbnail) {
                  setPostThumbnailErrors(prev => new Set(prev).add(thumbnailKey));
                }
              }}
            />
          ) : (
            <View style={[styles.postImage, styles.postImageFallback]}>
              <Ionicons
                name={item.isVideo ? 'videocam-outline' : 'image-outline'}
                size={28}
                color={colors.textMuted}
              />
            </View>
          )}
          {item.isVideo && (
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={14} color="white" />
            </View>
          )}
          <TouchableOpacity
            style={styles.postMenuButton}
            onPress={(event) => {
              event.stopPropagation();
              handlePostMenu(item);
            }}
            activeOpacity={0.85}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            accessibilityLabel="投稿の操作メニュー"
          >
            <Ionicons name="ellipsis-horizontal" size={17} color="#222222" />
          </TouchableOpacity>
        </View>
        {/* いいね数表示 */}
        {item.likesCount > 0 && (
          <View style={styles.postLikeBadge}>
            <Ionicons name="heart" size={10} color="white" />
            <Text style={styles.postLikeCount}>{item.likesCount}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const renderEmptyState = () => {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="images-outline" size={30} color="#A3AAB8" />
        </View>
        <Text style={[styles.emptyStateTitle, { color: colors.text }]}>投稿はまだありません</Text>
        <Text style={[styles.emptyStateMessage, { color: colors.textMuted }]}>
          カメラから写真や動画を投稿すると、ここに表示されます。
        </Text>
      </View>
    );
  };

  const renderTopBar = () => (
    <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.hamburgerButton}
        onPress={() => setDrawerVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="menu" size={26} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>プロフィール</Text>
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

  const renderLoadingHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.background }]}>
      <View style={[styles.profilePanel, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.profileMainRow}>
          <View style={[styles.avatarRing, { borderColor: colors.borderLight, backgroundColor: colors.surface2 }]} />
          <View style={styles.loadingProfileInfo}>
            <View style={[styles.loadingLine, styles.loadingNameLine, { backgroundColor: colors.surface2 }]} />
            <View style={[styles.loadingLine, styles.loadingRoleLine, { backgroundColor: colors.surface2 }]} />
            <View style={[styles.loadingLine, styles.loadingStoreLine, { backgroundColor: colors.surface2 }]} />
          </View>
        </View>
        <View style={[styles.loadingEditButton, { backgroundColor: colors.surface2 }]} />
        <View style={[styles.profileStats, { borderTopColor: colors.borderLight }]}>
          <View style={styles.profileStatItem}>
            <View style={[styles.loadingStatValue, { backgroundColor: colors.surface2 }]} />
            <View style={[styles.loadingStatLabel, { backgroundColor: colors.surface2 }]} />
          </View>
          <View style={[styles.profileStatDivider, { backgroundColor: colors.borderLight }]} />
          <View style={styles.profileStatItem}>
            <View style={[styles.loadingStatValue, { backgroundColor: colors.surface2 }]} />
            <View style={[styles.loadingStatLabel, { backgroundColor: colors.surface2 }]} />
          </View>
        </View>
      </View>

      <View style={[styles.postsHeader, { backgroundColor: colors.background }]}>
        <View style={styles.postsHeaderLeft}>
          <View style={[styles.loadingHeaderIcon, { backgroundColor: colors.surface2 }]} />
          <View style={[styles.loadingPostsTitle, { backgroundColor: colors.surface2 }]} />
        </View>
        <View style={[styles.loadingPostsCount, { backgroundColor: colors.surface2 }]} />
      </View>
    </View>
  );

  const renderLoadingGrid = () => (
    <View style={styles.loadingGrid}>
      {Array.from({ length: 6 }, (_, index) => (
        <View
          key={`profile-loading-post-${index}`}
          style={[styles.loadingGridItem, { backgroundColor: colors.surface2 }]}
        />
      ))}
    </View>
  );

  const renderHeader = () => {
    if (!userProfile) return null;
    const roleLabel = getStoreRoleLabel(userProfile.role);
    const storeName = userProfile.storeName ?? '店舗未設定';

    return (
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={[styles.profilePanel, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.profileMainRow}>
            <TouchableOpacity
              style={styles.avatarSection}
              onPress={handleEditProfile}
              activeOpacity={0.86}
              accessibilityLabel="プロフィール画像を編集"
            >
              <View style={[styles.avatarRing, { borderColor: colors.borderLight, backgroundColor: colors.surface2 }]}>
                {userProfile.avatar ? (
                  <Image
                    source={{ uri: resolveProfileAvatarStorageUrl(userProfile.avatar) }}
                    style={styles.avatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`profile-avatar-${userProfile.id}`}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={42} color={colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={[styles.avatarCameraButton, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                <Ionicons name="camera-outline" size={17} color={colors.text} />
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <Text style={[styles.displayName, { color: colors.text }]} testID="profile-displayname" numberOfLines={1}>
                {userProfile.displayName || 'ユーザー'}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: PROFILE_ACCENT_SOFT }]}>
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
              <View style={styles.storeLine}>
                <Ionicons name="storefront-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.username, { color: colors.textMuted }]} numberOfLines={1}>
                  {storeName}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.profileSideActions}>
            <TouchableOpacity
              style={[styles.cardEditButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={handleEditProfile}
              activeOpacity={0.85}
              accessibilityLabel="プロフィールを編集"
              testID="profile-edit-button"
            >
              <Ionicons name="create-outline" size={15} color={colors.text} />
              <Text style={[styles.cardEditButtonText, { color: colors.text }]} numberOfLines={1}>プロフィールを編集</Text>
            </TouchableOpacity>
            <View
              style={[
                styles.profileStats,
                { borderTopColor: colors.borderLight },
              ]}
              testID="profile-stats"
            >
              <View style={styles.profileStatItem}>
                <Text style={[styles.profileStatValue, { color: colors.text }]} testID="profile-posts-count">
                  {userProfile.postsCount}
                </Text>
                <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>投稿数</Text>
              </View>
              <View style={[styles.profileStatDivider, { backgroundColor: colors.borderLight }]} />
              <View style={styles.profileStatItem}>
                <Text style={[styles.profileStatValue, { color: colors.text }]} testID="profile-adopted-posts-count">
                  {userProfile.adoptedPostsCount}
                </Text>
                <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>採用数</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.postsHeader, { backgroundColor: colors.background }]}>
          <View style={styles.postsHeaderLeft}>
            <Ionicons name="grid-outline" size={18} color={colors.text} />
            <Text style={[styles.postsHeaderText, { color: colors.text }]}>投稿一覧</Text>
          </View>
          <Text style={[styles.postsHeaderCount, { color: colors.textMuted }]}>{userProfile.postsCount}件</Text>
        </View>
      </View>
    );
  };

  const isInitialLoading = loading && !userProfile;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="profile-screen">
      <DrawerMenu isVisible={drawerVisible} onClose={() => setDrawerVisible(false)} />
      {renderTopBar()}

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {!loading && !userProfile ? (
          <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>プロフィールが見つかりません</Text>
          </View>
        ) : (
          <FlatList
            data={isInitialLoading ? [] : userPosts}
            renderItem={renderPostItem}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            ListHeaderComponent={isInitialLoading ? renderLoadingHeader : renderHeader}
            ListEmptyComponent={isInitialLoading ? renderLoadingGrid : renderEmptyState}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
          />
        )}
      </Animated.View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={handleCancelEdit}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleCancelEdit} activeOpacity={0.7}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>プロフィール編集</Text>
              <TouchableOpacity onPress={handleSaveProfile} disabled={uploading} activeOpacity={0.7}>
                <Text style={[styles.saveText, uploading && styles.saveTextDisabled]}>
                  {uploading ? '保存中...' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.avatarEditContainer}>
                <TouchableOpacity onPress={handleSelectAvatar} activeOpacity={0.8}>
                  <View style={styles.avatarEditWrapper}>
                    {editAvatar ? (
                      <Image
                        source={{ uri: resolveProfileAvatarStorageUrl(editAvatar) }}
                        style={styles.avatarEdit}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={styles.avatarEditPlaceholder}>
                        <Ionicons name="person" size={40} color="#999" />
                      </View>
                    )}
                    <View style={styles.avatarEditOverlay}>
                      <Ionicons name="camera-outline" size={24} color="white" />
                    </View>
                  </View>
                </TouchableOpacity>
                <Text style={styles.avatarEditHint}>タップして変更</Text>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>ユーザー名</Text>
                <View style={[
                  styles.inputContainer,
                  focusedField === 'displayName' && styles.inputContainerFocused,
                ]}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={focusedField === 'displayName' ? PROFILE_ACCENT : '#999'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={editDisplayName}
                    onChangeText={setEditDisplayName}
                    placeholder="ユーザー名を入力"
                    placeholderTextColor="#bbb"
                    maxLength={30}
                    onFocus={() => setFocusedField('displayName')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  headerLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  hamburgerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 132,
  },
  header: {
    backgroundColor: '#fafafa',
    paddingTop: 16,
    paddingBottom: 10,
  },
  profilePanel: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 3,
  },
  profileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 13,
  },
  avatarSection: {
    flexShrink: 0,
    position: 'relative',
  },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: '#e5e5e5',
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  avatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraButton: {
    position: 'absolute',
    right: -2,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    paddingRight: 148,
  },
  loadingProfileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  loadingLine: {
    borderRadius: 999,
  },
  loadingNameLine: {
    width: '68%',
    height: 22,
  },
  loadingRoleLine: {
    width: 76,
    height: 20,
  },
  loadingStoreLine: {
    width: '52%',
    height: 14,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 10,
  },
  roleBadgeText: {
    color: PROFILE_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#444444',
    marginBottom: 8,
    letterSpacing: 0,
  },
  storeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  username: {
    fontSize: 13,
    color: '#999999',
  },
  profileSideActions: {
    position: 'absolute',
    top: 22,
    right: 16,
    width: 142,
    alignItems: 'stretch',
  },
  cardEditButton: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cardEditButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  profileStats: {
    marginTop: 10,
    paddingTop: 9,
    minHeight: 38,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileStatItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  profileStatValue: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  profileStatLabel: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  profileStatDivider: {
    width: 1,
    height: 24,
  },
  loadingEditButton: {
    alignSelf: 'flex-end',
    width: 142,
    height: 34,
    borderRadius: 10,
    marginTop: 14,
  },
  loadingStatValue: {
    width: 34,
    height: 16,
    borderRadius: 8,
    marginBottom: 5,
  },
  loadingStatLabel: {
    width: 38,
    height: 10,
    borderRadius: 5,
  },
  postsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
    width: '100%',
    backgroundColor: '#fafafa',
  },
  postsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingHeaderIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  loadingPostsTitle: {
    width: 72,
    height: 14,
    borderRadius: 7,
  },
  loadingPostsCount: {
    width: 30,
    height: 13,
    borderRadius: 7,
  },
  postsHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444444',
  },
  postsHeaderCount: {
    fontSize: 13,
    color: '#999999',
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 42,
    paddingBottom: 80,
  },
  emptyStateIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F4F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyStateMessage: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: GRID_HORIZONTAL_PADDING,
    paddingTop: 2,
    paddingBottom: 80,
  },
  loadingGridItem: {
    width: itemSize,
    height: itemSize,
    borderRadius: 12,
  },
  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#666666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 16, 28, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 22,
    maxHeight: '78%',
    width: '100%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF4',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#444444',
  },
  cancelText: {
    fontSize: 14,
    color: '#8B93A4',
    fontWeight: '600',
  },
  saveText: {
    fontSize: 14,
    fontWeight: '700',
    color: PROFILE_ACCENT,
  },
  saveTextDisabled: {
    color: '#ccc',
  },
  modalBody: {
    flexGrow: 0,
  },
  modalBodyContent: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 24,
  },
  inputWrapper: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputContainerFocused: {
    backgroundColor: '#fff',
    borderColor: PROFILE_ACCENT,
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#444444',
  },
  avatarEditContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarEditWrapper: {
    position: 'relative',
  },
  avatarEdit: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#f5f5f5',
  },
  avatarEditPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 44,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditHint: {
    color: '#888',
    fontSize: 13,
    marginTop: 10,
  },
  row: {
    justifyContent: 'flex-start',
    paddingHorizontal: GRID_HORIZONTAL_PADDING,
    gap: GRID_GAP,
  },
  postItem: {
    width: itemSize,
    height: itemSize,
    marginBottom: GRID_GAP,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  postImageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  postImageFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  postMenuButton: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  postLikeBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 3,
  },
  postLikeCount: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  videoIndicator: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
