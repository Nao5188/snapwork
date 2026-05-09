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
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { mediaLibraryService, authService } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';

const { width } = Dimensions.get('window');
const numColumns = 3;
const itemSize = (width - 4) / numColumns;

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

export default function GalleryScreen() {
  const router = useRouter();
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { colors } = useAppTheme();

  const generateThumbnails = async (assets: MediaAsset[]) => {
    const videoAssets = assets.filter(a => a.is_video);
    await Promise.allSettled(
      videoAssets.map(async (asset) => {
        const fileUri = asset.file_path.split('#')[0];

        // ph:// URIはexpo-imageがPhotosフレームワーク経由で直接表示できるためスキップ
        if (fileUri.startsWith('ph://')) return;

        // アプリサンドボックス内のfile://のみexpo-video-thumbnailsで処理
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(fileUri, {
            time: 1000,
            quality: 0.6,
          });
          setThumbnails(prev => ({ ...prev, [asset.id]: uri }));
        } catch {
          // サムネイル生成失敗時はフォールバック表示（アイコン表示）
        }
      })
    );
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
      setMediaAssets(mediaData || []);
      if (mediaData) {
        generateThumbnails(mediaData);
      }
    } catch (error) {
      console.error('Error loading media assets:', error);
      Alert.alert('エラー', 'メディアファイルの読み込みに失敗しました。');
      setMediaAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const getPermissionsAndLoadAssets = async () => {
    const result = await MediaLibrary.requestPermissionsAsync();
    // status === 'granted' または accessPrivileges が 'all'/'limited' の場合も許可済みとして扱う
    const granted = result.granted || result.accessPrivileges === 'limited';
    setHasPermission(granted);

    if (granted) {
      loadMediaAssets();
    } else if (!result.canAskAgain) {
      // 一度拒否されて再度ダイアログを出せない場合は設定アプリへ誘導
      Alert.alert(
        'アクセス許可が必要です',
        '設定アプリからSnapWorkの写真アクセスを許可してください。',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '設定を開く', onPress: () => Linking.openSettings() },
        ]
      );
      setLoading(false);
    } else {
      setLoading(false);
    }
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

  const handleCreatePost = () => {
    if (selectedItems.length === 0) {
      Alert.alert('選択エラー', '投稿するメディアを選択してください。');
      return;
    }

    if (selectedItems.length > 5) {
      Alert.alert(
        '選択制限',
        `投稿作成では最大5枚まで選択できます。\n現在${selectedItems.length}枚選択されています。`,
        [
          {
            text: 'キャンセル',
            style: 'cancel',
          },
          {
            text: '最初の5枚で投稿',
            onPress: () => {
              const first5Items = selectedItems.slice(0, 5);
              const selectedAssets = mediaAssets.filter(asset => first5Items.includes(asset.id));
              const imageUris = selectedAssets.map(asset => asset.file_path).join(',');
              const mediaTypes = selectedAssets.map(asset => asset.is_video ? 'video' : 'photo').join(',');
              router.push(`/post/create?selectedMedia=${encodeURIComponent(imageUris)}&mediaTypes=${mediaTypes}`);
            },
          },
        ]
      );
      return;
    }

    const selectedAssets = mediaAssets.filter(asset => selectedItems.includes(asset.id));
    const imageUris = selectedAssets.map(asset => asset.file_path).join(',');
    const mediaTypes = selectedAssets.map(asset => asset.is_video ? 'video' : 'photo').join(',');

    router.push(`/post/create?selectedMedia=${encodeURIComponent(imageUris)}&mediaTypes=${mediaTypes}`);
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
              for (const mediaId of selectedItems) {
                await mediaLibraryService.deleteMedia(mediaId);
              }

              await loadMediaAssets();

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

  const addFromLibrary = async () => {
    try {
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

        for (const asset of result.assets) {
          const now = new Date();
          const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
          const isVideo = asset.type === 'video';
          const ext = isVideo ? 'mov' : 'jpg';
          const filename = `imported_${isVideo ? 'video' : 'photo'}_${timestamp}.${ext}`;

          // Documentsディレクトリにコピー（fetch/サムネイル生成が常にアクセス可能）
          const destDir = `${FileSystem.documentDirectory}media/`;
          await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
          const persistentUri = `${destDir}${filename}`;
          await FileSystem.copyAsync({ from: asset.uri, to: persistentUri });

          await mediaLibraryService.addMedia({
            user_id: user.id,
            filename: filename,
            file_path: persistentUri,
            file_size: asset.fileSize,
            mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
            is_video: isVideo,
            duration: asset.duration ? Math.round(asset.duration / 1000) : undefined,
            width: asset.width,
            height: asset.height,
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

  const renderMediaItem = ({ item }: { item: MediaAsset }) => {
    const isSelected = selectedItems.includes(item.id);
    const selectionIndex = selectedItems.indexOf(item.id);

    return (
      <TouchableOpacity
        style={[styles.photoItem, isSelected && styles.selectedItem]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.9}
      >
        {item.is_video ? (
          <>
            {item.file_path.startsWith('ph://') ? (
              // ph:// URIはexpo-imageがPhotosフレームワーク経由でサムネイルを自動生成
              <Image
                source={{ uri: item.file_path.split('#')[0] }}
                style={styles.photoImage}
                contentFit="cover"
              />
            ) : thumbnails[item.id] ? (
              <Image
                source={{ uri: thumbnails[item.id] }}
                style={styles.photoImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <Ionicons name="videocam-outline" size={28} color="#aaa" />
              </View>
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
          <Image
            source={{ uri: item.file_path }}
            style={styles.photoImage}
            contentFit="cover"
          />
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
                  <Text style={styles.createPostButtonText}>投稿作成</Text>
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
    backgroundColor: '#444444',
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
    backgroundColor: '#444444',
    borderColor: '#444444',
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
    backgroundColor: '#FF3B30',
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
    backgroundColor: '#444444',
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
