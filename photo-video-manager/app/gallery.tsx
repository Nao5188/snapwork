import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  Dimensions,
  Alert,
  Platform,
  StatusBar,
  Animated,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { mediaLibraryService, authService } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import { createLocalMediaThumbnail, type MediaType } from '@/lib/mediaThumbnails';

const { width } = Dimensions.get('window');
const numColumns = 3;
const itemSize = (width - 4) / numColumns;
const MEDIA_DIRECTORY = `${FileSystem.documentDirectory}media/`;
const THUMBNAIL_DIRECTORY = `${MEDIA_DIRECTORY}thumbnails/`;
const IMPORTED_PHOTO_MAX_WIDTH = 2400;
const IMPORTED_PHOTO_QUALITY = 0.9;

interface MediaAsset {
  id: string;
  user_id: string;
  filename: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  is_video: boolean;
  duration?: number;
  width?: number;
  height?: number;
  created_at: string;
}

const getSearchParam = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value[0] : value
);

const getTimestamp = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}-${now.getMilliseconds().toString().padStart(3, '0')}`;
};

const getFileExtension = (value?: string | null) => {
  if (!value) return null;

  const cleanValue = value.split('?')[0].split('#')[0];
  const filename = cleanValue.split('/').pop() ?? '';
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === filename.length - 1) return null;

  return filename.slice(dotIndex + 1).toLowerCase();
};

const getFileBaseName = (filename: string) => {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
};

const getThumbnailPath = (filename: string) => (
  `${THUMBNAIL_DIRECTORY}${getFileBaseName(filename)}_thumb.jpg`
);

const normalizeLocalFileUri = (uri: string) => {
  const cleanUri = uri.split('#')[0];

  if (cleanUri.startsWith('file://')) return cleanUri;
  if (cleanUri.startsWith('/')) return `file://${cleanUri}`;

  return null;
};

const fileExists = async (uri: string) => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
};

const deleteLocalFileIfPresent = async (uri?: string | null) => {
  if (!uri?.startsWith('file://')) return;

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn('Failed to delete local media file:', error);
  }
};

export default function GalleryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { colors } = useAppTheme();
  const returnToCreate = getSearchParam(params.returnToCreate) === '1';
  const returnToEdit = getSearchParam(params.returnToEdit) === '1';
  const editPostId = getSearchParam(params.editPostId);
  const existingMediaCount = Math.min(
    5,
    Math.max(0, Number(getSearchParam(params.existingMediaCount) ?? 0) || 0)
  );
  const isAppendingMedia = returnToCreate || returnToEdit;
  const maxSelectableItems = isAppendingMedia ? Math.max(0, 5 - existingMediaCount) : 5;

  const cleanupMediaAssets = async (assets: MediaAsset[]) => {
    for (const asset of assets) {
      await mediaLibraryService.deleteMedia(asset.id);
      await deleteLocalFileIfPresent(normalizeLocalFileUri(asset.file_path));
      await deleteLocalFileIfPresent(getThumbnailPath(asset.filename));
    }
  };

  const ensureThumbnail = async (asset: MediaAsset) => {
    const sourceUri = normalizeLocalFileUri(asset.file_path);

    if (!sourceUri || !(await fileExists(sourceUri))) {
      return null;
    }

    const thumbnailPath = getThumbnailPath(asset.filename);
    if (await fileExists(thumbnailPath)) {
      return thumbnailPath;
    }

    try {
      await FileSystem.makeDirectoryAsync(THUMBNAIL_DIRECTORY, { intermediates: true });
      const mediaType: MediaType = asset.is_video ? 'video' : 'photo';
      const generatedThumbnail = await createLocalMediaThumbnail(sourceUri, mediaType);
      await FileSystem.copyAsync({ from: generatedThumbnail, to: thumbnailPath });
      return thumbnailPath;
    } catch (error) {
      console.warn('Failed to generate gallery thumbnail:', error);
      return null;
    }
  };

  const filterDisplayableAssets = async (assets: MediaAsset[]) => {
    const displayableAssets: MediaAsset[] = [];
    const unreadableAssets: MediaAsset[] = [];
    const nextThumbnails: Record<string, string> = {};

    for (const asset of assets) {
      const thumbnailPath = await ensureThumbnail(asset);

      if (thumbnailPath) {
        displayableAssets.push(asset);
        nextThumbnails[asset.id] = thumbnailPath;
      } else {
        unreadableAssets.push(asset);
      }
    }

    if (unreadableAssets.length > 0) {
      await cleanupMediaAssets(unreadableAssets);
      console.log(`Removed ${unreadableAssets.length} unreadable media items from album`);
    }

    return { displayableAssets, nextThumbnails };
  };

  const loadMediaAssets = async () => {
    try {
      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        console.log('ユーザーがログインしていません');
        setMediaAssets([]);
        setLoading(false);
        return;
      }

      const mediaData = await mediaLibraryService.getUserMedia(user.id);
      const { displayableAssets, nextThumbnails } = await filterDisplayableAssets(mediaData || []);
      setThumbnails(nextThumbnails);
      setMediaAssets(displayableAssets);
    } catch (error) {
      console.error('Error loading media assets:', error);
      Alert.alert('エラー', 'メディアファイルの読み込みに失敗しました。');
      setMediaAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const getPermissionsAndLoadAssets = async () => {
    setHasPermission(true);
    await loadMediaAssets();
  };

  useEffect(() => {
    getPermissionsAndLoadAssets();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelection = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(prev => prev.filter(itemId => itemId !== id));
    } else {
      setSelectedItems(prev => [...prev, id]);
    }
  };

  const handleItemPress = (item: MediaAsset) => {
    if (selectionMode) {
      toggleSelection(item.id);
    } else {
      setSelectionMode(true);
      setSelectedItems([item.id]);
    }
  };

  const navigateToCreateWithMedia = (selectedAssets: MediaAsset[]) => {
    const selectedMedia = selectedAssets.map(asset => asset.file_path).join(',');
    const mediaTypes = selectedAssets.map(asset => asset.is_video ? 'video' : 'photo').join(',');
    const createParams: Record<string, string> = {
      selectedMedia,
      mediaTypes,
    };

    if (isAppendingMedia) {
      createParams.appendMedia = '1';
    }

    if (returnToEdit && editPostId) {
      router.replace({
        pathname: '/post/edit/[id]',
        params: {
          id: editPostId,
          ...createParams,
        },
      } as any);
      return;
    }

    router.push({
      pathname: '/post/create',
      params: createParams,
    } as any);
  };

  const getSelectedAssetsInOrder = (ids: string[]) => (
    ids
      .map(id => mediaAssets.find(asset => asset.id === id))
      .filter((asset): asset is MediaAsset => Boolean(asset))
  );

  const deleteMediaAssets = async (assets: MediaAsset[]) => {
    await cleanupMediaAssets(assets);
    await loadMediaAssets();
  };

  const handleCreatePost = () => {
    if (selectedItems.length === 0) {
      Alert.alert('選択エラー', '投稿するメディアを選択してください。');
      return;
    }

    if (maxSelectableItems <= 0) {
      Alert.alert('追加できません', 'メディアは最大5件まで追加できます。');
      return;
    }

    if (selectedItems.length > maxSelectableItems) {
      Alert.alert(
        '選択制限',
        isAppendingMedia
          ? `追加できるのはあと${maxSelectableItems}件までです。\n現在${selectedItems.length}件選択されています。`
          : `投稿作成では最大5枚まで選択できます。\n現在${selectedItems.length}枚選択されています。`,
        [
          {
            text: 'キャンセル',
            style: 'cancel',
          },
          {
            text: `最初の${maxSelectableItems}件で${isAppendingMedia ? '追加' : '投稿'}`,
            onPress: () => {
              const targetItems = selectedItems.slice(0, maxSelectableItems);
              const selectedAssets = getSelectedAssetsInOrder(targetItems);
              navigateToCreateWithMedia(selectedAssets);
            },
          },
        ]
      );
      return;
    }

    const selectedAssets = getSelectedAssetsInOrder(selectedItems);
    navigateToCreateWithMedia(selectedAssets);
  };

  const handleDeleteMedia = async () => {
    if (selectedItems.length === 0) {
      Alert.alert('選択エラー', '削除するメディアを選択してください。');
      return;
    }

    Alert.alert(
      '削除確認',
      `選択した${selectedItems.length}個のメディアを削除しますか？\nこの操作は取り消せません。`,
      [
        {
          text: 'キャンセル',
          style: 'cancel',
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              const selectedAssets = getSelectedAssetsInOrder(selectedItems);
              await deleteMediaAssets(selectedAssets);

              setSelectedItems([]);
              setSelectionMode(false);

              Alert.alert('削除完了', `${selectedItems.length}個のメディアを削除しました。`);
            } catch (error) {
              console.error('Error deleting media:', error);
              Alert.alert('エラー', 'メディアの削除に失敗しました。');
            }
          },
        },
      ]
    );
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedItems([]);
  };

  const createImportedMedia = async (asset: ImagePicker.ImagePickerAsset, index: number) => {
    const isVideo = asset.type === 'video';
    const timestamp = `${getTimestamp()}-${String(index).padStart(2, '0')}`;
    const sourceExtension = getFileExtension(asset.fileName) ?? getFileExtension(asset.uri);
    const videoExtension = sourceExtension ?? (Platform.OS === 'ios' ? 'mov' : 'mp4');
    const extension = isVideo ? videoExtension : 'jpg';
    const filename = `imported_${isVideo ? 'video' : 'photo'}_${timestamp}.${extension}`;
    const persistentUri = `${MEDIA_DIRECTORY}${filename}`;

    await FileSystem.makeDirectoryAsync(MEDIA_DIRECTORY, { intermediates: true });
    await FileSystem.makeDirectoryAsync(THUMBNAIL_DIRECTORY, { intermediates: true });

    let importedWidth = asset.width;
    let importedHeight = asset.height;

    if (isVideo) {
      await FileSystem.copyAsync({ from: asset.uri, to: persistentUri });
    } else {
      const resizeActions = asset.width && asset.width > IMPORTED_PHOTO_MAX_WIDTH
        ? [{ resize: { width: IMPORTED_PHOTO_MAX_WIDTH } }]
        : [];
      const optimized = await manipulateAsync(asset.uri, resizeActions, {
        compress: IMPORTED_PHOTO_QUALITY,
        format: SaveFormat.JPEG,
      });

      importedWidth = optimized.width;
      importedHeight = optimized.height;
      await FileSystem.copyAsync({ from: optimized.uri, to: persistentUri });
    }

    const thumbnailPath = getThumbnailPath(filename);
    try {
      const thumbnailUri = await createLocalMediaThumbnail(
        persistentUri,
        isVideo ? 'video' : 'photo'
      );
      await FileSystem.copyAsync({ from: thumbnailUri, to: thumbnailPath });
    } catch (error) {
      console.warn('Failed to create imported media thumbnail:', error);
    }

    const fileInfo = await FileSystem.getInfoAsync(persistentUri);
    const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : asset.fileSize;

    return {
      filename,
      persistentUri,
      thumbnailPath,
      fileSize,
      mimeType: isVideo ? (asset.mimeType ?? 'video/mp4') : 'image/jpeg',
      isVideo,
      duration: asset.duration ? Math.round(asset.duration / 1000) : undefined,
      width: importedWidth,
      height: importedHeight,
    };
  };

  const addFromLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'アクセス許可が必要です',
          '端末の写真を追加するには写真ライブラリへのアクセスを許可してください。',
          [
            { text: 'キャンセル', style: 'cancel' },
            { text: '設定を開く', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 1.0,
      });

      if (!result.canceled && result.assets) {
        const { data: { user } } = await authService.getCurrentUser();

        if (!user) {
          Alert.alert('エラー', 'ログインが必要です。');
          return;
        }

        for (const [index, asset] of result.assets.entries()) {
          const importedMedia = await createImportedMedia(asset, index);

          await mediaLibraryService.addMedia({
            user_id: user.id,
            filename: importedMedia.filename,
            file_path: importedMedia.persistentUri,
            file_size: importedMedia.fileSize,
            mime_type: importedMedia.mimeType,
            is_video: importedMedia.isVideo,
            duration: importedMedia.duration,
            width: importedMedia.width,
            height: importedMedia.height,
          });
        }

        await loadMediaAssets();

        Alert.alert('追加完了', `${result.assets.length}個のメディアをアルバムに追加しました。`);
      }
    } catch (error) {
      console.error('Error adding media from library:', error);
      Alert.alert('エラー', 'メディアの追加に失敗しました。');
    }
  };

  const handleMediaRenderError = async (asset: MediaAsset) => {
    console.warn('Removing media that failed to render:', asset.id);

    try {
      await cleanupMediaAssets([asset]);
      setMediaAssets(prev => prev.filter(item => item.id !== asset.id));
      setSelectedItems(prev => prev.filter(id => id !== asset.id));
      setThumbnails(prev => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
    } catch (error) {
      console.error('Error removing media after render failure:', error);
    }
  };

  const renderMediaItem = ({ item }: { item: MediaAsset }) => {
    const isSelected = selectedItems.includes(item.id);
    const selectionIndex = selectedItems.indexOf(item.id);
    const thumbnailUri = thumbnails[item.id];

    const renderThumbnailFallback = () => (
      <View style={styles.thumbnailPlaceholder}>
        <Ionicons
          name={item.is_video ? 'videocam-outline' : 'image-outline'}
          size={28}
          color="#aaa"
        />
      </View>
    );

    return (
      <TouchableOpacity
        style={[styles.photoItem, isSelected && styles.selectedItem]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.9}
      >
        {item.is_video ? (
          <>
            {thumbnailUri ? (
              <Image
                source={{ uri: thumbnailUri }}
                style={styles.photoImage}
                contentFit="cover"
                recyclingKey={`gallery-video-${item.id}-${thumbnailUri}`}
                onError={() => void handleMediaRenderError(item)}
              />
            ) : (
              renderThumbnailFallback()
            )}
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={12} color="white" />
              {item.duration ? (
                <Text style={styles.durationText}>
                  {Math.floor((item.duration ?? 0) / 60)}:{((item.duration ?? 0) % 60).toFixed(0).padStart(2, '0')}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={styles.photoImage}
              contentFit="cover"
              recyclingKey={`gallery-photo-${item.id}-${thumbnailUri}`}
              onError={() => void handleMediaRenderError(item)}
            />
          ) : (
            renderThumbnailFallback()
          )
        )}

        {selectionMode && (
          <View style={styles.selectionOverlay}>
            <View style={[styles.selectionCircle, isSelected && styles.selectedCircle]}>
              {isSelected && (
                <Text style={styles.selectionNumber}>{selectionIndex + 1}</Text>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (hasPermission === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.centerContent, { backgroundColor: colors.background }]}>
          <View style={[styles.loadingIcon, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="images-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>権限を確認中...</Text>
        </View>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>アルバム</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.centerContent, { backgroundColor: colors.background }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="images-outline" size={48} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>アクセス許可が必要です</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            写真・動画を表示するには{'\n'}ギャラリーへのアクセスを許可してください
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={getPermissionsAndLoadAssets}
            activeOpacity={0.8}
          >
            <Text style={styles.permissionButtonText}>許可する</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>アルバム</Text>
        <View style={styles.headerRight}>
          {selectionMode ? (
            <TouchableOpacity style={styles.cancelButton} onPress={cancelSelection} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.addButton} onPress={addFromLibrary} activeOpacity={0.7}>
                <Ionicons name="add" size={22} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.refreshButton} onPress={loadMediaAssets} activeOpacity={0.7}>
                <Ionicons name="sync-outline" size={22} color="white" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={[styles.centerContent, { backgroundColor: colors.background }]}>
          <View style={[styles.loadingIcon, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="images-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>読み込み中...</Text>
        </View>
      ) : mediaAssets.length === 0 ? (
        <View style={[styles.centerContent, { backgroundColor: colors.background }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>写真・動画がありません</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>カメラで撮影して追加しましょう</Text>
        </View>
      ) : (
        <Animated.View style={[styles.gridContainer, { opacity: fadeAnim }]}>
          <FlatList
            data={mediaAssets}
            renderItem={renderMediaItem}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            contentContainerStyle={[styles.gridContent, { backgroundColor: colors.background }]}
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
          />

          {selectionMode && selectedItems.length > 0 && (
            <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <Text style={[styles.selectionCount, { color: colors.text }]}>
                {selectedItems.length}個選択中
              </Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteMedia} activeOpacity={0.8}>
                  <Ionicons name="trash-outline" size={18} color="white" />
                  <Text style={styles.deleteButtonText}>削除</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.createPostButton} onPress={handleCreatePost} activeOpacity={0.8}>
                  <Text style={styles.createPostButtonText}>{isAppendingMedia ? '追加' : '投稿作成'}</Text>
                  <Ionicons name="arrow-forward" size={18} color="white" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </View>
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
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + 12,
    backgroundColor: '#444444',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    minWidth: 80,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
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
    textAlign: 'center',
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#444444',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  gridContainer: {
    flex: 1,
  },
  gridContent: {
    paddingTop: 2,
    backgroundColor: '#fafafa',
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'flex-start',
  },
  photoItem: {
    width: itemSize,
    height: itemSize,
    margin: 1,
    position: 'relative',
    backgroundColor: '#f5f5f5',
    borderRadius: 2,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedItem: {
    opacity: 0.8,
  },
  selectionOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCircle: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  selectionNumber: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '500',
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  selectionCount: {
    color: '#444444',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  createPostButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  createPostButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
