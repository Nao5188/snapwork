import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { mediaLibraryService, authService } from '@/lib/supabase';

const { width } = Dimensions.get('window');
const numColumns = 3;
const itemSize = (width - 6) / numColumns;

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

  useEffect(() => {
    getPermissionsAndLoadAssets();
  }, []);

  const getPermissionsAndLoadAssets = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setHasPermission(status === 'granted');

    if (status === 'granted') {
      loadMediaAssets();
    } else {
      setLoading(false);
    }
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
      if (selectedItems.length < 5) {
        setSelectedItems(prev => [...prev, id]);
      } else {
        Alert.alert('選択制限', '最大5つまで選択できます。');
      }
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

    const selectedAssets = mediaAssets.filter(asset => selectedItems.includes(asset.id));
    const imageUris = selectedAssets.map(asset => asset.file_path).join(',');
    
    router.push(`/post/create?selectedMedia=${encodeURIComponent(imageUris)}`);
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
          // ファイル名を生成
          const now = new Date();
          const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
          const isVideo = asset.type === 'video';
          const filename = `imported_${isVideo ? 'video' : 'photo'}_${timestamp}.${isVideo ? 'mp4' : 'jpg'}`;

          // media_libraryテーブルに登録
          await mediaLibraryService.addMedia({
            user_id: user.id,
            filename: filename,
            file_path: asset.uri,
            file_size: asset.fileSize,
            mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
            is_video: isVideo,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
          });
        }

        // リストを再読み込み
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
              <Ionicons name="play" size={16} color="white" />
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
          <Text style={styles.loadingText}>ギャラリーの権限を確認中...</Text>
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
          >
            <Ionicons name="chevron-back" size={24} color="#262626" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ギャラリー</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="images-outline" size={64} color="#8e8e8e" />
          <Text style={styles.permissionText}>ギャラリーへのアクセスが必要です</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={getPermissionsAndLoadAssets}>
            <Text style={styles.permissionButtonText}>権限を許可</Text>
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
          >
            <Ionicons name="chevron-back" size={24} color="#262626" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>アルバム</Text>
        <View style={styles.headerRight}>
          {selectionMode ? (
            <TouchableOpacity style={styles.cancelButton} onPress={cancelSelection}>
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.addButton} onPress={addFromLibrary}>
                <Ionicons name="add" size={24} color="#0095f6" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.refreshButton} onPress={loadMediaAssets}>
                <Ionicons name="refresh" size={24} color="#262626" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      ) : mediaAssets.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="images-outline" size={64} color="#8e8e8e" />
          <Text style={styles.emptyText}>写真・動画がありません</Text>
          <Text style={styles.emptySubText}>カメラで写真を撮影してください</Text>
        </View>
      ) : (
        <>
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
            <TouchableOpacity style={styles.createPostButton} onPress={handleCreatePost}>
              <Text style={styles.createPostButtonText}>投稿作成</Text>
            </TouchableOpacity>
          </View>
        )}
      </>
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
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    minWidth: 100,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 100,
    alignItems: 'flex-end',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#f0f8ff',
  },
  refreshButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 44,
    height: 44,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    color: '#8e8e8e',
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#262626',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#0095f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: '#8e8e8e',
    textAlign: 'center',
    marginTop: 8,
  },
  gridContent: {
    paddingTop: 2,
    backgroundColor: '#ffffff',
  },
  row: {
    justifyContent: 'flex-start',
  },
  photoItem: {
    width: itemSize,
    height: itemSize,
    margin: 1,
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelButtonText: {
    color: '#0095f6',
    fontSize: 16,
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCircle: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  selectionNumber: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '500',
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
  },
  selectionCount: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  createPostButton: {
    backgroundColor: '#0095f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  createPostButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});