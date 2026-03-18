import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Text } from 'react-native';
import { Camera, CameraView, CameraType, FlashMode } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { mediaLibraryService, authService } from '@/lib/supabase';
import { cameraCaptureService } from '@/lib/cameraCapture';

export default function CameraScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [isRecording, setIsRecording] = useState(false);
  const [currentMode, setCurrentMode] = useState<'picture' | 'video'>('picture');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const BASE_ZOOM = 0.10; // iPhoneの標準1x相当
  const [zoom, setZoom] = useState(0.10);
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zoomAtPinchStart = useRef(0);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      zoomAtPinchStart.current = zoom;
    })
    .onUpdate((e) => {
      const newZoom = Math.min(1, Math.max(0, zoomAtPinchStart.current + (e.scale - 1) * 0.5));
      runOnJS(setZoom)(newZoom);
    });

  useEffect(() => {
    checkAuthStatus();
    getCameraPermissions();
    return () => { cameraCaptureService.unregister(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const action = currentMode === 'picture' ? takePicture : recordVideo;
    cameraCaptureService.register(action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, isRecording, isCameraReady]);

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

      // デバイスライブラリに保存し、永続的なアセットURIを取得
      const asset = await MediaLibrary.createAssetAsync(mediaUri);
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
      const persistentUri = assetInfo.localUri || asset.uri;

      // ファイル名を生成
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
      const filename = `${isVideo ? 'video' : 'photo'}_${timestamp}.${isVideo ? 'mp4' : 'jpg'}`;

      // media_libraryテーブルに永続URIで登録
      await mediaLibraryService.addMedia({
        user_id: user.id,
        filename: filename,
        file_path: persistentUri,
        mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
        is_video: isVideo,
      });

      console.log('Media saved to app library:', filename);

    } catch (error) {
      console.error('Error saving to app library:', error);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          imageType: 'jpg',
        });
        if (photo) {
          await saveToAppLibrary(photo.uri, false);
          Alert.alert('写真を撮影しました!', 'アルバムに保存されました。', [
            { text: '続けて撮影', style: 'cancel' },
            {
              text: 'アルバムで確認',
              onPress: () => router.push('/gallery'),
            },
          ]);
        }
      } catch (error) {
        console.error('写真撮影エラー:', error);
        Alert.alert('エラー', '写真の撮影に失敗しました。');
      }
    } else {
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
          // タイマー停止
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setRecordingSeconds(0);
          // 録画停止
          cameraRef.current.stopRecording();
          setRetryCount(0); // リセット
        } else {
          console.log('Starting video recording...');
          
          // カメラの準備状態を確認し、準備ができていない場合は待機
          if (!isCameraReady) {
            console.log('Camera not ready, waiting for camera to be ready...');
            Alert.alert('カメラ準備中', 'カメラの準備が完了するまでお待ちください。');
            return;
          }
          
          setIsRecording(true);
          cameraCaptureService.setRecording(true);
          setRecordingSeconds(0);
          timerRef.current = setInterval(() => {
            setRecordingSeconds(prev => {
              if (prev >= 59) {
                // 60秒で自動停止
                cameraRef.current?.stopRecording();
                return prev;
              }
              return prev + 1;
            });
          }, 1000);

          const video = await cameraRef.current.recordAsync({
            maxDuration: 60, // 最大60秒
          });

          console.log('Recording completed:', video);
          // タイマー停止
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setRecordingSeconds(0);
          setIsRecording(false);
          cameraCaptureService.setRecording(false);
          setRetryCount(0); // リセット
          if (video && video.uri) {
            // デバイスライブラリへ保存＆アプリのライブラリに登録
            await saveToAppLibrary(video.uri, true);

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
        console.error('Error details:', error instanceof Error ? error.message : String(error));
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecordingSeconds(0);
        setIsRecording(false);
        cameraCaptureService.setRecording(false);

        // カメラが準備できていない場合のリトライ処理（最大3回まで）
        if (error instanceof Error && error.message.includes('Camera is not ready') && retryCount < 3) {
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
    setIsCameraReady(false); // facing変更でonCameraReadyが再発火するまでリセット
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

  // 認証状態確認中
  if (isAuthenticated === null) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>認証状態を確認中...</Text>
        </View>
      </View>
    );
  }

  // 未認証の場合（念のため）
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="person-outline" size={80} color="#666" />
          <Text style={styles.permissionTitle}>ログインが必要です</Text>
          <Text style={styles.permissionText}>
            カメラ機能を使用するにはログインしてください。
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>ログイン画面へ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
      {/* Top Controls */}
      <View style={styles.topControls}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.topButton} onPress={() => setShowGrid(!showGrid)}>
          <Ionicons
            name="grid-outline"
            size={24}
            color={showGrid ? 'white' : 'rgba(255,255,255,0.6)'}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.topButton} onPress={toggleFlash}>
          <Ionicons
            name={flashMode === 'off' ? 'flash-off' : flashMode === 'on' ? 'flash' : 'flash-outline'}
            size={24}
            color={flashMode === 'off' ? 'rgba(255,255,255,0.6)' : 'white'}
          />
        </TouchableOpacity>
      </View>

      {/* Camera Viewfinder */}
      <GestureDetector gesture={pinchGesture}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={cameraType}
          flash={flashMode}
          mode={currentMode}
          zoom={zoom}
          onCameraReady={() => {
            setIsCameraReady(true);
          }}
          onMountError={(error) => {
            console.error('Camera mount error:', error);
            setIsCameraReady(false);
          }}
        >
          {/* Grid Overlay */}
          {showGrid && (
            <View style={styles.gridOverlay} pointerEvents="none">
              <View style={styles.gridRow}>
                <View style={styles.gridCell} />
                <View style={[styles.gridCell, styles.gridCellBorderLeft]} />
                <View style={[styles.gridCell, styles.gridCellBorderLeft]} />
              </View>
              <View style={[styles.gridRow, styles.gridRowBorderTop]}>
                <View style={styles.gridCell} />
                <View style={[styles.gridCell, styles.gridCellBorderLeft]} />
                <View style={[styles.gridCell, styles.gridCellBorderLeft]} />
              </View>
              <View style={[styles.gridRow, styles.gridRowBorderTop]}>
                <View style={styles.gridCell} />
                <View style={[styles.gridCell, styles.gridCellBorderLeft]} />
                <View style={[styles.gridCell, styles.gridCellBorderLeft]} />
              </View>
            </View>
          )}

          {/* Viewfinder Corner Brackets */}
          <View style={styles.viewfinderCorners} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          {/* Zoom Indicator */}
          {zoom > BASE_ZOOM + 0.01 && (
            <TouchableOpacity
              style={styles.zoomIndicator}
              onPress={() => setZoom(BASE_ZOOM)}
              activeOpacity={0.7}
            >
              <Text style={styles.zoomText}>{(zoom / BASE_ZOOM).toFixed(1)}x</Text>
            </TouchableOpacity>
          )}

          {/* Recording Indicator */}
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingAnimation}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>REC</Text>
              </View>
              <View style={styles.recordingTimer}>
                <Text style={styles.recordingTimerText}>
                  {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                </Text>
              </View>
            </View>
          )}
        </CameraView>
      </GestureDetector>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        {/* Mode Selector */}
        <View style={styles.modeContainer}>
          <TouchableOpacity
            style={[styles.modeButton, currentMode === 'picture' && styles.activeModeButton]}
            onPress={() => { setCurrentMode('picture'); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeText, currentMode === 'picture' && styles.activeModeText]}>写真</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, currentMode === 'video' && styles.activeModeButton]}
            onPress={() => { setCurrentMode('video'); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeText, currentMode === 'video' && styles.activeModeText]}>動画</Text>
          </TouchableOpacity>
        </View>

        {/* Control Buttons */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={styles.albumButton}
            onPress={() => router.push('/gallery')}
            activeOpacity={0.7}
          >
            <Ionicons name="images" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          <View style={styles.captureButtonPlaceholder} />

          <TouchableOpacity
            style={styles.flipButton}
            onPress={toggleCameraType}
            activeOpacity={0.7}
          >
            <Ionicons name="camera-reverse" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>
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
    paddingBottom: 16,
    backgroundColor: 'black',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: 'black',
  },
  modeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 28,
  },
  modeButton: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  activeModeButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  modeText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    fontWeight: '500',
  },
  activeModeText: {
    color: 'white',
    fontWeight: '700',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  flipButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  captureButtonPlaceholder: {
    width: 80,
    height: 80,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  captureButtonInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
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
    borderRadius: 6,
    width: 32,
    height: 32,
  },
  recording: {
    borderColor: '#FF3B30',
    borderWidth: 4,
    backgroundColor: 'rgba(255,59,48,0.2)',
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
    backgroundColor: '#444444',
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
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridRowBorderTop: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
  },
  gridCell: {
    flex: 1,
  },
  gridCellBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.4)',
  },
  viewfinderCorners: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 2.5,
  },
  cornerTL: {
    top: 20,
    left: 20,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    top: 20,
    right: 20,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    bottom: 20,
    left: 20,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBR: {
    bottom: 20,
    right: 20,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  zoomIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  zoomText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
