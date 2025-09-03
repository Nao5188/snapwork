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
    console.log('takePicture called - isCameraReady:', isCameraReady, 'cameraRef.current:', !!cameraRef.current);
    if (cameraRef.current) {
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
    } else {
      console.log('Camera not ready or ref is null - isCameraReady:', isCameraReady, 'cameraRef:', !!cameraRef.current);
      if (!isCameraReady) {
        Alert.alert('カメラ準備中', 'カメラの準備が完了するまでお待ちください。');
      } else {
        Alert.alert('エラー', 'カメラが利用できません。');
      }
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
          
          // カメラが準備できていない場合は少し待機してからリトライ
          if (!isCameraReady) {
            console.log('Camera not ready, waiting and trying anyway...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            // 準備状態を強制的にtrueにしてみる
            setIsCameraReady(true);
          }
          
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
          
          // より長い待機時闳でカメラの準備を待つ
          setIsCameraReady(false);
          setTimeout(() => {
            setIsCameraReady(true);
            setTimeout(() => {
              recordVideo();
            }, 200);
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
    console.log('Toggling camera type');
    setIsCameraReady(false); // カメラ切り替え時は準備状態をリセット
    setRetryCount(0); // リトライカウントもリセット
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    console.log('Toggling flash mode from:', flashMode);
    setFlashMode(current => {
      const newMode = (() => {
        switch (current) {
          case 'off': return 'on';
          case 'on': return 'auto';
          case 'auto': return 'off';
          default: return 'off';
        }
      })();
      console.log('Flash mode changed to:', newMode);
      return newMode;
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
          // より長い遅延で確実に準備完了を待つ
          setTimeout(() => {
            setIsCameraReady(true);
            console.log('Camera ready state set to true');
          }, 500);
        }}
      >
        {/* Top Controls */}
        <View style={styles.topControls}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          
          <View style={styles.emptySpace} />
          
          <TouchableOpacity style={styles.topButton} onPress={toggleFlash}>
            <Ionicons 
              name={flashMode === 'off' ? 'flash-off' : flashMode === 'on' ? 'flash' : 'flash-outline'} 
              size={24} 
              color={flashMode === 'off' ? 'rgba(255,255,255,0.6)' : '#FFD700'}
            />
          </TouchableOpacity>
        </View>


        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          {/* Mode Selector */}
          <View style={styles.modeContainer}>
            <TouchableOpacity 
              style={[styles.modeButton, currentMode === 'photo' && styles.activeModeButton]}
              onPress={() => {
                console.log('Switching to photo mode');
                setCurrentMode('photo');
                // モード切り替え時はカメラ状態をリセット
                setIsCameraReady(false);
                setTimeout(() => setIsCameraReady(true), 300);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeText, currentMode === 'photo' && styles.activeModeText]}>写真</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modeButton, currentMode === 'video' && styles.activeModeButton]}
              onPress={() => {
                console.log('Switching to video mode');
                setCurrentMode('video');
                // モード切り替え時はカメラ状態をリセット
                setIsCameraReady(false);
                setTimeout(() => setIsCameraReady(true), 300);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeText, currentMode === 'video' && styles.activeModeText]}>動画</Text>
            </TouchableOpacity>
          </View>
          
          {/* Control Buttons */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity 
              style={styles.albumButton}
              onPress={() => {
                console.log('Navigating to gallery');
                router.push('/gallery');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="images" size={28} color="white" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.captureButton, 
                isRecording && styles.recording,
                !isCameraReady && styles.captureButtonDisabled
              ]} 
              onPress={currentMode === 'photo' ? takePicture : recordVideo}
              activeOpacity={0.8}
            >
              <View style={[
                styles.captureButtonInner,
                isRecording && styles.recordingInner,
                currentMode === 'video' && !isRecording && styles.videoCaptureInner
              ]} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.flipButton}
              onPress={toggleCameraType}
              activeOpacity={0.7}
            >
              <Ionicons name="camera-reverse" size={28} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Recording Indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingAnimation}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>REC</Text>
            </View>
            <View style={styles.recordingTimer}>
              <Text style={styles.recordingTimerText}>00:30</Text>
            </View>
          </View>
        )}
      </CameraView>
      
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
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySpace: {
    width: 44,
    height: 44,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  modeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 30,
  },
  modeButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginHorizontal: 10,
  },
  activeModeButton: {
    borderBottomWidth: 2,
    borderBottomColor: 'white',
  },
  modeText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    fontWeight: '500',
  },
  activeModeText: {
    color: 'white',
    fontWeight: '600',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  albumButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'white',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  videoCaptureInner: {
    backgroundColor: '#FF3B30',
  },
  recordingInner: {
    backgroundColor: '#FF3B30',
    borderRadius: 4,
    width: 30,
    height: 30,
  },
  recording: {
    borderColor: '#FF3B30',
  },
  recordingIndicator: {
    position: 'absolute',
    top: 120,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordingAnimation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backdropFilter: 'blur(10px)',
  },
  recordingTimer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backdropFilter: 'blur(10px)',
  },
  recordingTimerText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'white',
    marginRight: 8,
  },
  recordingText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
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
