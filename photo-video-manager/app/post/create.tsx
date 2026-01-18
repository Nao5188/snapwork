import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Animated,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { postService, authService, fileStorageService } from '@/lib/supabase';

const DEFAULT_MENU_CATEGORIES = ['カット', 'カラー', 'パーマ', '縮毛', 'トリートメント'];
const CUSTOM_CATEGORIES_KEY = 'custom_menu_categories';

interface MediaItem {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  fileName: string;
}

export default function CreatePostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [formData, setFormData] = useState({
    title: '',
    menuName: '',
    shootingDate: new Date(),
  });

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadCustomCategories();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

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

  useEffect(() => {
    if (params.imageUri) {
      const newMediaItem: MediaItem = {
        id: Date.now().toString(),
        uri: params.imageUri as string,
        type: 'photo',
        fileName: `photo_${Date.now()}.jpg`,
      };
      setMediaItems([newMediaItem]);
    } else if (params.selectedMedia) {
      const selectedUris = (params.selectedMedia as string).split(',');
      const newMediaItems: MediaItem[] = selectedUris.map((uri, index) => {
        const isVideo = uri.includes('.mp4') || uri.includes('.mov') || uri.includes('.avi');
        return {
          id: `selected_${Date.now()}_${index}`,
          uri: decodeURIComponent(uri),
          type: isVideo ? 'video' : 'photo',
          fileName: `media_${Date.now()}_${index}.${isVideo ? 'mp4' : 'jpg'}`,
        };
      });
      setMediaItems(newMediaItems);
    }
  }, [params.imageUri, params.selectedMedia]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFormData(prev => ({ ...prev, shootingDate: selectedDate }));
    }
  };

  const selectFromAlbum = () => {
    router.push('/gallery');
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
      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        Alert.alert('エラー', 'ログインが必要です。');
        router.replace('/login');
        return;
      }

      // 画像をSupabase Storageにアップロード
      console.log('Uploading images to Supabase Storage...');
      const uploadedMediaUrls: string[] = [];

      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        try {
          console.log(`Uploading image ${i + 1}/${mediaItems.length}...`);
          const uploadedUrl = await fileStorageService.uploadPostImage(user.id, item.uri);
          uploadedMediaUrls.push(uploadedUrl);
          console.log(`Image ${i + 1} uploaded:`, uploadedUrl);
        } catch (uploadError) {
          console.error(`Failed to upload image ${i + 1}:`, uploadError);
          // アップロードに失敗した場合は元のURIを使用（フォールバック）
          uploadedMediaUrls.push(item.uri);
        }
      }

      const mainMediaUrl = uploadedMediaUrls[0];

      // メニュー名にカテゴリ情報を含める
      let menuNameWithCategories = formData.menuName;
      if (selectedCategories.length > 0) {
        const categoryStr = selectedCategories.join(',');
        menuNameWithCategories = menuNameWithCategories
          ? `${menuNameWithCategories}|CATEGORIES:${categoryStr}`
          : `|CATEGORIES:${categoryStr}`;
      }

      let enhancedMenuName = menuNameWithCategories;
      if (uploadedMediaUrls.length > 1) {
        const additionalUrls = uploadedMediaUrls.slice(1);
        enhancedMenuName = `${menuNameWithCategories}|EXTRA_MEDIA:${additionalUrls.join(',')}`;
      }

      const postData = {
        title: formData.title || '無題',
        menu_name: enhancedMenuName,
        media_url: mainMediaUrl,
        is_video: mediaItems[0].type === 'video',
        user_id: user.id,
        likes_count: 0,
      };

      try {
        const savedPost = await postService.createPost(postData);

        if (uploadedMediaUrls.length > 1) {
          try {
            const postMediaItems = uploadedMediaUrls.map((url, index) => ({
              media_url: url,
              is_video: mediaItems[index].type === 'video',
              display_order: index,
            }));

            await postService.setPostMedia(savedPost.id, postMediaItems);
          } catch (mediaError) {
            console.warn('Failed to save to post_media table:', mediaError);
          }
        }

        Alert.alert(
          '投稿完了',
          '投稿が正常に作成されました。',
          [{ text: 'OK', onPress: () => router.push('/(tabs)/history') }]
        );

        return savedPost;
      } catch (createError) {
        console.error('Post creation error:', createError);
        throw createError;
      }
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('エラー', '投稿の作成に失敗しました。');
    } finally {
      setLoading(false);
    }
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>新しい投稿</Text>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>
              {loading ? '投稿中...' : '投稿'}
            </Text>
          </TouchableOpacity>
        </View>

        <Animated.ScrollView
          style={[styles.content, { opacity: fadeAnim }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Media Selection */}
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
                    <TouchableOpacity style={styles.mediaActionButton} onPress={selectFromAlbum} activeOpacity={0.7}>
                      <Ionicons name="albums-outline" size={24} color="#1a1a1a" />
                      <Text style={styles.mediaActionText}>アルバム</Text>
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

            {/* Shooting Date */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>撮影日時</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={20} color="#888" />
                <Text style={styles.dateButtonText}>
                  {formData.shootingDate.toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.ScrollView>

        {showDatePicker && (
          <DateTimePicker
            value={formData.shootingDate}
            mode="datetime"
            display="default"
            onChange={handleDateChange}
          />
        )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    gap: 10,
  },
  dateButtonText: {
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
