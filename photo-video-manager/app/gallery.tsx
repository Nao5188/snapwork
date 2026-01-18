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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { mediaLibraryService, authService } from '@/lib/supabase';

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

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const getPermissionsAndLoadAssets = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setHasPermission(status === 'granted');

    if (status === 'granted') {
      loadMediaAssets();
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
  }, []);

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
    } catch (error) {
      console.error('Error loading media assets:', error);
      Alert.alert('エラー', 'メディアファイルの読み込みに失敗しました。');
      setMediaAssets([]);
    } finally {
      setLoading(false);
    }
  };

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
              router.push(`/post/create?selectedMedia=${encodeURIComponent(imageUris)}`);
            },
          },
        ]
      );
      return;
    }

    const selectedAssets = mediaAssets.filter(asset => selectedItems.includes(asset.id));
    const imageUris = selectedAssets.map(asset => asset.file_path).join(',');

    router.push(`/post/create?selectedMedia=${encodeURIComponent(imageUris)}`);
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
        quality: 0.8,
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
          const filename = `imported_${isVideo ? 'video' : 'photo'}_${timestamp}.${isVideo ? 'mp4' : 'jpg'}`;

          await mediaLibraryService.addMedia({
            user_id: user.id,
            filename: filename,
            file_path: asset.uri,
            file_size: asset.fileSize,
            mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
            is_video: isVideo,
            duration: asset.duration || undefined,
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
            <Image
              source={{ uri: item.file_path }}
              style={styles.photoImage}
              contentFit="cover"
            />
            <View style={styles.videoIndicator}>
              <Ionicons name="play" size={14} color="white" />
              {item.duration && (
                <Text style={styles.durationText}>
                  {Math.floor(item.duration / 60)}:{(item.duration % 60).toFixed(0).padStart(2, '0')}
                </Text>
              )}
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
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <View style={styles.loadingIcon}>
            <Ionicons name="images-outline" size={32} color="#bbb" />
          </View>
          <Text style={styles.loadingText}>権限を確認中...</Text>
        </View>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>アルバム</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContent}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="images-outline" size={48} color="#bbb" />
          </View>
          <Text style={styles.emptyTitle}>アクセス許可が必要です</Text>
          <Text style={styles.emptySubtitle}>
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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
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
                <Ionicons name="add" size={22} color="#1a1a1a" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.refreshButton} onPress={loadMediaAssets} activeOpacity={0.7}>
                <Ionicons name="sync-outline" size={22} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <View style={styles.loadingIcon}>
            <Ionicons name="images-outline" size={32} color="#bbb" />
          </View>
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      ) : mediaAssets.length === 0 ? (
        <View style={styles.centerContent}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="camera-outline" size={48} color="#bbb" />
          </View>
          <Text style={styles.emptyTitle}>写真・動画がありません</Text>
          <Text style={styles.emptySubtitle}>カメラで撮影して追加しましょう</Text>
        </View>
      ) : (
        <Animated.View style={[styles.gridContainer, { opacity: fadeAnim }]}>
          <FlatList
            data={mediaAssets}
            renderItem={renderMediaItem}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
          />

          {selectionMode && selectedItems.length > 0 && (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionCount}>
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
    fontWeight: '600',
    color: '#1a1a1a',
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
    backgroundColor: '#f5f5f5',
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
    textAlign: 'center',
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
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
    backgroundColor: '#fff',
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
  },
  photoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedItem: {
    opacity: 0.85,
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
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCircle: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  selectionCount: {
    color: '#1a1a1a',
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
    borderRadius: 10,
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
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
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
