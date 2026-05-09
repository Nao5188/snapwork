import React, { useState, useEffect, useRef } from 'react';
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
  Image as RNImage,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { authService, userService, postService, fileStorageService } from '@/lib/supabase';
import AnimatedButton from '@/components/AnimatedButton';
import DrawerMenu from '@/components/DrawerMenu';
import { useAppTheme } from '@/lib/ThemeContext';

const { width } = Dimensions.get('window');
const numColumns = 3;
const GRID_GAP = 3;
const itemSize = (width - (GRID_GAP * (numColumns + 1))) / numColumns;

interface UserPost {
  id: string;
  title: string;
  menuName: string;
  mediaUri: string;
  isVideo: boolean;
  createdAt: Date;
  likesCount: number;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  postsCount: number;
}

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
  const [videoThumbnails, setVideoThumbnails] = useState<{ [id: string]: string }>({});
  const { colors } = useAppTheme();
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadUserProfile();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUserProfile = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const profile = await userService.getProfile(user.id);
      const posts = await postService.getUserPosts(user.id);
      const postsCount = await postService.getUserPostsCount(user.id);

      let avatarUrl = profile.avatar_url;

      if (!avatarUrl ||
          avatarUrl.startsWith('file://') ||
          avatarUrl.includes('placeholder')) {
        avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display_name || profile.username || 'User')}&size=200&background=1a1a1a&color=fff&bold=true`;
      }

      setUserProfile({
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatar: avatarUrl,
        postsCount: postsCount,
      });

      const formattedPosts: UserPost[] = posts.map(post => ({
        id: post.id,
        title: post.title,
        menuName: post.menu_name,
        mediaUri: post.media_url,
        isVideo: post.is_video,
        createdAt: new Date(post.created_at),
        likesCount: post.likes_count,
      }));

      setUserPosts(formattedPosts);

      // 動画投稿のサムネイルを生成
      const videoPosts = formattedPosts.filter(p => p.isVideo && p.mediaUri);
      videoPosts.forEach(async (post) => {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(post.mediaUri, { time: 0 });
          if (isMountedRef.current) {
            setVideoThumbnails(prev => ({ ...prev, [post.id]: uri }));
          }
        } catch {
          // サムネイル生成失敗は無視
        }
      });
    } catch (error) {
      console.error('Error loading user profile:', error);

      const { data: { user: fallbackUser } } = await authService.getCurrentUser();
      if (fallbackUser) {
        setUserProfile({
          id: fallbackUser.id,
          username: `user_${fallbackUser.id.slice(-6)}`,
          displayName: `ユーザー${fallbackUser.id.slice(-4)}`,
          avatar: `https://ui-avatars.com/api/?name=User&size=200&background=1a1a1a&color=fff`,
          postsCount: 0,
        });
      }

      Alert.alert('警告', 'プロフィール情報の一部を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

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

  const handleLogout = () => {
    Alert.alert(
      'ログアウト',
      '本当にログアウトしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'ログアウト',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.signOut();
              router.replace('/login');
            } catch {
              Alert.alert('エラー', 'ログアウトに失敗しました。');
            }
          }
        }
      ]
    );
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
      'ポスト削除',
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
                postsCount: Math.max(0, (userProfile.postsCount || 0) - 1)
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

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const handlePostLongPress = (postId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedPostId(selectedPostId === postId ? null : postId);
  };

  const renderPostItem = ({ item }: { item: UserPost }) => {
    const isSelected = selectedPostId === item.id;

    return (
      <Pressable
        style={styles.postItem}
        onPress={() => {
          if (isSelected) {
            setSelectedPostId(null);
          } else {
            router.push(`/my-posts?postId=${item.id}`);
          }
        }}
        onLongPress={() => handlePostLongPress(item.id)}
        delayLongPress={300}
      >
        <View style={styles.postImageWrapper}>
          <Image
            source={item.isVideo
              ? (videoThumbnails[item.id] ? { uri: videoThumbnails[item.id] } : undefined)
              : { uri: item.mediaUri }
            }
            style={styles.postImage}
            contentFit="cover"
          />
          {item.isVideo && (
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={14} color="white" />
            </View>
          )}
          {/* 長押し時に表示されるオーバーレイ */}
          {isSelected && (
            <Animated.View style={styles.postOverlay}>
              <View style={styles.postOverlayButtons}>
                <TouchableOpacity
                  style={styles.overlayEditButton}
                  onPress={() => {
                    setSelectedPostId(null);
                    handleEditPost(item.id);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={22} color="white" />
                  <Text style={styles.overlayButtonText}>編集</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.overlayDeleteButton}
                  onPress={() => {
                    setSelectedPostId(null);
                    handleDeletePost(item);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={22} color="white" />
                  <Text style={styles.overlayButtonText}>削除</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
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

  const renderHeader = () => {
    if (!userProfile) return null;

    return (
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        {/* プロフィールヘッダー */}
        <View style={[styles.profileGradientBg, { backgroundColor: colors.surface }]}>
          <View style={styles.profileContent}>
            <View style={styles.avatarSection}>
              <View style={[styles.avatarRing, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
                <Image
                  source={{ uri: userProfile.avatar }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              </View>
            </View>

            <Text style={[styles.displayName, { color: colors.text }]} testID="profile-displayname">
              {userProfile.displayName || 'ユーザー'}
            </Text>

            <View style={[styles.statsContainer, { backgroundColor: colors.surface2 }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: colors.text }]}>{userProfile.postsCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>投稿</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ボタンエリア */}
        <View style={[styles.buttonSection, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={[styles.editButton, { backgroundColor: colors.surface2, borderColor: colors.border }]}
            onPress={handleEditProfile}
            activeOpacity={0.85}
            accessibilityLabel="プロフィールを編集"
            testID="profile-edit-button"
          >
            <Ionicons name="create-outline" size={16} color={colors.text} />
            <Text style={[styles.editButtonText, { color: colors.text }]}>プロフィールを編集</Text>
          </TouchableOpacity>

          <AnimatedButton
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityLabel="ログアウト"
            testID="profile-logout-button"
          >
            <Ionicons name="log-out-outline" size={16} color="#FF3B30" />
            <Text style={styles.logoutButtonText}>ログアウト</Text>
          </AnimatedButton>
        </View>

        <View style={[styles.postsHeader, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.postsHeaderLeft}>
            <Ionicons name="grid-outline" size={18} color={colors.text} />
            <Text style={[styles.postsHeaderText, { color: colors.text }]}>投稿一覧</Text>
          </View>
          <Text style={[styles.postsHeaderHint, { color: colors.textMuted }]}>長押しで編集・削除</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <View style={styles.loadingIcon}>
          <Ionicons name="person-outline" size={32} color="#bbb" />
        </View>
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  if (!userProfile) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.loadingText}>プロフィールが見つかりません</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="profile-screen">
      <DrawerMenu isVisible={drawerVisible} onClose={() => setDrawerVisible(false)} />
      <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.hamburgerButton}
          onPress={() => setDrawerVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>アカウント</Text>
        <RNImage
          source={require('@/assets/images/HCINCLogo.png')}
          style={styles.headerLogo}
          resizeMode="cover"
        />
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <FlatList
          data={userPosts}
          renderItem={renderPostItem}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        />
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
                    <Image
                      source={{ uri: editAvatar || 'https://ui-avatars.com/api/?name=User&size=200&background=f5f5f5&color=999' }}
                      style={styles.avatarEdit}
                      contentFit="cover"
                    />
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
                    color={focusedField === 'displayName' ? '#444444' : '#999'}
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
    paddingBottom: 100,
  },
  header: {
    backgroundColor: '#FFFFFF',
  },
  profileGradientBg: {
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  profileContent: {
    alignItems: 'center',
    width: '100%',
  },
  avatarSection: {
    marginBottom: 14,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#444444',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  username: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#444444',
  },
  statLabel: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
    fontWeight: '500',
  },
  buttonSection: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444444',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE5E5',
    alignSelf: 'stretch',
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF3B30',
  },
  postsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    width: '100%',
    backgroundColor: '#ffffff',
  },
  postsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444444',
  },
  postsHeaderHint: {
    fontSize: 11,
    color: '#999999',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#444444',
  },
  cancelText: {
    fontSize: 16,
    color: '#888',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444444',
  },
  saveTextDisabled: {
    color: '#ccc',
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
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
    borderColor: '#444444',
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
    marginBottom: 28,
  },
  avatarEditWrapper: {
    position: 'relative',
  },
  avatarEdit: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f5f5f5',
  },
  avatarEditOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 50,
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
    paddingHorizontal: GRID_GAP,
    gap: GRID_GAP,
  },
  postItem: {
    width: itemSize,
    height: itemSize,
    marginBottom: GRID_GAP,
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  postImageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  postOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postOverlayButtons: {
    flexDirection: 'row',
    gap: 20,
  },
  overlayEditButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  overlayDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  overlayButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
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
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
