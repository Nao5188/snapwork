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
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { postService, authService, fileStorageService, storeService } from '@/lib/supabase';
import Button from '@/components/Button';
import { useAppTheme } from '@/lib/ThemeContext';
import { gradients } from '@/lib/theme';
import { buildPostMenuName, POST_MENU_NAME_MAX_LENGTH } from '@/lib/postMenuName';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_HORIZONTAL_PADDING = 18;
const CARD_PADDING = 18;
const MEDIA_GAP = 10;
const MEDIA_ITEM_SIZE = Math.min(
  84,
  Math.max(
    68,
    Math.floor((SCREEN_WIDTH - CONTENT_HORIZONTAL_PADDING * 2 - CARD_PADDING * 2 - MEDIA_GAP * 3) / 4)
  )
);

const DEFAULT_MENU_CATEGORIES = ['カット', 'カラー', 'パーマ', '縮毛', 'トリートメント'];
const CUSTOM_CATEGORIES_KEY = 'custom_menu_categories';
const CREATE_POST_DRAFT_KEY = 'create_post_media_draft';
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  カット: 'cut-outline',
  カラー: 'color-palette-outline',
  パーマ: 'water-outline',
  縮毛: 'sparkles-outline',
  トリートメント: 'flask-outline',
};

interface MediaItem {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  fileName: string;
}

interface CreatePostDraft {
  formData: {
    title: string;
    memo: string;
  };
  selectedCategories: string[];
  mediaItems: MediaItem[];
}

const getSearchParam = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value[0] : value
);

const decodeMediaUri = (uri: string) => {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
};

const mergeMediaItems = (baseItems: MediaItem[], incomingItems: MediaItem[]) => {
  const seenUris = new Set<string>();
  return [...baseItems, ...incomingItems]
    .filter((item) => {
      if (!item.uri || seenUris.has(item.uri)) return false;
      seenUris.add(item.uri);
      return true;
    })
    .slice(0, 5);
};

const buildMediaItemsFromParams = (
  imageUri?: string,
  selectedMedia?: string,
  mediaTypes?: string
): MediaItem[] => {
  const timestamp = Date.now();

  if (imageUri) {
    return [{
      id: `captured_${timestamp}`,
      uri: decodeMediaUri(imageUri),
      type: 'photo',
      fileName: `photo_${timestamp}.jpg`,
    }];
  }

  if (!selectedMedia) return [];

  const selectedUris = selectedMedia.split(',').filter(Boolean);
  const mediaTypesParam = mediaTypes ? mediaTypes.split(',') : [];

  return selectedUris.map((uri, index) => {
    const decodedUri = decodeMediaUri(uri);
    const typeFromParam = mediaTypesParam[index];
    const lowerUri = decodedUri.toLowerCase();
    const isVideo = typeFromParam === 'video' ||
      lowerUri.includes('.mp4') || lowerUri.includes('.mov') || lowerUri.includes('.avi');

    return {
      id: `selected_${timestamp}_${index}`,
      uri: decodedUri,
      type: isVideo ? 'video' : 'photo',
      fileName: `media_${timestamp}_${index}.${isVideo ? 'mp4' : 'jpg'}`,
    };
  });
};

export default function CreatePostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useAppTheme();

  const [formData, setFormData] = useState({
    title: '',
    memo: '',
  });

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const processedMediaParamsRef = useRef<string | null>(null);

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
    const imageUri = getSearchParam(params.imageUri);
    const selectedMedia = getSearchParam(params.selectedMedia);
    const mediaTypes = getSearchParam(params.mediaTypes);
    const appendMedia = getSearchParam(params.appendMedia) === '1';

    if (!imageUri && !selectedMedia) return;

    const paramKey = [imageUri, selectedMedia, mediaTypes, appendMedia ? 'append' : 'replace'].join('|');
    if (processedMediaParamsRef.current === paramKey) return;
    processedMediaParamsRef.current = paramKey;

    let cancelled = false;

    const hydrateMedia = async () => {
      let draftMediaItems: MediaItem[] | null = null;

      if (appendMedia) {
        try {
          const storedDraft = await AsyncStorage.getItem(CREATE_POST_DRAFT_KEY);
          if (storedDraft) {
            const draft = JSON.parse(storedDraft) as CreatePostDraft;
            if (!cancelled) {
              setFormData(draft.formData);
              setSelectedCategories(draft.selectedCategories ?? []);
            }
            draftMediaItems = draft.mediaItems ?? [];
          }
        } catch (error) {
          console.error('Error restoring create post draft:', error);
        }
      }

      const incomingItems = buildMediaItemsFromParams(imageUri, selectedMedia, mediaTypes);
      if (incomingItems.length === 0 || cancelled) return;

      setMediaItems(prev => mergeMediaItems(appendMedia ? (draftMediaItems ?? prev) : [], incomingItems));

      if (appendMedia) {
        await AsyncStorage.removeItem(CREATE_POST_DRAFT_KEY).catch((error) => {
          console.error('Error clearing create post draft:', error);
        });
      }
    };

    hydrateMedia();

    return () => {
      cancelled = true;
    };
  }, [params.imageUri, params.selectedMedia, params.mediaTypes, params.appendMedia]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const persistDraftForMediaSelection = async () => {
    const draft: CreatePostDraft = {
      formData,
      selectedCategories,
      mediaItems,
    };

    try {
      await AsyncStorage.setItem(CREATE_POST_DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error('Error saving create post draft:', error);
    }
  };

  const getMediaPickerParams = () => ({
    returnToCreate: '1',
    appendMedia: '1',
    existingMediaCount: String(mediaItems.length),
  });

  const selectFromAlbum = async () => {
    const remainingSlots = 5 - mediaItems.length;
    if (remainingSlots <= 0) {
      Alert.alert('追加できません', 'メディアは最大5件まで追加できます。');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 1.0,
      });

      if (result.canceled || !result.assets?.length) return;

      const timestamp = Date.now();
      const selectedItems: MediaItem[] = result.assets.map((asset, index) => {
        const isVideo = asset.type === 'video';
        return {
          id: `library_${timestamp}_${index}`,
          uri: asset.uri,
          type: isVideo ? 'video' : 'photo',
          fileName: asset.fileName || `library_${timestamp}_${index}.${isVideo ? 'mp4' : 'jpg'}`,
        };
      });

      setMediaItems(prev => mergeMediaItems(prev, selectedItems));
    } catch (error) {
      console.error('Error selecting media from album:', error);
      Alert.alert('エラー', 'アルバムからの追加に失敗しました。');
    }
  };

  const takePhoto = async () => {
    await persistDraftForMediaSelection();
    router.push({
      pathname: '/(tabs)',
      params: getMediaPickerParams(),
    } as any);
  };

  const removeMediaItem = (id: string) => {
    setMediaItems(prev => prev.filter(item => item.id !== id));
  };

  const renderMediaActionTile = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    variant: 'photo' | 'album'
  ) => (
    <TouchableOpacity
      style={styles.mediaActionTile}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[
        styles.mediaActionIcon,
        variant === 'photo' ? styles.mediaActionIconPhoto : styles.mediaActionIconAlbum,
      ]}>
        <Ionicons name={icon} size={24} color="#111827" />
      </View>
      <Text style={styles.mediaActionLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const renderCategoryButton = (category: string) => {
    const selected = selectedCategories.includes(category);
    const isCustom = customCategories.includes(category);
    const icon = CATEGORY_ICONS[category] || 'pricetag-outline';

    return (
      <TouchableOpacity
        key={category}
        style={[
          styles.categoryPill,
          selected && styles.categoryPillSelected,
          isCustom && styles.customCategoryButton,
        ]}
        onPress={() => toggleCategory(category)}
        onLongPress={() => handleDeleteCategory(category)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Ionicons name={icon} size={18} color={selected ? '#2563EB' : '#111827'} />
        <Text style={[styles.categoryPillText, selected && styles.categoryPillTextSelected]}>
          {category}
        </Text>
      </TouchableOpacity>
    );
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

      const activeStoreId = await storeService.getActiveStoreId(user.id);

      if (!activeStoreId) {
        Alert.alert(
          '店舗が未設定です',
          '店舗を作成または参加してから投稿してください。',
          [{ text: 'OK', onPress: () => router.replace('/store-onboarding') }]
        );
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

      const enhancedMenuName = buildPostMenuName(formData.memo, selectedCategories);

      const postData = {
        title: formData.title || '無題',
        menu_name: enhancedMenuName,
        media_url: mainMediaUrl,
        is_video: mediaItems[0].type === 'video',
        user_id: user.id,
        store_id: activeStoreId,
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
          [{
            text: 'OK',
            onPress: async () => {
              await AsyncStorage.removeItem(CREATE_POST_DRAFT_KEY).catch(() => {});
              router.push('/(tabs)/history');
            },
          }]
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
          <Ionicons name="close" size={22} color="#111827" />
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
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surface }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityLabel="戻る"
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>新しい投稿</Text>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.86}
            accessibilityLabel={loading ? '投稿中' : '投稿する'}
            accessibilityRole="button"
            testID="create-submit-button"
          >
            <LinearGradient
              colors={gradients.salonBlue}
              style={styles.submitGradient}
            >
              <Text style={styles.submitButtonText}>{loading ? '投稿中...' : '投稿する'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Animated.ScrollView
          style={[styles.content, { opacity: fadeAnim }]}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Media Selection */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleGroup}>
                <View style={styles.sectionIconBox}>
                  <Ionicons name="image-outline" size={22} color="#4F6AF2" />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>メディア</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{mediaItems.length}/5</Text>
                </View>
              </View>
            </View>

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
                    {renderMediaActionTile('camera-outline', '追加', takePhoto, 'photo')}
                    {renderMediaActionTile('albums-outline', 'アルバム', selectFromAlbum, 'album')}
                  </View>
                ) : null
              }
            />
            <View style={styles.mediaHelpRow}>
              <Ionicons name="sparkles-outline" size={16} color="#4F6AF2" />
              <Text style={[styles.mediaHelpText, { color: colors.textSecondary }]}>
                最大5枚まで追加できます（写真・動画どちらも可）
              </Text>
            </View>
          </View>

          {/* Post Form */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={[styles.sectionTitleGroup, styles.formTitleGroup]}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="document-text-outline" size={22} color="#4F6AF2" />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>投稿内容</Text>
            </View>

            {/* Title */}
            <View style={styles.inputWrapper}>
              <View style={styles.inputLabelRow}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>タイトル</Text>
                <Text style={[styles.inputCounter, { color: colors.textSecondary }]}>{formData.title.length}/100</Text>
              </View>
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

            {/* Memo */}
            <View style={styles.inputWrapper}>
              <View style={styles.inputLabelRow}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>投稿メモ</Text>
                <Text style={[styles.inputCounter, { color: colors.textSecondary }]}>{formData.memo.length}/{POST_MENU_NAME_MAX_LENGTH}</Text>
              </View>
              <View style={[
                styles.inputContainer,
                styles.memoInputContainer,
                { backgroundColor: colors.surface2 },
                focusedField === 'memo' && { backgroundColor: colors.surface, borderColor: colors.primary },
              ]}>
                <TextInput
                  style={[styles.input, styles.memoInput, { color: colors.text }]}
                  value={formData.memo}
                  onChangeText={(text) => handleInputChange('memo', text)}
                  placeholder="施術内容や共有したいメモを入力（任意）"
                  placeholderTextColor={colors.textMuted}
                  maxLength={POST_MENU_NAME_MAX_LENGTH}
                  multiline
                  textAlignVertical="top"
                  onFocus={() => setFocusedField('memo')}
                  onBlur={() => setFocusedField(null)}
                  testID="create-memo-input"
                />
              </View>
            </View>

            {/* Category Buttons */}
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>カテゴリ</Text>
              <View style={styles.categoryContainer}>
                {[...DEFAULT_MENU_CATEGORIES, ...customCategories].map(renderCategoryButton)}
                <TouchableOpacity
                  style={[styles.categoryPill, styles.addCategoryButton]}
                  onPress={() => setShowAddCategoryModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={19} color="#4F6AF2" />
                  <Text style={styles.addCategoryText}>カテゴリを追加</Text>
                </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  headerTitle: {
    position: 'absolute',
    left: 100,
    right: 100,
    textAlign: 'center',
    fontSize: 21,
    fontWeight: '800',
    color: '#111827',
  },
  submitButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitGradient: {
    minWidth: 106,
    minHeight: 48,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingTop: 18,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: CARD_PADDING,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  formTitleGroup: {
    marginBottom: 16,
  },
  sectionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
  },
  countBadgeText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '800',
  },
  mediaList: {
    paddingRight: 8,
  },
  mediaItem: {
    width: MEDIA_ITEM_SIZE,
    height: MEDIA_ITEM_SIZE,
    marginRight: MEDIA_GAP,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F8FAFC',
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
    top: 6,
    right: 6,
  },
  removeButtonInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  mediaActions: {
    flexDirection: 'row',
    gap: MEDIA_GAP,
  },
  mediaActionTile: {
    width: MEDIA_ITEM_SIZE,
    height: MEDIA_ITEM_SIZE,
    borderWidth: 1.5,
    borderColor: '#D8E0F5',
    borderStyle: 'dashed',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FBFCFF',
  },
  mediaActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 7,
  },
  mediaActionIconPhoto: {
    backgroundColor: '#E8F7FF',
  },
  mediaActionIconAlbum: {
    backgroundColor: '#F1ECFF',
  },
  mediaActionLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  mediaHelpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  mediaHelpText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  inputWrapper: {
    marginBottom: 18,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  inputCounter: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E1E7F0',
  },
  input: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
    lineHeight: 21,
  },
  memoInputContainer: {
    minHeight: 104,
  },
  memoInput: {
    minHeight: 104,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingTop: 16,
  },
  categoryPill: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 21,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E5EAF2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPillSelected: {
    backgroundColor: '#F8FBFF',
    borderColor: '#4F6AF2',
  },
  categoryPillText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  categoryPillTextSelected: {
    color: '#1D4ED8',
  },
  customCategoryButton: {
    borderStyle: 'dashed',
  },
  addCategoryButton: {
    borderStyle: 'dashed',
    borderColor: '#D8E0F5',
    backgroundColor: '#FBFCFF',
  },
  addCategoryText: {
    color: '#4F6AF2',
    fontSize: 14,
    fontWeight: '800',
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
