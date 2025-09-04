import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Text, 
  ScrollView,
  Dimensions,
  Alert,
  TextInput,
  Modal
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { authService, userService, postService } from '@/lib/supabase';

const { width } = Dimensions.get('window');
const numColumns = 3;
const itemSize = (width - 6) / numColumns;

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

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      
      // 現在のユーザーを取得
      const { data: { user } } = await authService.getCurrentUser();
      
      if (!user) {
        router.replace('/login');
        return;
      }

      // ユーザープロフィールを取得
      const profile = await userService.getProfile(user.id);
      
      // ユーザーの投稿を取得
      const posts = await postService.getUserPosts(user.id);
      
      // 投稿数を取得
      const postsCount = await postService.getUserPostsCount(user.id);
      
      setUserProfile({
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatar: profile.avatar_url || 'https://via.placeholder.com/150x150/4A90E2/FFFFFF?text=' + profile.display_name.charAt(0),
        postsCount: postsCount,
      });

      // 投稿データを変換
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
      Alert.alert('エラー', 'プロフィールの読み込みに失敗しました。');
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    
    if (!editDisplayName.trim()) {
      Alert.alert('エラー', '表示名を入力してください。');
      return;
    }
    if (!editUsername.trim()) {
      Alert.alert('エラー', 'ユーザー名を入力してください。');
      return;
    }
    if (editUsername.length < 3) {
      Alert.alert('エラー', 'ユーザー名は3文字以上で入力してください。');
      return;
    }

    setUploading(true);
    try {
      // ユーザー名の重複チェック
      const isAvailable = await userService.checkUsernameAvailability(editUsername.trim().toLowerCase(), userProfile.id);
      if (!isAvailable) {
        Alert.alert('エラー', 'このユーザー名は既に使用されています。');
        setUploading(false);
        return;
      }

      let avatarUrl = userProfile.avatar;
      
      // 新しい画像が選択されている場合はアップロード
      if (editAvatar && editAvatar !== userProfile.avatar) {
        // 実際のアップロード処理はSupabaseのストレージ設定が必要
        // ここでは仮のURLを設定
        avatarUrl = editAvatar;
      }

      // プロフィールを更新
      await userService.updateProfile(userProfile.id, {
        display_name: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
        avatar_url: avatarUrl,
      });

      setUserProfile(prev => prev ? {
        ...prev,
        displayName: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
        avatar: avatarUrl
      } : null);
      
      setIsEditModalVisible(false);
      Alert.alert('成功', 'プロフィールを更新しました。');
    } catch (error) {
      console.error('Profile update error:', error);
      Alert.alert('エラー', 'プロフィールの更新に失敗しました。');
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
              console.error('Logout error:', error);
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


  const renderPostItem = ({ item }: { item: UserPost }) => (
    <TouchableOpacity 
      style={styles.postItem}
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
          <Ionicons name="play" size={16} color="white" />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderHeader = () => {
    if (!userProfile) return null;
    
    return (
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: userProfile.avatar }}
            style={styles.avatar}
            contentFit="cover"
          />
        </View>
        
        <Text style={styles.displayName}>{userProfile.displayName}</Text>
        
        <View style={styles.statsContainer}>
          <Text style={styles.statNumber}>{userProfile.postsCount}</Text>
          <Text style={styles.statLabel}>ポスト</Text>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
            <Text style={styles.editButtonText}>プロフィールを編集</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={16} color="#ff4444" />
            <Text style={styles.logoutButtonText}>ログアウト</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
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
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.username}>{userProfile.displayName}</Text>
      </View>

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
      
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={handleCancelEdit}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleCancelEdit}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>プロフィール編集</Text>
              <TouchableOpacity onPress={handleSaveProfile} disabled={uploading}>
                <Text style={[styles.saveText, uploading && styles.saveTextDisabled]}>
                  {uploading ? '保存中...' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <View style={styles.avatarEditContainer}>
                <TouchableOpacity onPress={handleSelectAvatar} activeOpacity={0.8}>
                  <View style={styles.avatarEditWrapper}>
                    <Image
                      source={{ uri: editAvatar || 'https://via.placeholder.com/150x150/cccccc/ffffff?text=画像なし' }}
                      style={styles.avatarEdit}
                      contentFit="cover"
                    />
                    <View style={styles.avatarEditOverlay}>
                      <Ionicons name="camera" size={24} color="white" />
                      <Text style={styles.avatarEditText}>変更</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>表示名</Text>
                <TextInput
                  style={styles.input}
                  value={editDisplayName}
                  onChangeText={setEditDisplayName}
                  placeholder="表示名を入力"
                  maxLength={30}
                />
              </View>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>ユーザー名</Text>
                <TextInput
                  style={styles.input}
                  value={editUsername}
                  onChangeText={(text) => setEditUsername(text.toLowerCase())}
                  placeholder="ユーザー名を入力"
                  autoCapitalize="none"
                  maxLength={20}
                />
                <Text style={styles.inputHint}>3文字以上、英数字とアンダースコアのみ</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  topBar: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  username: {
    fontSize: 20,
    fontWeight: '600',
    color: '#262626',
  },
  scrollContent: {
    backgroundColor: '#ffffff',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#ffffff',
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
    textAlign: 'center',
  },
  statsContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#262626',
  },
  statLabel: {
    fontSize: 14,
    color: '#8e8e8e',
    marginTop: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  editButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 6,
    flex: 1,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: '#fff5f5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ff4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff4444',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8e8e8e',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
  },
  cancelText: {
    fontSize: 16,
    color: '#8e8e8e',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0095f6',
  },
  saveTextDisabled: {
    color: '#b3b3b3',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#262626',
    backgroundColor: '#fafafa',
  },
  inputHint: {
    fontSize: 12,
    color: '#8e8e8e',
    marginTop: 4,
  },
  avatarEditContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarEditWrapper: {
    position: 'relative',
  },
  avatarEdit: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
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
  avatarEditText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
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
  postImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});