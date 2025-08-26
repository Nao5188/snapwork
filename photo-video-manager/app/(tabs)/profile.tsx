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
  const [userProfile, setUserProfile] = useState<UserProfile>({
    id: '1',
    username: 'staff_user',
    displayName: 'スタッフユーザー',
    avatar: 'https://via.placeholder.com/150x150/4A90E2/FFFFFF?text=S',
    postsCount: 24,
  });

  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');

  useEffect(() => {
    loadUserPosts();
  }, []);

  const loadUserPosts = async () => {
    // TODO: 実際のユーザー投稿データを取得
    // 現在はダミーデータ
    const dummyPosts: UserPost[] = [
      {
        id: '1',
        title: '本日のパスタ',
        menuName: 'カルボナーラ',
        mediaUri: 'https://via.placeholder.com/400x400/FFB6C1/000000?text=Pasta',
        isVideo: false,
        createdAt: new Date('2024-01-15'),
        likesCount: 42,
      },
      {
        id: '2',
        title: 'デザート',
        menuName: 'ティラミス',
        mediaUri: 'https://via.placeholder.com/400x400/98FB98/000000?text=Dessert',
        isVideo: false,
        createdAt: new Date('2024-01-14'),
        likesCount: 38,
      },
      {
        id: '3',
        title: 'サラダ',
        menuName: 'シーザーサラダ',
        mediaUri: 'https://via.placeholder.com/400x400/87CEEB/000000?text=Video',
        isVideo: true,
        createdAt: new Date('2024-01-13'),
        likesCount: 25,
      },
      {
        id: '4',
        title: 'スープ',
        menuName: 'コーンスープ',
        mediaUri: 'https://via.placeholder.com/400x400/DDA0DD/000000?text=Soup',
        isVideo: false,
        createdAt: new Date('2024-01-12'),
        likesCount: 31,
      },
      {
        id: '5',
        title: 'メイン',
        menuName: 'ステーキ',
        mediaUri: 'https://via.placeholder.com/400x400/F0E68C/000000?text=Steak',
        isVideo: false,
        createdAt: new Date('2024-01-11'),
        likesCount: 67,
      },
      {
        id: '6',
        title: 'ドリンク',
        menuName: 'コーヒー',
        mediaUri: 'https://via.placeholder.com/400x400/D2691E/000000?text=Coffee',
        isVideo: false,
        createdAt: new Date('2024-01-10'),
        likesCount: 18,
      },
    ];

    setUserPosts(dummyPosts);
  };

  const handleEditProfile = () => {
    setEditDisplayName(userProfile.displayName);
    setEditUsername(userProfile.username);
    setIsEditModalVisible(true);
  };

  const handleSaveProfile = () => {
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

    setUserProfile(prev => ({
      ...prev,
      displayName: editDisplayName.trim(),
      username: editUsername.trim().toLowerCase()
    }));
    
    setIsEditModalVisible(false);
    Alert.alert('成功', 'プロフィールを更新しました。');
  };

  const handleCancelEdit = () => {
    setIsEditModalVisible(false);
    setEditDisplayName('');
    setEditUsername('');
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

  const renderHeader = () => (
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
      
      <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
        <Text style={styles.editButtonText}>プロフィールを編集</Text>
      </TouchableOpacity>
    </View>
  );

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
              <TouchableOpacity onPress={handleSaveProfile}>
                <Text style={styles.saveText}>保存</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
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
  editButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 6,
    marginTop: 12,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    textAlign: 'center',
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