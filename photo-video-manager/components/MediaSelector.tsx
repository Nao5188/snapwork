import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  FlatList,
  Alert,
  Modal,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

const { width } = Dimensions.get('window');
const itemSize = (width - 48) / 3; // 3列表示、左右のpadding考慮

interface MediaAsset {
  id: string;
  filename: string;
  uri: string;
  mediaType: 'photo' | 'video';
  creationTime: number;
  duration?: number;
}

interface MediaSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectMedia: (selectedMedia: MediaAsset[]) => void;
  maxSelections?: number;
  initialSelected?: MediaAsset[];
}

export default function MediaSelector({ 
  visible, 
  onClose, 
  onSelectMedia, 
  maxSelections = 5,
  initialSelected = []
}: MediaSelectorProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    new Set(initialSelected.map(item => item.id))
  );
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  React.useEffect(() => {
    if (visible) {
      loadMediaLibrary();
    }
  }, [visible]);

  const loadMediaLibrary = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');

      if (status !== 'granted') {
        Alert.alert('権限エラー', 'メディアライブラリへのアクセス権限が必要です。');
        return;
      }

      setLoading(true);
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        sortBy: MediaLibrary.SortBy.creationTime,
        first: 100,
      });

      const formattedAssets: MediaAsset[] = media.assets.map((asset) => ({
        id: asset.id,
        filename: asset.filename,
        uri: asset.uri,
        mediaType: asset.mediaType,
        creationTime: asset.creationTime,
        duration: asset.duration,
      }));

      setAssets(formattedAssets);
    } catch (error) {
      console.error('Error loading media library:', error);
      Alert.alert('エラー', 'メディアの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (assetId: string) => {
    const newSelected = new Set(selectedItems);
    
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      if (newSelected.size >= maxSelections) {
        Alert.alert(
          '選択上限',
          `最大${maxSelections}個まで選択できます。`,
          [{ text: 'OK' }]
        );
        return;
      }
      newSelected.add(assetId);
    }
    
    setSelectedItems(newSelected);
  };

  const handleConfirm = () => {
    const selectedAssets = assets.filter(asset => selectedItems.has(asset.id));
    onSelectMedia(selectedAssets);
    onClose();
  };

  const handleCancel = () => {
    setSelectedItems(new Set(initialSelected.map(item => item.id)));
    onClose();
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        
        // メディアライブラリに保存
        await MediaLibrary.saveToLibraryAsync(asset.uri);
        
        // 新しいアセットとして追加
        const newAsset: MediaAsset = {
          id: `new_${Date.now()}`,
          filename: asset.fileName || `photo_${Date.now()}.jpg`,
          uri: asset.uri,
          mediaType: asset.type === 'video' ? 'video' : 'photo',
          creationTime: Date.now(),
          duration: asset.duration,
        };

        setAssets(prev => [newAsset, ...prev]);
        
        // 自動選択
        if (selectedItems.size < maxSelections) {
          setSelectedItems(prev => new Set([...Array.from(prev), newAsset.id]));
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('エラー', '撮影に失敗しました。');
    }
  };

  const renderAssetItem = ({ item }: { item: MediaAsset }) => {
    const isSelected = selectedItems.has(item.id);
    const selectionOrder = Array.from(selectedItems).indexOf(item.id) + 1;

    return (
      <TouchableOpacity 
        style={[styles.assetItem, isSelected && styles.selectedAsset]}
        onPress={() => toggleSelection(item.id)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.assetImage}
          contentFit="cover"
        />
        
        {/* Video indicator */}
        {item.mediaType === 'video' && (
          <View style={styles.videoIndicator}>
            <Ionicons name="play" size={12} color="white" />
            {item.duration && (
              <Text style={styles.durationText}>
                {Math.floor(item.duration / 60)}:{(item.duration % 60).toFixed(0).padStart(2, '0')}
              </Text>
            )}
          </View>
        )}
        
        {/* Selection indicator */}
        <View style={[styles.selectionIndicator, isSelected && styles.selectedIndicator]}>
          {isSelected && (
            <Text style={styles.selectionNumber}>{selectionOrder}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            メディア選択 ({selectedItems.size}/{maxSelections})
          </Text>
          <TouchableOpacity 
            style={[styles.headerButton, selectedItems.size === 0 && styles.disabledButton]}
            onPress={handleConfirm}
            disabled={selectedItems.size === 0}
          >
            <Text style={[styles.confirmText, selectedItems.size === 0 && styles.disabledText]}>
              完了
            </Text>
          </TouchableOpacity>
        </View>

        {/* Camera button */}
        <View style={styles.cameraSection}>
          <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
            <Ionicons name="camera" size={32} color="#0095f6" />
            <Text style={styles.cameraButtonText}>撮影する</Text>
          </TouchableOpacity>
        </View>

        {/* Asset grid */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text>読み込み中...</Text>
          </View>
        ) : hasPermission === false ? (
          <View style={styles.permissionContainer}>
            <Ionicons name="images-outline" size={64} color="#ccc" />
            <Text style={styles.permissionText}>
              メディアライブラリへのアクセス権限が必要です
            </Text>
            <TouchableOpacity style={styles.permissionButton} onPress={loadMediaLibrary}>
              <Text style={styles.permissionButtonText}>権限を許可</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={assets}
            renderItem={renderAssetItem}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
  },
  cancelText: {
    fontSize: 16,
    color: '#262626',
  },
  confirmText: {
    fontSize: 16,
    color: '#0095f6',
    fontWeight: '600',
    textAlign: 'right',
  },
  disabledButton: {
    opacity: 0.3,
  },
  disabledText: {
    color: '#8e8e8e',
  },
  cameraSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#dbdbdb',
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  cameraButtonText: {
    fontSize: 16,
    color: '#0095f6',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
  gridContainer: {
    padding: 2,
  },
  assetItem: {
    width: itemSize,
    height: itemSize,
    margin: 1,
    position: 'relative',
  },
  selectedAsset: {
    borderWidth: 3,
    borderColor: '#0095f6',
    borderRadius: 4,
  },
  assetImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  durationText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '500',
  },
  selectionIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicator: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  selectionNumber: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});