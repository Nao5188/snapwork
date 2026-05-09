import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Animated,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { postService, authService, fileStorageService } from '@/lib/supabase';
import Button, { IconButton, TagButton } from '@/components/Button';
import { useAppTheme } from '@/lib/ThemeContext';

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
  const { colors } = useAppTheme();

  const [formData, setFormData] = useState({
    title: '',
  });

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleAddCategory = async () => {
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
    await saveCustomCategory(trimmed);
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
      const mediaTypesParam = params.mediaTypes ? (params.mediaTypes as string).split(',') : [];
      const newMediaItems: MediaItem[] = selectedUris.map((uri, index) => {
        // mediaTypesパラメータがあればそれを優先、なければ拡張子で判定（大文字小文字不問）
        const typeFromParam = mediaTypesParam[index];
        const lowerUri = uri.toLowerCase();
        const isVideo = typeFromParam === 'video' ||
          lowerUri.includes('.mp4') || lowerUri.includes('.mov') || lowerUri.includes('.avi');
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

  const selectFromAlbum = () => {
    router.push('/gallery');
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 1.0,
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

      // カテゴリ情報を含める
      let menuNameWithCategories = '';
      if (selectedCategories.length > 0) {
        const categoryStr = selectedCategories.join(',');
        menuNameWithCategories = `|CATEGORIES:${categoryStr}`;
      }

      const enhancedMenuName = menuNameWithCategories;

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
      {item.type === 'video' ? (
        <Video
          source={{ uri: item.uri }}
          style={styles.mediaImage}
          resizeMode={ResizeMode.COVER}
          shouldPlay={false}
          isMuted={true}
        />
      ) : (
        <Image
          source={{ uri: item.uri }}
          style={styles.mediaImage}
          contentFit="cover"
        />
      )}
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <IconButton
            icon="chevron-back"
            variant="ghost"
            size="medium"
            onPress={() => router.back()}
            accessibilityLabel="戻る"
          />
          <Text style={[styles.headerTitle, { color: colors.text }]}>新しい投稿</Text>
          <Button
            title={loading ? '投稿中...' : '投稿'}
            variant="primary"
            size="small"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            accessibilityLabel={loading ? '投稿中' : '投稿する'}
            testID="create-submit-button"
          />
        </View>

        <Animated.ScrollView
          style={[styles.content, { opacity: fadeAnim }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Media Selection */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>メディア ({mediaItems.length}/5)</Text>

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
                    <View style={styles.mediaActionButton}>
                      <Button
                        icon="camera-outline"
                        title="撮影"
                        variant="outline"
                        size="small"
                        onPress={takePhoto}
                        style={styles.mediaActionButtonInner}
                        accessibilityLabel="カメラで撮影"
                        testID="create-add-media-button"
                      />
                    </View>
                    <View style={styles.mediaActionButton}>
                      <Button
                        icon="albums-outline"
                        title="アルバム"
                        variant="outline"
                        size="small"
                        onPress={selectFromAlbum}
                        style={styles.mediaActionButtonInner}
                        accessibilityLabel="アルバムから選択"
                      />
                    </View>
                  </View>
                ) : null
              }
            />
          </View>

          {/* Post Form */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>投稿内容</Text>

            {/* Title */}
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>タイトル</Text>
              <View style={[
                styles.inputContainer,
                { backgroundColor: colors.surface2 },
                focusedField === 'title' && { backgroundColor: colors.surface, borderColor: colors.primary },
              ]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={formData.title}
                  onChangeText={(text) => handleInputChange('title', text)}
                  placeholder="投稿のタイトルを入力（任意）"
                  placeholderTextColor={colors.textMuted}
                  maxLength={100}
                  onFocus={() => setFocusedField('title')}
                  onBlur={() => setFocusedField(null)}
                  testID="create-title-input"
                />
              </View>
            </View>

            {/* Category Buttons */}
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>カテゴリ</Text>
              <View style={styles.categoryContainer}>
                {[...DEFAULT_MENU_CATEGORIES, ...customCategories].map((category) => (
                  <TagButton
                    key={category}
                    title={category}
                    selected={selectedCategories.includes(category)}
                    onPress={() => toggleCategory(category)}
                    onLongPress={() => handleDeleteCategory(category)}
                    style={customCategories.includes(category) ? styles.customCategoryButton : undefined}
                  />
                ))}
                <IconButton
                  icon="add"
                  variant="outline"
                  size="small"
                  onPress={() => setShowAddCategoryModal(true)}
                  style={styles.addCategoryButton}
                />
              </View>
            </View>

          </View>
        </Animated.ScrollView>

        {/* Add Category Modal */}
        <Modal
          visible={showAddCategoryModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddCategoryModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>新しいカテゴリを追加</Text>
              <View style={[
                styles.inputContainer,
                { backgroundColor: colors.surface2 },
                focusedField === 'newCategory' && { backgroundColor: colors.surface, borderColor: colors.primary },
              ]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="カテゴリ名を入力"
                  placeholderTextColor={colors.textMuted}
                  maxLength={20}
                  onFocus={() => setFocusedField('newCategory')}
                  onBlur={() => setFocusedField(null)}
                  autoFocus
                />
              </View>
              <View style={styles.modalButtons}>
                <View style={styles.modalButton}>
                  <Button
                    title="キャンセル"
                    variant="secondary"
                    size="medium"
                    fullWidth
                    onPress={() => {
                      setNewCategoryName('');
                      setShowAddCategoryModal(false);
                    }}
                  />
                </View>
                <View style={styles.modalButton}>
                  <Button
                    title="追加"
                    variant="primary"
                    size="medium"
                    fullWidth
                    onPress={handleAddCategory}
                  />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
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
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#444444',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444444',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaActionButtonInner: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: '#fafafa',
  },
  inputWrapper: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputContainerFocused: {
    backgroundColor: '#fff',
    borderColor: '#444444',
  },
  input: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#444444',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customCategoryButton: {
    borderStyle: 'dashed',
  },
  addCategoryButton: {
    borderStyle: 'dashed',
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
    color: '#444444',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
  },
});
