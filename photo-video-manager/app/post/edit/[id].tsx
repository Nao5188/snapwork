import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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

export default function EditPostScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useAppTheme();

  const [formData, setFormData] = useState({
    title: '',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const checkAuthAndLoadData = async () => {
    try {
      const { data } = await authService.getCurrentUser();
      if (!data.user) {
        Alert.alert('エラー', 'ログインが必要です。');
        router.back();
        return;
      }
      setCurrentUserId(data.user.id);
      // userId を直接渡して state 非同期更新の影響を回避
      await loadPostData(data.user.id);

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

  const loadPostData = async (userId?: string) => {
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

      const ownerId = userId ?? currentUserId;
      if (ownerId && postWithMedia.user_id !== ownerId) {
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
          categories = categoryPart.split(',').filter((c: string) => c.trim());
        }
      }

      // Remove EXTRA_MEDIA if present
      if (menuName.includes('|EXTRA_MEDIA:')) {
        menuName = menuName.split('|EXTRA_MEDIA:')[0];
      }

      setFormData({
        title: postWithMedia.title === '無題' ? '' : postWithMedia.title,
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
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 5 - mediaItems.length),
        quality: 1.0,
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

      // ローカルファイル（file://）のみ Supabase Storage にアップロード
      const uploadedMediaItems = await Promise.all(
        mediaItems.map(async (item) => {
          if (item.uri.startsWith('file://') || item.uri.startsWith('content://')) {
            try {
              const uploadedUrl = await fileStorageService.uploadPostImage(user.id, item.uri, id as string);
              return { ...item, uri: uploadedUrl };
            } catch (uploadError) {
              console.warn('Failed to upload media, using original URI:', uploadError);
              return item;
            }
          }
          return item;
        })
      );

      // カテゴリ情報を含める
      let menuNameWithCategories = '';
      if (selectedCategories.length > 0) {
        const categoryStr = selectedCategories.join(',');
        menuNameWithCategories = `|CATEGORIES:${categoryStr}`;
      }

      await postService.updatePost(id as string, {
        title: formData.title || '無題',
        menu_name: menuNameWithCategories,
        media_url: uploadedMediaItems.length > 0 ? uploadedMediaItems[0].uri : '',
        is_video: uploadedMediaItems.length > 0 ? uploadedMediaItems[0].type === 'video' : false,
      });

      const postMediaItems = uploadedMediaItems.map((item, index) => ({
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.loadingIcon, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="document-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>読み込み中...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          <Text style={[styles.headerTitle, { color: colors.text }]}>投稿を編集</Text>
          <Button
            title={loading ? '更新中...' : '更新'}
            variant="primary"
            size="small"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
          />
        </View>

        <Animated.ScrollView
          style={[styles.content, { opacity: fadeAnim }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Media Section */}
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
                      />
                    </View>
                    <View style={styles.mediaActionButton}>
                      <Button
                        icon="images-outline"
                        title="選択"
                        variant="outline"
                        size="small"
                        onPress={selectMediaFromLibrary}
                        style={styles.mediaActionButtonInner}
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

          {/* Delete Button */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Button
              icon="trash-outline"
              title="この投稿を削除"
              variant="danger"
              size="medium"
              onPress={handleDelete}
              fullWidth
            />
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
                <Button
                  title="キャンセル"
                  variant="secondary"
                  size="medium"
                  onPress={() => {
                    setNewCategoryName('');
                    setShowAddCategoryModal(false);
                  }}
                  style={styles.modalButton}
                />
                <Button
                  title="追加"
                  variant="primary"
                  size="medium"
                  onPress={handleAddCategory}
                  style={styles.modalButton}
                />
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
    backgroundColor: '#fafafa',
  },
  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  loadingText: {
    fontSize: 15,
    color: '#666666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + 12,
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
