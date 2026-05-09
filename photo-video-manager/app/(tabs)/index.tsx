import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Text, Platform, TouchableWithoutFeedback } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue, useAnimatedProps } from 'react-native-reanimated';

const AnimatedCamera = Animated.createAnimatedComponent(Camera);
import { mediaLibraryService, authService } from '@/lib/supabase';
import { cameraCaptureService } from '@/lib/cameraCapture';

export default function CameraScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [isRecording, setIsRecording] = useState(false);
  const [currentMode, setCurrentMode] = useState<'picture' | 'video'>('picture');
  const [showGrid, setShowGrid] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [videoResolution, setVideoResolution] = useState<'hd' | '4k'>('4k');
  const [showExposureControl, setShowExposureControl] = useState(false);
  const [exposure, setExposure] = useState(0);

  const cameraRef = useRef<Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exposureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoom = useSharedValue(1);
  const zoomAtPinchStart = useSharedValue(1);

  // 権限
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();

  // デバイス・フォーマット選択（モードごとに最適化）
  const device = useCameraDevice(cameraPosition);
  const formatFilters = useMemo(() =>
    currentMode === 'picture'
      ? [{ photoResolution: 'max' as const }]
      : [{ videoResolution: videoResolution === '4k' ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 } }],
    [currentMode, videoResolution]
  );
  const format = useCameraFormat(device, formatFilters);

  const minZoom = device?.minZoom ?? 1;
  const maxZoom = device?.maxZoom ?? 8;

  const animatedProps = useAnimatedProps(() => ({ zoom: zoom.value }), [zoom]);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      zoomAtPinchStart.value = zoom.value;
    })
    .onUpdate((e) => {
      const newZoom = Math.min(maxZoom, Math.max(minZoom, zoomAtPinchStart.value * e.scale));
      zoom.value = newZoom;
    });

  useEffect(() => {
    checkAuthStatus();
    requestPermissions();
    const unsubscribeExposure = cameraCaptureService.subscribeShowExposure(() => {
      setShowExposureControl(true);
      scheduleExposureDismiss();
    });
    return () => {
      cameraCaptureService.unregister();
      unsubscribeExposure();
      if (exposureTimerRef.current) clearTimeout(exposureTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleExposureDismiss = () => {
    if (exposureTimerRef.current) clearTimeout(exposureTimerRef.current);
    exposureTimerRef.current = setTimeout(() => setShowExposureControl(false), 4000);
  };

  const handleExposureChange = (value: number) => {
    setExposure(value);
    scheduleExposureDismiss();
  };

  useEffect(() => {
    const action = currentMode === 'picture' ? takePicture : recordVideo;
    cameraCaptureService.register(action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, isRecording, isCameraReady]);

  const checkAuthStatus = async () => {
    try {
      const { data: { user } } = await authService.getCurrentUser();
      setIsAuthenticated(!!user);
      if (!user) router.replace('/login');
    } catch {
      setIsAuthenticated(false);
      router.replace('/login');
    }
  };

  const requestPermissions = async () => {
    await requestCameraPermission();
    await requestMicPermission();
  };

  const saveToAppLibrary = async (mediaUri: string, isVideo: boolean = false) => {
    try {
      const { data: { user } } = await authService.getCurrentUser();
      if (!user) return;

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;

      // カメラロールに保存
      await MediaLibrary.createAssetAsync(mediaUri);

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
      const ext = isVideo ? 'mov' : 'jpg';
      const filename = `${isVideo ? 'video' : 'photo'}_${timestamp}.${ext}`;

      // アプリのDocumentsディレクトリにコピー（fetch/サムネイル生成が常にアクセス可能）
      const destDir = `${FileSystem.documentDirectory}media/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const persistentUri = `${destDir}${filename}`;
      await FileSystem.copyAsync({ from: mediaUri, to: persistentUri });

      await mediaLibraryService.addMedia({
        user_id: user.id,
        filename,
        file_path: persistentUri,
        mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
        is_video: isVideo,
      });
    } catch (error) {
      console.error('Error saving to app library:', error);
    }
  };

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady) {
      Alert.alert('カメラ準備中', 'カメラの準備が完了するまでお待ちください。');
      return;
    }
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: flashMode,
      });
      console.log('[Camera] Photo size:', photo.width, 'x', photo.height);

      const uri = Platform.OS === 'ios' ? `file://${photo.path}` : photo.path;
      await saveToAppLibrary(uri, false);
      Alert.alert('写真を撮影しました！', 'アルバムに保存されました。', [
        { text: '続けて撮影', style: 'cancel' },
        { text: 'アルバムで確認', onPress: () => router.push('/gallery') },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('写真撮影エラー:', message);
      Alert.alert('エラー', `写真の撮影に失敗しました。\n${message}`);
    }
  }, [isCameraReady, flashMode]);

  const recordVideo = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady) {
      Alert.alert('カメラ準備中', 'カメラの準備が完了するまでお待ちください。');
      return;
    }

    if (isRecording) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecordingSeconds(0);
      await cameraRef.current.stopRecording();
      return;
    }

    setIsRecording(true);
    cameraCaptureService.setRecording(true);
    timerRef.current = setInterval(() => {
      setRecordingSeconds(prev => {
        if (prev >= 59) { cameraRef.current?.stopRecording(); return prev; }
        return prev + 1;
      });
    }, 1000);

    cameraRef.current.startRecording({
      flash: flashMode === 'on' ? 'on' : 'off',
      onRecordingFinished: async (video) => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecordingSeconds(0);
        setIsRecording(false);
        cameraCaptureService.setRecording(false);

        const uri = Platform.OS === 'ios' ? `file://${video.path}` : video.path;
        await saveToAppLibrary(uri, true);
        Alert.alert('動画を保存しました！', 'アルバムに保存されました。', [
          { text: '続けて撮影', style: 'cancel' },
          { text: 'アルバムで確認', onPress: () => router.push('/gallery') },
        ]);
      },
      onRecordingError: (error) => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecordingSeconds(0);
        setIsRecording(false);
        cameraCaptureService.setRecording(false);
        console.error('録画エラー:', error);
        Alert.alert('エラー', '動画の録画に失敗しました。');
      },
    });
  }, [isCameraReady, isRecording, flashMode]);

  // 認証確認中
  if (isAuthenticated === null) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>認証状態を確認中...</Text>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="person-outline" size={80} color="#666" />
          <Text style={styles.permissionTitle}>ログインが必要です</Text>
          <Text style={styles.permissionText}>カメラ機能を使用するにはログインしてください。</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>ログイン画面へ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#666" />
          <Text style={styles.permissionTitle}>カメラアクセスが必要です</Text>
          <Text style={styles.permissionText}>
            カメラとマイクへのアクセス許可が必要です。
          </Text>
          <TouchableOpacity style={styles.button} onPress={requestPermissions}>
            <Text style={styles.buttonText}>権限を再取得</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>カメラデバイスが見つかりません</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Controls */}
      <View style={styles.topControls}>
        {currentMode === 'video' ? (
          <View style={styles.resolutionSegmentTop}>
            <TouchableOpacity
              style={[styles.resolutionOption, videoResolution === 'hd' && styles.activeResolutionOption]}
              onPress={() => setVideoResolution('hd')}
            >
              <Text style={[styles.resolutionText, videoResolution === 'hd' && styles.activeResolutionText]}>HD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resolutionOption, videoResolution === '4k' && styles.activeResolutionOption]}
              onPress={() => setVideoResolution('4k')}
            >
              <Text style={[styles.resolutionText, videoResolution === '4k' && styles.activeResolutionText]}>4K</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.topButtonPlaceholder} />
        )}
        <View style={styles.topRight}>
          <TouchableOpacity style={styles.topButton} onPress={() => { console.log('[Grid] toggle:', !showGrid); setShowGrid(!showGrid); }}>
            <Ionicons name="grid-outline" size={24} color={showGrid ? 'white' : 'rgba(255,255,255,0.6)'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topButton} onPress={() => setFlashMode(f => f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off')}>
            <Ionicons
              name={flashMode === 'off' ? 'flash-off' : flashMode === 'on' ? 'flash' : 'flash-outline'}
              size={24}
              color={flashMode === 'off' ? 'rgba(255,255,255,0.6)' : 'white'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera */}
      <View style={styles.cameraWrapper}>
        <GestureDetector gesture={pinchGesture}>
          <AnimatedCamera
            ref={cameraRef}
            style={styles.camera}
            device={device}
            format={format}
            isActive={true}
            photo={currentMode === 'picture'}
            video={currentMode === 'video'}
            audio={currentMode === 'video'}
            animatedProps={animatedProps}
            exposure={exposure}
            onInitialized={() => setIsCameraReady(true)}
            onError={(error) => {
              console.error('Camera error:', error);
              setIsCameraReady(false);
            }}
          />
        </GestureDetector>

        {/* Grid */}
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

{/* Exposure Control */}
        {showExposureControl && (
          <TouchableWithoutFeedback onPress={() => setShowExposureControl(false)}>
            <View style={styles.exposureOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.exposurePanel}>
                  <Ionicons name="sunny" size={18} color="white" />
                  <View style={styles.exposureSteps}>
                    {[-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((val) => (
                      <TouchableOpacity
                        key={val}
                        onPress={() => handleExposureChange(val)}
                        style={[
                          styles.exposureStep,
                          exposure === val && styles.exposureStepActive,
                        ]}
                      >
                        <Text style={[
                          styles.exposureStepText,
                          exposure === val && styles.exposureStepTextActive,
                        ]}>
                          {val === 0 ? '0' : val > 0 ? `+${val}` : `${val}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.exposureLabel}>EV</Text>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
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
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <View style={styles.modeContainer}>
          <TouchableOpacity
            style={[styles.modeButton, currentMode === 'picture' && styles.activeModeButton]}
            onPress={() => setCurrentMode('picture')}
          >
            <Text style={[styles.modeText, currentMode === 'picture' && styles.activeModeText]}>写真</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, currentMode === 'video' && styles.activeModeButton]}
            onPress={() => setCurrentMode('video')}
          >
            <Text style={[styles.modeText, currentMode === 'video' && styles.activeModeText]}>動画</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.albumButton} onPress={() => router.push('/gallery')}>
            <Ionicons name="images" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <View style={styles.captureButtonPlaceholder} />
          <TouchableOpacity
            style={styles.flipButton}
            onPress={() => {
              setIsCameraReady(false);
              setCameraPosition(p => p === 'back' ? 'front' : 'back');
            }}
          >
            <Ionicons name="camera-reverse" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  cameraWrapper: { flex: 1 },
  camera: { flex: 1 },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: 'black',
  },
  topButtonPlaceholder: { width: 44, height: 44 },
  topRight: { flexDirection: 'row', gap: 8 },
  resolutionSegmentTop: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 3,
  },
  closeButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  topButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  bottomControls: {
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20,
    backgroundColor: 'black',
  },
  modeRow: { justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  modeContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 28 },
  resolutionOption: {
    paddingHorizontal: 20, paddingVertical: 6,
    borderRadius: 17,
  },
  activeResolutionOption: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  resolutionText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  activeResolutionText: { color: '#000' },
  modeButton: {
    paddingHorizontal: 22, paddingVertical: 8, marginHorizontal: 4,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  activeModeButton: { backgroundColor: 'rgba(255,255,255,0.25)' },
  modeText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '500' },
  activeModeText: { color: 'white', fontWeight: '700' },
  controlsContainer: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
  },
  albumButton: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  flipButton: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  captureButtonPlaceholder: { width: 80, height: 80 },
  recordingIndicator: {
    position: 'absolute', top: 16, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  recordingAnimation: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.95)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  recordingTimer: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  recordingTimerText: { color: 'white', fontSize: 14, fontWeight: '600', fontFamily: 'monospace' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'white', marginRight: 8 },
  recordingText: { color: 'white', fontSize: 13, fontWeight: '700', letterSpacing: 1.2 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  permissionTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginTop: 20, marginBottom: 16, textAlign: 'center' },
  permissionText: { fontSize: 16, color: '#ccc', textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  button: { backgroundColor: '#2196F3', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25, margin: 20 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  exposureOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
    justifyContent: 'flex-end', paddingBottom: 20,
  },
  exposurePanel: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 24,
    paddingHorizontal: 14, paddingVertical: 10,
    gap: 8,
  },
  exposureSteps: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  exposureStep: {
    paddingHorizontal: 6, paddingVertical: 6,
    borderRadius: 12, minWidth: 32, alignItems: 'center',
  },
  exposureStepActive: { backgroundColor: 'white' },
  exposureStepText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
  exposureStepTextActive: { color: 'black' },
  exposureLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
  gridOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  gridRow: { flex: 1, flexDirection: 'row' },
  gridRowBorderTop: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.4)' },
  gridCell: { flex: 1 },
  gridCellBorderLeft: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.4)' },
  viewfinderCorners: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: 'rgba(255,255,255,0.85)', borderWidth: 2.5 },
  cornerTL: { top: 20, left: 20, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 20, right: 20, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 20, left: 20, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 20, right: 20, borderLeftWidth: 0, borderTopWidth: 0 },
});
