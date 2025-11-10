import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { authService } from '@/lib/supabase';

export default function CameraScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { data: { user } } = await authService.getCurrentUser();
      setIsAuthenticated(!!user);

      if (!user) {
        console.log('User not authenticated, redirecting to login');
        router.replace('/login');
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
      router.replace('/login');
    }
  };

  const takePhoto = async () => {
    try {
      // カメラ権限をリクエスト
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          '権限が必要です',
          'カメラを使用するには権限が必要です。設定から権限を有効にしてください。'
        );
        return;
      }

      // カメラを起動して撮影
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 60, // 最大60秒
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];

        // 投稿作成画面に撮影した画像/動画を渡して遷移
        router.push({
          pathname: '/post/create',
          params: {
            mediaUri: asset.uri,
            mediaType: asset.type || 'photo',
            fileName: asset.fileName || `media_${Date.now()}.jpg`,
          }
        });
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('エラー', '撮影に失敗しました。');
    }
  };

  const selectFromGallery = async () => {
    try {
      // メディアライブラリ権限をリクエスト
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          '権限が必要です',
          'ギャラリーにアクセスするには権限が必要です。設定から権限を有効にしてください。'
        );
        return;
      }

      // ギャラリーから選択
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        if (result.assets.length === 1) {
          // 1つだけ選択した場合
          const asset = result.assets[0];
          router.push({
            pathname: '/post/create',
            params: {
              mediaUri: asset.uri,
              mediaType: asset.type || 'photo',
              fileName: asset.fileName || `media_${Date.now()}.jpg`,
            }
          });
        } else {
          // 複数選択した場合はギャラリー画面へ
          router.push('/gallery');
        }
      }
    } catch (error) {
      console.error('Error selecting from gallery:', error);
      Alert.alert('エラー', 'ギャラリーからの選択に失敗しました。');
    }
  };

  const goToGallery = () => {
    router.push('/gallery');
  };

  if (isAuthenticated === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>認証中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>カメラ</Text>
        <Text style={styles.subtitle}>写真または動画を撮影して投稿</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="camera" size={120} color="#0095f6" />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={takePhoto}>
            <Ionicons name="camera" size={28} color="white" />
            <Text style={styles.primaryButtonText}>カメラで撮影</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={selectFromGallery}>
            <Ionicons name="images" size={28} color="#0095f6" />
            <Text style={styles.secondaryButtonText}>ギャラリーから選択</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tertiaryButton} onPress={goToGallery}>
            <Ionicons name="folder-open" size={24} color="#666" />
            <Text style={styles.tertiaryButtonText}>マイギャラリー</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <Ionicons name="information-circle" size={20} color="#666" />
            <Text style={styles.infoText}>複数選択はギャラリーから可能です（最大5枚）</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="videocam" size={20} color="#666" />
            <Text style={styles.infoText}>動画は最大60秒まで撮影できます</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#262626',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8e8e8e',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    marginBottom: 48,
    padding: 32,
    backgroundColor: '#e3f2fd',
    borderRadius: 100,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 400,
    gap: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0095f6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0095f6',
    gap: 12,
  },
  secondaryButtonText: {
    color: '#0095f6',
    fontSize: 18,
    fontWeight: 'bold',
  },
  tertiaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    gap: 8,
  },
  tertiaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    marginTop: 48,
    width: '100%',
    maxWidth: 400,
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 100,
  },
});
