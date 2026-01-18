import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  FlatList,
  Animated,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { postService, authService } from '@/lib/supabase';

const DEFAULT_MENU_CATEGORIES = ['カット', 'カラー', 'パーマ', '縮毛', 'トリートメント'];
const CUSTOM_CATEGORIES_KEY = 'custom_menu_categories';

interface MediaItem {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  fileName: string;
}

export default function EditPostScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [formData, setFormData] = useState({
    title: '',
    menuName: '',
  });

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadCustomCategories();
    checkAuthAndLoadData();
  }, [id]);

  const loadCustomCategories = async () => {
    try {
      const stored = await AsyncStorage.getItem(CUSTOM_CATEGORIES_KEY);
      if (stored) {
        setCustomCategories(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading custom categories:', error);
    }
  };

  const saveCustomCategory = async (category: string) => {
    try {
      const updated = [...customCategories, category];
      await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(updated));
      setCustomCategories(updated);
    } catch (error) {
      console.error('Error saving custom category:', error);
    }
  };

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      Alert.alert('エラー', 'カテゴリ名を入力してください。');
      return;
    }
    const allCategories = [...DEFAULT_MENU_CATEGORIES, ...customCategories];
    if (allCategories.includes(trimmed)) {
      Alert.alert('エラー', 'このカテゴリは既に存在します。');
      return;
    }
    saveCustomCategory(trimmed);
    setSelectedCategories(prev => [...prev, trimmed]);
    setNewCategoryName('');
    setShowAddCategoryModal(false);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleDeleteCategory = (category: string) => {
    // デフォルトカテゴリは削除不可
    if (DEFAULT_MENU_CATEGORIES.includes(category)) {
      Alert.alert('削除不可', 'デフォルトのカテゴリは削除できません。');
      return;
    }

    Alert.alert(
      'カテゴリを削除',
      `「${category}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              // カスタムカテゴリから削除
              const updated = customCategories.filter(c => c !== category);
              await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(updated));
              setCustomCategories(updated);
              // 選択中の場合は選択解除
              setSelectedCategories(prev => prev.filter(c => c !== category));
            } catch (error) {
              console.error('Error deleting category:', error);
              Alert.alert('エラー', 'カテゴリの削除に失敗しました。');
            }
          }
        }
      ]
    );
  };

  const checkAuthAndLoadData = async () => {
    try {
      const { data } = await authService.getCurrentUser();
      if (!data.user) {
        Alert.alert('エラー', 'ログインが必要です。');
        router.back();
        return;
      }
      setCurrentUserId(data.user.id);
      await loadPostData();

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      console.error('Auth check error:', error);
      Alert.alert('エラー', '認証の確認に失敗しました。');
      router.back();
    }
  };

  const loadPostData = async () => {
    try {
      const postWithMedia = await postService.getPostWithMedia(id as string);

      if (!postWithMedia) {
        Alert.alert(
          '投稿が見つかりません',
          'この投稿は削除されたか、存在しません。',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        setInitialLoading(false);
        return;
      }

      if (currentUserId && postWithMedia.user_id !== currentUserId) {
        Alert.alert(
          '権限がありません',
          'この投稿を編集する権限がありません。',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        setInitialLoading(false);
        return;
      }

      // Parse menu_name to extract categories
      let menuName = postWithMedia.menu_name || '';
      let categories: string[] = [];

      if (menuName.includes('|CATEGORIES:')) {
        const parts = menuName.split('|CATEGORIES:');
        menuName = parts[0];
        const categoryPart = parts[1]?.split('|')[0];
        if (categoryPart) {
          categories = categoryPart.split(',').filter(c => c.trim());
        }
      }

      // Remove EXTRA_MEDIA if present
      if (menuName.includes('|EXTRA_MEDIA:')) {
        menuName = menuName.split('|EXTRA_MEDIA:')[0];
      }

      setFormData({
        title: postWithMedia.title === '無題' ? '' : postWithMedia.title,
        menuName: menuName,
      });
      setSelectedCategories(categories);

      const mediaItems: MediaItem[] = [];

      if (postWithMedia.mediaItems && postWithMedia.mediaItems.length > 0) {
        postWithMedia.mediaItems.forEach((media: any, index: number) => {
          mediaItems.push({
            id: media.id,
            uri: media.media_url,
            type: media.is_video ? 'video' : 'photo',
            fileName: media.is_video ? 'video.mp4' : 'photo.jpg',
          });
        });
      } else if (postWithMedia.media_url) {
        mediaItems.push({
          id: '1',
          uri: postWithMedia.media_url,
          type: postWithMedia.is_video ? 'video' : 'photo',
          fileName: postWithMedia.is_video ? 'video.mp4' : 'photo.jpg',
        });
      }

      setMediaItems(mediaItems);
      setInitialLoading(false);

    } catch (error: any) {
      console.error('Error loading post:', error);

      if (error?.code === 'PGRST116') {
        Alert.alert(
          '投稿が見つかりません',
          'この投稿は既に削除されているか、存在しません。',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          'エラー',
          '投稿データの読み込みに失敗しました。',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
      setInitialLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const selectMediaFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: 5 - mediaItems.length,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newMediaItems: MediaItem[] = result.assets.map((asset, index) => ({
          id: `${Date.now()}_${index}`,
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'photo',
          fileName: asset.fileName || `media_${Date.now()}_${index}`,
        }));

        setMediaItems(prev => [...prev, ...newMediaItems].slice(0, 5));
      }
    } catch (error) {
      console.error('Error selecting media:', error);
      Alert.alert('エラー', 'メディアの選択に失敗しました。');
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const newMediaItem: MediaItem = {
          id: Date.now().toString(),
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'photo',
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
        };

        setMediaItems(prev => [newMediaItem, ...prev].slice(0, 5));
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('エラー', '撮影に失敗しました。');
    }
  };

  const removeMediaItem = (id: string) => {
    setMediaItems(prev => prev.filter(item => item.id !== id));
  };

  const validateForm = () => {
    if (mediaItems.length === 0) {
      Alert.alert('入力エラー', '少なくとも1つのメディアを追加してください。');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // メニュー名にカテゴリ情報を含める
      let menuNameWithCategories = formData.menuName;
      if (selectedCategories.length > 0) {
        const categoryStr = selectedCategories.join(',');
        menuNameWithCategories = menuNameWithCategories
          ? `${menuNameWithCategories}|CATEGORIES:${categoryStr}`
          : `|CATEGORIES:${categoryStr}`;
      }

      await postService.updatePost(id as string, {
        title: formData.title || '無題',
        menu_name: menuNameWithCategories,
        media_url: mediaItems.length > 0 ? mediaItems[0].uri : '',
        is_video: mediaItems.length > 0 ? mediaItems[0].type === 'video' : false,
      });

      const postMediaItems = mediaItems.map((item, index) => ({
        media_url: item.uri,
        is_video: item.type === 'video',
        display_order: index,
      }));

      await postService.setPostMedia(id as string, postMediaItems);

      Alert.alert(
        '更新完了',
        '投稿が正常に更新されました。',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error updating post:', error);
      Alert.alert('エラー', '投稿の更新に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      '投稿削除',
      'この投稿を削除しますか？\nこの操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await postService.deletePost(id as string);

              Alert.alert(
                '削除完了',
                '投稿を削除しました。',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert('エラー', '投稿の削除に失敗しました。');
            }
          }
        }
      ]
    );
  };

  const renderMediaItem = ({ item }: { item: MediaItem }) => (
    <View style={styles.mediaItem}>
      <Image
        source={{ uri: item.uri }}
        style={styles.mediaImage}
        contentFit="cover"
      />
      {item.type === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={14} color="white" />
        </View>
      )}
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeMediaItem(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.removeButtonInner}>
          <Ionicons name="close" size={14} color="#fff" />
        </View>
      </TouchableOpacity>
    </View>
  );

  if (initialLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingIcon}>
            <Ionicons name="document-outline" size={32} color="#bbb" />
          </View>
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>投稿を編集</Text>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>
              {loading ? '更新中...' : '更新'}
            </Text>
          </TouchableOpacity>
        </View>

        <Animated.ScrollView
          style={[styles.content, { opacity: fadeAnim }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Media Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>メディア ({mediaItems.length}/5)</Text>

            <FlatList
              data={mediaItems}
              renderItem={renderMediaItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaList}
              ListFooterComponent={
                mediaItems.length < 5 ? (
                  <View style={styles.mediaActions}>
                    <TouchableOpacity style={styles.mediaActionButton} onPress={takePhoto} activeOpacity={0.7}>
                      <Ionicons name="camera-outline" size={24} color="#1a1a1a" />
                      <Text style={styles.mediaActionText}>撮影</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mediaActionButton} onPress={selectMediaFromLibrary} activeOpacity={0.7}>
                      <Ionicons name="images-outline" size={24} color="#1a1a1a" />
                      <Text style={styles.mediaActionText}>選択</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          </View>

          {/* Post Form */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>投稿内容</Text>

            {/* Title */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>タイトル</Text>
              <View style={[
                styles.inputContainer,
                focusedField === 'title' && styles.inputContainerFocused,
              ]}>
                <TextInput
                  style={styles.input}
                  value={formData.title}
                  onChangeText={(text) => handleInputChange('title', text)}
                  placeholder="投稿のタイトルを入力（任意）"
                  placeholderTextColor="#bbb"
                  maxLength={100}
                  onFocus={() => setFocusedField('title')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Menu Name */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>メニュー名</Text>
              <View style={[
                styles.inputContainer,
                focusedField === 'menuName' && styles.inputContainerFocused,
              ]}>
                <TextInput
                  style={styles.input}
                  value={formData.menuName}
                  onChangeText={(text) => handleInputChange('menuName', text)}
                  placeholder="メニュー名を入力（任意）"
                  placeholderTextColor="#bbb"
                  maxLength={50}
                  onFocus={() => setFocusedField('menuName')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Category Buttons */}
              <View style={styles.categoryContainer}>
                {[...DEFAULT_MENU_CATEGORIES, ...customCategories].map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryButton,
                      selectedCategories.includes(category) && styles.categoryButtonSelected,
                      customCategories.includes(category) && styles.customCategoryButton,
                    ]}
                    onPress={() => toggleCategory(category)}
                    onLongPress={() => handleDeleteCategory(category)}
                    delayLongPress={500}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      selectedCategories.includes(category) && styles.categoryButtonTextSelected,
                    ]}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.addCategoryButton}
                  onPress={() => setShowAddCategoryModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color="#1a1a1a" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Delete Button */}
          <View style={styles.section}>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={styles.deleteButtonText}>この投稿を削除</Text>
            </TouchableOpacity>
          </View>
        </Animated.ScrollView>

        {/* Add Category Modal */}
        <Modal
          visible={showAddCategoryModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddCategoryModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>新しいカテゴリを追加</Text>
              <View style={[
                styles.inputContainer,
                focusedField === 'newCategory' && styles.inputContainerFocused,
              ]}>
                <TextInput
                  style={styles.input}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="カテゴリ名を入力"
                  placeholderTextColor="#bbb"
                  maxLength={20}
                  onFocus={() => setFocusedField('newCategory')}
                  onBlur={() => setFocusedField(null)}
                  autoFocus
                />
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setNewCategoryName('');
                    setShowAddCategoryModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelButtonText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSubmitButton}
                  onPress={handleAddCategory}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalSubmitButtonText}>追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  loadingContainer: {
    flex: 1,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  submitButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  mediaList: {
    paddingRight: 16,
  },
  mediaItem: {
    width: 88,
    height: 88,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
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
  removeButton: {
    position: 'absolute',
    top: 4,
    left: 4,
  },
  removeButtonInner: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaActions: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaActionButton: {
    width: 88,
    height: 88,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaActionText: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    fontWeight: '500',
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
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputContainerFocused: {
    backgroundColor: '#fff',
    borderColor: '#1a1a1a',
  },
  input: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
  },
  categoryButtonSelected: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  categoryButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  categoryButtonTextSelected: {
    color: '#fff',
  },
  customCategoryButton: {
    borderStyle: 'dashed',
  },
  addCategoryButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFE5E5',
    gap: 8,
  },
  deleteButtonText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  modalSubmitButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
