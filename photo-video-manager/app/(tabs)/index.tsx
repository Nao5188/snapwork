import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Text } from 'react-native';
import { Camera, CameraView, CameraType, FlashMode } from 'expo-camera';
import { Video } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { mediaLibraryService, authService } from '@/lib/supabase';

export default function CameraScreen() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'photo' | 'video'>('photo');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    getCameraPermissions();
  }, []);

  const getCameraPermissions = async () => {
    try {
      console.log('Platform check - requesting permissions...');
      console.log('Navigator.mediaDevices available:', !!navigator.mediaDevices);
      
      // Web環境での直接的な権限チェック
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        try {
          console.log('Attempting direct getUserMedia check...');
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
          });
          
          // ストリームを即座に停止
          stream.getTracks().forEach(track => track.stop());
          console.log('Direct getUserMedia successful - setting permission to true');
          setHasPermission(true);
          return;
        } catch (directError) {
          console.error('Direct getUserMedia failed:', directError);
        }
      }
      
      console.log('Falling back to Expo Camera API...');
      const cameraPermission = await Camera.requestCameraPermissionsAsync();
      console.log('Camera permission:', cameraPermission);
      
      const audioPermission = await Camera.requestMicrophonePermissionsAsync();
      console.log('Microphone permission:', audioPermission);
      
      // Web環境ではMediaLibraryは不要
      const mediaLibraryPermission = typeof navigator !== 'undefined' 
        ? { status: 'granted' } 
        : await MediaLibrary.requestPermissionsAsync();
      console.log('Media library permission:', mediaLibraryPermission);
      
      const allGranted = cameraPermission.status === 'granted' && 
                        audioPermission.status === 'granted' && 
                        mediaLibraryPermission.status === 'granted';
      
      console.log('All permissions granted:', allGranted);
      setHasPermission(allGranted);
      
      if (!allGranted) {
        console.log('Permission details:', {
          camera: cameraPermission.status,
          audio: audioPermission.status,
          mediaLibrary: mediaLibraryPermission.status
        });
      }
    } catch (error) {
      console.error('Permission request error:', error);
      setHasPermission(false);
    }
  };


  const saveToAppLibrary = async (mediaUri: string, isVideo: boolean = false) => {
    try {
      const { data: { user } } = await authService.getCurrentUser();
      
      if (!user) {
        console.log('ユーザーがログインしていません');
        return;
      }

      // ファイル名を生成
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
      const filename = `${isVideo ? 'video' : 'photo'}_${timestamp}.${isVideo ? 'mp4' : 'jpg'}`;

      // media_libraryテーブルに登録
      await mediaLibraryService.addMedia({
        user_id: user.id,
        filename: filename,
        file_path: mediaUri,
        mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
        is_video: isVideo,
      });
      
      console.log('Media saved to app library:', filename);
      
    } catch (error) {
      console.error('Error saving to app library:', error);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current && isCameraReady) {
      try {
        const photo = await cameraRef.current.takePictureAsync();
        if (photo) {
          // アルバムに保存
          await MediaLibrary.saveToLibraryAsync(photo.uri);
          
          // アプリのライブラリにも登録
          await saveToAppLibrary(photo.uri, false);
          
          Alert.alert('写真を撮影しました!', 'アルバムに保存されました。', [
            { text: '続けて撮影', style: 'cancel' },
            { 
              text: 'アルバムで確認', 
              onPress: () => router.push('/gallery')
            }
          ]);
        }
      } catch (error) {
        console.error('写真撮影エラー:', error);
        Alert.alert('エラー', '写真の撮影に失敗しました。');
      }
    } else if (!isCameraReady) {
      Alert.alert('カメラ準備中', 'カメラの準備が完了するまでお待ちください。');
    }
  };

  const recordVideo = async () => {
    console.log('recordVideo called - isCameraReady:', isCameraReady, 'cameraRef.current:', !!cameraRef.current, 'retryCount:', retryCount);
    
    if (cameraRef.current) {
      try {
        if (isRecording) {
          console.log('Stopping video recording...');
          // 録画停止
          cameraRef.current.stopRecording();
          setRetryCount(0); // リセット
        } else {
          console.log('Starting video recording...');
          
          setIsRecording(true);
          const video = await cameraRef.current.recordAsync({
            maxDuration: 60, // 最大60秒
            mute: false,
            quality: '720p', // 品質を指定
          });
          
          console.log('Recording completed:', video);
          // 録画が完了した時の処理
          setIsRecording(false);
          setRetryCount(0); // リセット
          if (video && video.uri) {
            // アルバムに保存
            await MediaLibrary.saveToLibraryAsync(video.uri);
            
            // アプリのライブラリにも登録
            await saveToAppLibrary(video.uri, true);
            
            setRecordedVideo(video.uri);
            Alert.alert('動画を保存しました!', 'アルバムに保存されました。', [
              { text: '続けて撮影', style: 'cancel' },
              { 
                text: 'アルバムで確認', 
                onPress: () => router.push('/gallery')
              }
            ]);
          }
        }
      } catch (error) {
        console.error('動画録画エラー:', error);
        console.error('Error details:', error.message);
        setIsRecording(false);
        
        // カメラが準備できていない場合のリトライ処理（最大3回まで）
        if (error.message.includes('Camera is not ready') && retryCount < 3) {
          console.log(`Camera not ready, retrying... (attempt ${retryCount + 1}/3)`);
          setRetryCount(prev => prev + 1);
          
          // カメラを再初期化
          setIsCameraReady(false);
          setTimeout(() => {
            recordVideo();
          }, 1000);
          return;
        }
        
        // リトライ回数上限に達した場合
        if (retryCount >= 3) {
          console.log('Max retry attempts reached');
          Alert.alert('エラー', 'カメラの準備ができません。アプリを再起動してください。');
        } else {
          Alert.alert('エラー', '動画の録画に失敗しました。');
        }
        setRetryCount(0);
      }
    } else {
      console.log('Camera ref is null');
      Alert.alert('エラー', 'カメラが利用できません。');
    }
  };

  const toggleCameraType = () => {
    setIsCameraReady(false); // カメラ切り替え時は準備状態をリセット
    setRetryCount(0); // リトライカウントもリセット
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlashMode(current => {
      switch (current) {
        case 'off': return 'on';
        case 'on': return 'auto';
        case 'auto': return 'off';
        default: return 'off';
      }
    });
  };

  if (hasPermission === null) {
    return <View style={styles.container}><Text>カメラの権限を確認中...</Text></View>;
  }
  
  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#666" />
          <Text style={styles.permissionTitle}>カメラアクセスが必要です</Text>
          <Text style={styles.permissionText}>
            この機能を使用するには、カメラ、マイク、メディアライブラリへのアクセス許可が必要です。
          </Text>
          <Text style={styles.permissionInstructions}>
            ブラウザで「許可」を選択してください。{'\n'}
            または、アドレスバーの🔒アイコンから設定を変更できます。
          </Text>
          <TouchableOpacity style={styles.button} onPress={getCameraPermissions}>
            <Text style={styles.buttonText}>権限を再取得</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={cameraType}
        flash={flashMode}
        onCameraReady={() => {
          console.log('Camera is ready!');
          // 少し遅延を入れてから準備完了とする
          setTimeout(() => {
            setIsCameraReady(true);
            console.log('Camera ready state set to true');
          }, 200);
        }}
      >
        {/* Top Controls */}
        <View style={styles.topControls}>
          <TouchableOpacity style={styles.topButton} onPress={toggleFlash}>
            <Ionicons 
              name={flashMode === 'off' ? 'flash-off-outline' : flashMode === 'on' ? 'flash' : 'flash-outline'} 
              size={28} 
              color="white" 
            />
          </TouchableOpacity>
          <Text style={styles.modeText}>
            {currentMode === 'photo' ? 'Photo' : 'Video'} {isCameraReady ? '✓' : '...'}
          </Text>
          <TouchableOpacity style={styles.topButton}>
            <Ionicons name="settings-outline" size={28} color="white" />
          </TouchableOpacity>
        </View>


        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          <View style={styles.leftControlsContainer}>
            <TouchableOpacity 
              style={styles.albumButton}
              onPress={() => router.push('/gallery')}
              activeOpacity={0.7}
            >
              <Ionicons name="images-outline" size={24} color="white" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.modeToggleButton}
              onPress={() => setCurrentMode(currentMode === 'photo' ? 'video' : 'photo')}
            >
              <Ionicons 
                name={currentMode === 'photo' ? 'videocam-outline' : 'camera-outline'} 
                size={24} 
                color="white" 
              />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={[
              styles.captureButton, 
              isRecording && styles.recording,
              currentMode === 'video' && styles.videoModeButton
            ]} 
            onPress={currentMode === 'photo' ? takePicture : recordVideo}
            activeOpacity={0.7}
          >
            <View style={[
              styles.captureButtonInner,
              isRecording && styles.recordingInner
            ]} />
          </TouchableOpacity>
          
          <View style={styles.rightControlsContainer}>
            <TouchableOpacity 
              style={styles.flipButton} 
              onPress={toggleCameraType}
              activeOpacity={0.7}
            >
              <Ionicons name="camera-reverse-outline" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Recording Indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC</Text>
          </View>
        )}

        {/* Camera Ready Indicator */}
        {!isCameraReady && (
          <View style={styles.cameraNotReadyIndicator}>
            <Text style={styles.cameraNotReadyText}>カメラ準備中...</Text>
          </View>
        )}
      </CameraView>
      
      {recordedVideo && (
        <View style={styles.videoPreview}>
          <Video
            source={{ uri: recordedVideo }}
            style={styles.video}
            useNativeControls
            resizeMode="contain"
            isLooping
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  activeModeText: {
    color: '#FFD700',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 40,
    paddingTop: 20,
  },
  leftControlsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 15,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rightControlsContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  albumButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeToggleButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  videoModeButton: {
    borderColor: '#FF3B30',
  },
  recordingInner: {
    borderRadius: 8,
    backgroundColor: '#FF3B30',
  },
  flipButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recording: {
    borderColor: '#FF3B30',
  },
  recordingIndicator: {
    position: 'absolute',
    top: 100,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginRight: 6,
  },
  recordingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cameraNotReadyIndicator: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  cameraNotReadyText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  text: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    margin: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    margin: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  videoPreview: {
    position: 'absolute',
    top: 100,
    right: 20,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'white',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  permissionInstructions: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
    fontStyle: 'italic',
  },
});
