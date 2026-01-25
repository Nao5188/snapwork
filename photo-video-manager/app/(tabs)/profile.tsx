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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { authService, userService, postService, fileStorageService } from '@/lib/supabase';
import AnimatedButton from '@/components/AnimatedButton';

const { width } = Dimensions.get('window');
const numColumns = 3;
const itemSize = (width - 4) / numColumns;

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
  const [editUsername, setEditUsername] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadUserProfile();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
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
    setEditUsername(userProfile.username);
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
    } catch (error) {
      console.error('Error selecting avatar:', error);
      Alert.alert('エラー', '画像の選択に失敗しました。');
    }
  };

  const handleSaveProfile = async () => {
    if (!userProfile) return;

    setUploading(true);

    if (!editDisplayName.trim()) {
      Alert.alert('エラー', '表示名を入力してください。');
      setUploading(false);
      return;
    }
    if (!editUsername.trim()) {
      Alert.alert('エラー', 'ユーザー名を入力してください。');
      setUploading(false);
      return;
    }
    if (editUsername.length < 3) {
      Alert.alert('エラー', 'ユーザー名は3文字以上で入力してください。');
      setUploading(false);
      return;
    }

    try {
      const isUsernameAvailable = await userService.checkUsernameAvailability(editUsername.trim().toLowerCase(), userProfile.id);
      if (!isUsernameAvailable) {
        Alert.alert('エラー', 'このユーザー名は既に使用されています。');
        setUploading(false);
        return;
      }

      const isDisplayNameAvailable = await userService.checkDisplayNameAvailability(editDisplayName.trim(), userProfile.id);
      if (!isDisplayNameAvailable) {
        Alert.alert('エラー', 'この表示名は既に使用されています。');
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
        } catch (uploadError: any) {
          Alert.alert('アップロードエラー', `プロフィール画像のアップロードに失敗しました。`);
          setUploading(false);
          return;
        }
      }

      await userService.updateProfile(userProfile.id, {
        display_name: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
        avatar_url: avatarUrl,
      });

      const updatedProfile = {
        ...userProfile,
        displayName: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
        avatar: avatarUrl
      };

      setUserProfile(updatedProfile);

      setIsEditModalVisible(false);
      setEditAvatar(null);
      Alert.alert('成功', 'プロフィールを更新しました。');
    } catch (error: any) {
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
            } catch (error) {
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
    setEditUsername('');
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
            setUserPosts(prevPosts => prevPosts.filter(p => p.id !== post.id));

            if (userProfile) {
              setUserProfile({
                ...userProfile,
                postsCount: Math.max(0, (userProfile.postsCount || 0) - 1)
              });
            }

            await postService.deletePost(post.id);
            Alert.alert('削除完了', 'ポストを削除しました。');
          } catch (error: any) {
            loadUserProfile();
            Alert.alert('エラー', `削除に失敗しました。`);
          }
        }}
      ]
    );
  };

  const renderPostItem = ({ item }: { item: UserPost }) => (
    <View style={styles.postItem}>
      <TouchableOpacity
        style={styles.postImageContainer}
        onPress={() => Alert.alert('投稿詳細', `タイトル: ${item.title}\nメニュー: ${item.menuName}`)}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: item.mediaUri }}
          style={styles.postImage}
          contentFit="cover"
        />
        {item.isVideo && (
          <View style={styles.videoIndicator}>
            <Ionicons name="play" size={14} color="white" />
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.postActionButtons}>
        <TouchableOpacity
          style={styles.editPostButton}
          onPress={() => handleEditPost(item.id)}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={16} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deletePostButton}
          onPress={() => handleDeletePost(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={16} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => {
    if (!userProfile) return null;

    return (
      <View style={styles.header}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: userProfile.avatar }}
              style={styles.avatar}
              contentFit="cover"
            />
          </View>
        </View>

        <Text style={styles.displayName}>
          {userProfile.displayName || userProfile.username || 'ユーザー'}
        </Text>
        <Text style={styles.username}>@{userProfile.username}</Text>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userProfile.postsCount}</Text>
            <Text style={styles.statLabel}>投稿</Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <AnimatedButton
            style={styles.editButton}
            onPress={handleEditProfile}
            accessibilityLabel="プロフィールを編集"
          >
            <Ionicons name="create-outline" size={18} color="#1a1a1a" />
            <Text style={styles.editButtonText}>プロフィールを編集</Text>
          </AnimatedButton>

          <AnimatedButton
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityLabel="ログアウト"
          >
            <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          </AnimatedButton>
        </View>

        <View style={styles.postsHeader}>
          <Ionicons name="grid-outline" size={20} color="#1a1a1a" />
          <Text style={styles.postsHeaderText}>投稿一覧</Text>
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
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>アカウント</Text>
        <RNImage
          source={require('@/assets/images/SalonCloudロゴ.png')}
          style={styles.headerLogo}
          resizeMode="contain"
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
                <Text style={styles.inputLabel}>表示名</Text>
                <View style={[
                  styles.inputContainer,
                  focusedField === 'displayName' && styles.inputContainerFocused,
                ]}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={focusedField === 'displayName' ? '#1a1a1a' : '#999'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={editDisplayName}
                    onChangeText={setEditDisplayName}
                    placeholder="表示名を入力"
                    placeholderTextColor="#bbb"
                    maxLength={30}
                    onFocus={() => setFocusedField('displayName')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>ユーザー名</Text>
                <View style={[
                  styles.inputContainer,
                  focusedField === 'username' && styles.inputContainerFocused,
                ]}>
                  <Ionicons
                    name="at-outline"
                    size={20}
                    color={focusedField === 'username' ? '#1a1a1a' : '#999'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={editUsername}
                    onChangeText={(text) => setEditUsername(text.toLowerCase())}
                    placeholder="ユーザー名を入力"
                    placeholderTextColor="#bbb"
                    autoCapitalize="none"
                    maxLength={20}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <Text style={styles.inputHint}>3文字以上、英数字とアンダースコアのみ</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  topBarTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  headerLogo: {
    width: 85,
    height: 50,
    marginRight: -12,
    position: 'relative',
    top: 5,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  avatarSection: {
    marginBottom: 16,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f5f5f5',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  logoutButton: {
    width: 48,
    height: 48,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE5E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    width: '100%',
  },
  postsHeaderText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  loadingText: {
    fontSize: 15,
    color: '#888',
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
    color: '#1a1a1a',
  },
  cancelText: {
    fontSize: 16,
    color: '#888',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
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
    borderColor: '#1a1a1a',
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  inputHint: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 6,
    marginLeft: 4,
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
  },
  postItem: {
    width: itemSize,
    height: itemSize,
    margin: 1,
    position: 'relative',
  },
  postImageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  postActionButtons: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    gap: 6,
  },
  editPostButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletePostButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
