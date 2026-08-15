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
import { secureDraftStorage } from '@/lib/secureDraftStorage';
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

const DEFAULT_MENU_CATEGORIES = ['カット', 'カラー', 'パーマ', 'ブリーチ', '縮毛', 'トリートメント'];
const CUSTOM_CATEGORIES_KEY = 'custom_menu_categories';
const getStoreCustomCategoriesKey = (storeId: string) => `${CUSTOM_CATEGORIES_KEY}:${storeId}`;
const getLegacyStoreCustomCategoriesKey = (storeId: string) => `${CUSTOM_CATEGORIES_KEY}_${storeId}`;
const EDIT_POST_DRAFT_KEY_PREFIX = 'edit_post_media_draft';
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  カット: 'cut-outline',
  カラー: 'color-palette-outline',
  パーマ: 'water-outline',
  ブリーチ: 'sparkles-outline',
  縮毛: 'sparkles-outline',
  トリートメント: 'flask-outline',
};

interface MediaItem {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  fileName: string;
}

interface EditPostDraft {
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

const getEditPostDraftKey = (postId: string) => `${EDIT_POST_DRAFT_KEY_PREFIX}_${postId}`;

const normalizeCategory = (category: string) => category.trim().normalize('NFKC');

const parseStoredCategories = (value: string | null) => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(category => normalizeCategory(`${category}`)).filter(Boolean);
    }
  } catch {
    // Older values may be comma-separated plain text.
  }

  return value.split(',').map(category => normalizeCategory(category)).filter(Boolean);
};

const uniqueCategories = (categories: string[]) => {
  const seen = new Set<string>();
  return categories.filter(category => {
    const normalizedCategory = normalizeCategory(category);
    if (!normalizedCategory || seen.has(normalizedCategory)) return false;
    seen.add(normalizedCategory);
    return true;
  });
};

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
  selectedMedia?: string,
  mediaTypes?: string
): MediaItem[] => {
  if (!selectedMedia) return [];

  const timestamp = Date.now();
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

export default function EditPostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = getSearchParam(params.id);
  const { colors } = useAppTheme();

  const [formData, setFormData] = useState({
    title: '',
    memo: '',
  });

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const processedMediaParamsRef = useRef<string | null>(null);
  const initialRemoteMediaUrlsRef = useRef<string[]>([]);
  const initialMediaItemsRef = useRef<MediaItem[]>([]);

  useEffect(() => {
    checkAuthAndLoadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || initialLoading) return;

    const selectedMedia = getSearchParam(params.selectedMedia);
    const mediaTypes = getSearchParam(params.mediaTypes);
    const appendMedia = getSearchParam(params.appendMedia) === '1';

    if (!selectedMedia) return;

    const paramKey = [id, selectedMedia, mediaTypes, appendMedia ? 'append' : 'replace'].join('|');
    if (processedMediaParamsRef.current === paramKey) return;
    processedMediaParamsRef.current = paramKey;

    let cancelled = false;

    const hydrateMedia = async () => {
      let draftMediaItems: MediaItem[] | null = null;

      if (appendMedia) {
        try {
          const storedDraft = await secureDraftStorage.getItem(getEditPostDraftKey(id));
          if (storedDraft) {
            const draft = JSON.parse(storedDraft) as EditPostDraft;
            if (!cancelled) {
              setFormData(draft.formData);
              setSelectedCategories(draft.selectedCategories ?? []);
            }
            draftMediaItems = draft.mediaItems ?? [];
          }
        } catch (error) {
          console.error('Error restoring edit post draft:', error);
        }
      }

      const incomingItems = buildMediaItemsFromParams(selectedMedia, mediaTypes);
      if (incomingItems.length === 0 || cancelled) return;

      setMediaItems(prev => mergeMediaItems(appendMedia ? (draftMediaItems ?? prev) : [], incomingItems));

      if (appendMedia) {
        await secureDraftStorage.removeItem(getEditPostDraftKey(id)).catch((error) => {
          console.error('Error clearing edit post draft:', error);
        });
      }
    };

    hydrateMedia();

    return () => {
      cancelled = true;
    };
  }, [id, initialLoading, params.selectedMedia, params.mediaTypes, params.appendMedia]);

  const loadCustomCategories = async (storeId: string | null) => {
    try {
      if (!storeId) {
        setCustomCategories([]);
        return;
      }

      const [stored, legacyStored] = await Promise.all([
        AsyncStorage.getItem(getStoreCustomCategoriesKey(storeId)),
        AsyncStorage.getItem(getLegacyStoreCustomCategoriesKey(storeId)),
      ]);
      setCustomCategories(uniqueCategories([
        ...parseStoredCategories(stored),
        ...parseStoredCategories(legacyStored),
      ]));
    } catch (error) {
      console.error('Error loading custom categories:', error);
    }
  };

  const resolveActiveStoreId = async () => {
    if (activeStoreId) return activeStoreId;

    const { data: { user } } = await authService.getCurrentUser();
    if (!user) return null;

    const storeId = await storeService.getActiveStoreId(user.id);
    setActiveStoreId(storeId);
    if (storeId) await loadCustomCategories(storeId);
    return storeId;
  };

  const saveCustomCategory = async (category: string) => {
    try {
      const storeId = await resolveActiveStoreId();
      if (!storeId) {
        Alert.alert('エラー', '店舗情報を取得できませんでした。');
        return false;
      }

      const updated = uniqueCategories([...customCategories, category]);
      await AsyncStorage.setItem(getStoreCustomCategoriesKey(storeId), JSON.stringify(updated));
      setCustomCategories(updated);
      return true;
    } catch (error) {
      console.error('Error saving custom category:', error);
      Alert.alert('エラー', 'カテゴリの保存に失敗しました。');
      return false;
    }
  };

  const handleAddCategory = async () => {
    const trimmed = normalizeCategory(newCategoryName);
    if (!trimmed) {
      Alert.alert('エラー', 'カテゴリ名を入力してください。');
      return;
    }
    const allCategories = [...DEFAULT_MENU_CATEGORIES, ...customCategories].map(normalizeCategory);
    if (allCategories.includes(trimmed)) {
      Alert.alert('エラー', 'このカテゴリは既に存在します。');
      return;
    }
    const saved = await saveCustomCategory(trimmed);
    if (!saved) return;

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
              const storeId = await resolveActiveStoreId();
              if (!storeId) {
                Alert.alert('エラー', '店舗情報を取得できませんでした。');
                return;
              }

              const updated = customCategories.filter(c => normalizeCategory(c) !== normalizeCategory(category));
              await Promise.all([
                AsyncStorage.setItem(getStoreCustomCategoriesKey(storeId), JSON.stringify(updated)),
                AsyncStorage.setItem(getLegacyStoreCustomCategoriesKey(storeId), JSON.stringify(updated)),
              ]);
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

      const postStoreId = postWithMedia.store_id ?? null;
      if (postStoreId) {
        setActiveStoreId(postStoreId);
        await loadCustomCategories(postStoreId);
      } else {
        await resolveActiveStoreId();
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
        memo: menuName,
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
      initialMediaItemsRef.current = mediaItems;
      initialRemoteMediaUrlsRef.current = mediaItems
        .map(item => item.uri)
        .filter(uri => uri.startsWith('https://') || uri.startsWith('http://'));
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

  const persistDraftForMediaSelection = async () => {
    if (!id) return;

    const draft: EditPostDraft = {
      formData,
      selectedCategories,
      mediaItems,
    };

    try {
      await secureDraftStorage.setItem(getEditPostDraftKey(id), JSON.stringify(draft));
    } catch (error) {
      console.error('Error saving edit post draft:', error);
    }
  };

  const getMediaPickerParams = () => ({
    returnToEdit: '1',
    editPostId: String(id),
    appendMedia: '1',
    existingMediaCount: String(mediaItems.length),
  });

  const selectMediaFromLibrary = async () => {
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
    if (!id) return;

    if (mediaItems.length >= 5) {
      Alert.alert('追加できません', 'メディアは最大5件まで追加できます。');
      return;
    }

    await persistDraftForMediaSelection();
    router.replace({
      pathname: '/(tabs)',
      params: getMediaPickerParams(),
    } as any);
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
    const newlyUploadedUrls: string[] = [];
    let mediaRowsUpdated = false;
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
            const uploadedUrl = await fileStorageService.uploadPostImage(
              user.id,
              item.uri,
              id as string,
              item.type
            );
            newlyUploadedUrls.push(uploadedUrl);
            return { ...item, uri: uploadedUrl };
          }
          return item;
        })
      );

      const menuNameWithCategories = buildPostMenuName(formData.memo, selectedCategories);

      const postMediaItems = uploadedMediaItems.map((item, index) => ({
        media_url: item.uri,
        is_video: item.type === 'video',
        display_order: index,
      }));

      const savedMediaItems = await postService.setPostMedia(id as string, postMediaItems);
      if (savedMediaItems.length !== postMediaItems.length) {
        throw new Error('メディア情報の更新に失敗しました。');
      }
      mediaRowsUpdated = true;

      await postService.updatePost(id as string, {
        title: formData.title || '無題',
        menu_name: menuNameWithCategories,
        media_url: uploadedMediaItems.length > 0 ? uploadedMediaItems[0].uri : '',
        is_video: uploadedMediaItems.length > 0 ? uploadedMediaItems[0].type === 'video' : false,
      });

      const finalRemoteUrls = new Set(uploadedMediaItems.map(item => item.uri));
      const removedMediaUrls = initialRemoteMediaUrlsRef.current.filter(url => !finalRemoteUrls.has(url));
      await fileStorageService.deletePostMedia(removedMediaUrls).catch((storageError) => {
        console.warn('Post updated, but removed Storage files could not be deleted:', storageError);
      });
      initialRemoteMediaUrlsRef.current = [...finalRemoteUrls];

      Alert.alert(
        '更新完了',
        '投稿が正常に更新されました。',
        [{
          text: 'OK',
          onPress: async () => {
            if (id) {
              await secureDraftStorage.removeItem(getEditPostDraftKey(id)).catch(() => {});
            }
            router.back();
          },
        }]
      );
    } catch (error) {
      console.error('Error updating post:', error);

      const originalMediaItems = initialMediaItemsRef.current.map((item, index) => ({
        media_url: item.uri,
        is_video: item.type === 'video',
        display_order: index,
      }));
      let restored = !mediaRowsUpdated;

      if (id && originalMediaItems.length > 0) {
        const restoredItems = await postService.setPostMedia(id, originalMediaItems).catch(() => []);
        restored = restoredItems.length === originalMediaItems.length;
      }

      if (restored) {
        await fileStorageService.deletePostMedia(newlyUploadedUrls).catch(() => {});
      }

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
        <Ionicons name={icon} size={24} color="#2196F3" />
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
        <Ionicons name={icon} size={18} color={selected ? '#2196F3' : '#111827'} />
        <Text style={[styles.categoryPillText, selected && styles.categoryPillTextSelected]}>
          {category}
        </Text>
      </TouchableOpacity>
    );
  };

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
          <Text style={[styles.headerTitle, { color: colors.text }]}>投稿を編集</Text>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.86}
            accessibilityLabel={loading ? '更新中' : '投稿を更新する'}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={gradients.salonBlue}
              style={styles.submitGradient}
            >
              <Text style={styles.submitButtonText}>{loading ? '更新中...' : '更新'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Animated.ScrollView
          style={[styles.content, { opacity: fadeAnim }]}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Media Section */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleGroup}>
                <View style={styles.sectionIconBox}>
                  <Ionicons name="image-outline" size={22} color="#2196F3" />
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
                    {renderMediaActionTile('camera-outline', '撮影', takePhoto, 'photo')}
                    {renderMediaActionTile('albums-outline', 'アルバム', selectMediaFromLibrary, 'album')}
                  </View>
                ) : null
              }
            />
            <View style={styles.mediaHelpRow}>
              <Ionicons name="sparkles-outline" size={16} color="#2196F3" />
              <Text style={[styles.mediaHelpText, { color: colors.textSecondary }]}>
                最大5枚まで編集できます（写真・動画どちらも可）
              </Text>
            </View>
          </View>

          {/* Post Form */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={[styles.sectionTitleGroup, styles.formTitleGroup]}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="document-text-outline" size={22} color="#2196F3" />
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
                  <Ionicons name="add" size={19} color="#2196F3" />
                  <Text style={styles.addCategoryText}>カテゴリを追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Delete Button */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="この投稿を削除"
            >
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
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
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={() => {
                    setNewCategoryName('');
                    setShowAddCategoryModal(false);
                  }}
                  activeOpacity={0.82}
                >
                  <Text style={styles.modalCancelText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalAddButton]}
                  onPress={handleAddCategory}
                  activeOpacity={0.82}
                >
                  <Text style={styles.modalAddText}>追加</Text>
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
    shadowColor: '#2196F3',
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
    borderColor: '#2196F3',
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
    color: '#2196F3',
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
  inputContainerFocused: {
    backgroundColor: '#fff',
    borderColor: '#2196F3',
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
    borderColor: '#2196F3',
  },
  categoryPillText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  categoryPillTextSelected: {
    color: '#2196F3',
  },
  customCategoryButton: {
    borderStyle: 'dashed',
  },
  addCategoryButton: {
    borderStyle: 'dashed',
    borderColor: '#2196F3',
    backgroundColor: '#FBFCFF',
  },
  addCategoryText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteButton: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
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
    minHeight: 46,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#F1F5F9',
  },
  modalAddButton: {
    backgroundColor: '#2196F3',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '800',
  },
  modalAddText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
