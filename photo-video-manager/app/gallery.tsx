import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  Dimensions,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const numColumns = 3;
const itemSize = (width - 6) / numColumns;

interface PostedPhoto {
  id: string;
  filename: string;
  uri: string;
  title: string;
  menuName: string;
  creationTime: number;
  postedAt: Date;
}

export default function GalleryScreen() {
  const router = useRouter();
  const [postedPhotos, setPostedPhotos] = useState<PostedPhoto[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPermissionsAndLoadAssets();
  }, []);

  const getPermissionsAndLoadAssets = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setHasPermission(status === 'granted');

    if (status === 'granted') {
      loadPostedPhotos();
    } else {
      setLoading(false);
    }
  };

  const loadPostedPhotos = async () => {
    try {
      // TODO: Supabaseから投稿済み写真を取得
      // 現在はダミーデータ
      const dummyPostedPhotos: PostedPhoto[] = [
        {
          id: '1',
          filename: 'pasta_photo.jpg',
          uri: 'https://via.placeholder.com/400x400/FFB6C1/000000?text=Pasta',
          title: '本日のパスタ',
          menuName: 'カルボナーラ',
          creationTime: new Date('2024-01-15').getTime(),
          postedAt: new Date('2024-01-15T10:30:00'),
        },
        {
          id: '2',
          filename: 'dessert_photo.jpg',
          uri: 'https://via.placeholder.com/400x400/98FB98/000000?text=Dessert',
          title: 'デザート',
          menuName: 'ティラミス',
          creationTime: new Date('2024-01-14').getTime(),
          postedAt: new Date('2024-01-14T15:20:00'),
        },
        {
          id: '3',
          filename: 'soup_photo.jpg',
          uri: 'https://via.placeholder.com/400x400/DDA0DD/000000?text=Soup',
          title: 'スープ',
          menuName: 'コーンスープ',
          creationTime: new Date('2024-01-12').getTime(),
          postedAt: new Date('2024-01-12T12:00:00'),
        },
        {
          id: '4',
          filename: 'steak_photo.jpg',
          uri: 'https://via.placeholder.com/400x400/F0E68C/000000?text=Steak',
          title: 'メイン',
          menuName: 'ステーキ',
          creationTime: new Date('2024-01-11').getTime(),
          postedAt: new Date('2024-01-11T19:00:00'),
        },
        {
          id: '5',
          filename: 'coffee_photo.jpg',
          uri: 'https://via.placeholder.com/400x400/D2691E/000000?text=Coffee',
          title: 'ドリンク',
          menuName: 'コーヒー',
          creationTime: new Date('2024-01-10').getTime(),
          postedAt: new Date('2024-01-10T14:30:00'),
        },
      ];

      setPostedPhotos(dummyPostedPhotos);
    } catch (error) {
      console.error('Error loading posted photos:', error);
      Alert.alert('エラー', '投稿写真の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const renderPhotoItem = ({ item }: { item: PostedPhoto }) => (
    <TouchableOpacity 
      style={styles.photoItem}
      onPress={() => Alert.alert('投稿詳細', `タイトル: ${item.title}\nメニュー: ${item.menuName}`)}
      activeOpacity={0.9}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.photoImage}
        contentFit="cover"
      />
      <View style={styles.photoOverlay}>
        <Text style={styles.photoTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.photoMenu} numberOfLines={1}>{item.menuName}</Text>
      </View>
    </TouchableOpacity>
  );

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>ギャラリーの権限を確認中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#262626" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>アルバム</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadPostedPhotos}>
          <Ionicons name="refresh" size={24} color="#262626" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      ) : postedPhotos.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="images-outline" size={64} color="#8e8e8e" />
          <Text style={styles.emptyText}>投稿した写真がありません</Text>
          <Text style={styles.emptySubText}>カメラで写真を撮影して投稿してください</Text>
        </View>
      ) : (
        <FlatList
          data={postedPhotos}
          renderItem={renderPhotoItem}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        />
      )}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
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
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoTitle: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  photoMenu: {
    color: 'white',
    fontSize: 8,
    opacity: 0.9,
  },
});