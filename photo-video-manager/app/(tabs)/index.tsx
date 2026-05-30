import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Text, Platform, TouchableWithoutFeedback, AppState } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import type { FormatFilter } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedProps } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { mediaLibraryService, authService } from '@/lib/supabase';
import { cameraCaptureService } from '@/lib/cameraCapture';

const AnimatedCamera = Animated.createAnimatedComponent(Camera);
const PHOTO_ASPECT_RATIO = 4 / 3;
const VIDEO_ASPECT_RATIO = 16 / 9;
const MEDIA_DIRECTORY = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}media/` : null;

type CapturedMedia = {
  uri: string;
  type: 'photo' | 'video';
  persistTask?: Promise<string>;
};

const getSearchParam = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value[0] : value
);

export default function CameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [isRecording, setIsRecording] = useState(false);
  const [currentMode, setCurrentMode] = useState<'picture' | 'video'>('picture');
  const [showGrid, setShowGrid] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [videoResolution, setVideoResolution] = useState<'hd' | '4k'>('4k');
  const [showExposureControl, setShowExposureControl] = useState(false);
  const [exposure, setExposure] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const returnToCreate = getSearchParam(params.returnToCreate) === '1';
  const existingMediaCount = Math.min(
    5,
    Math.max(0, Number(getSearchParam(params.existingMediaCount) ?? 0) || 0)
  );
  const captureLimit = returnToCreate ? Math.max(1, 5 - existingMediaCount) : 5;
  const isCameraActive = isFocused && appState === 'active';

  const cameraRef = useRef<Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exposureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedMediaRef = useRef<CapturedMedia[]>([]);
  const isCapturingRef = useRef(false);
  const mediaDirectoryReadyRef = useRef(false);
  const mediaPermissionGrantedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const zoom = useSharedValue(1);
  const zoomAtPinchStart = useSharedValue(1);

  // 権限
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();

  // デバイス・フォーマット選択（モードごとに最適化）
  const device = useCameraDevice(cameraPosition);
  const formatFilters = useMemo<FormatFilter[]>(() => {
    if (currentMode === 'picture') {
      return [
        { photoAspectRatio: PHOTO_ASPECT_RATIO },
        { photoResolution: 'max' },
      ];
    }

    return [
      { videoAspectRatio: VIDEO_ASPECT_RATIO },
      { videoResolution: videoResolution === '4k' ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 } },
    ];
  }, [currentMode, videoResolution]);
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
    if (!device) return;

    const neutralZoom = Math.min(device.maxZoom, Math.max(device.minZoom, device.neutralZoom ?? 1));
    zoom.value = neutralZoom;
    zoomAtPinchStart.value = neutralZoom;
    setExposure(0);
    setIsCameraReady(false);
  }, [cameraPosition, currentMode, device, zoom, zoomAtPinchStart]);

  useEffect(() => {
    checkAuthStatus();
    requestPermissions();
    const appStateSubscription = AppState.addEventListener('change', setAppState);
    const unsubscribeExposure = cameraCaptureService.subscribeShowExposure(() => {
      setShowExposureControl(true);
      scheduleExposureDismiss();
    });
    return () => {
      cameraCaptureService.unregister();
      appStateSubscription.remove();
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
    if (!isCameraActive) {
      cameraCaptureService.unregister();
      setIsCameraReady(false);
      return;
    }

    const action = currentMode === 'picture' ? takePicture : recordVideo;
    cameraCaptureService.register(action);
    return () => {
      cameraCaptureService.unregister();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, isRecording, isCameraReady, isCameraActive]);

  const checkAuthStatus = async () => {
    try {
      const { data: { user } } = await authService.getCurrentUser();
      setIsAuthenticated(!!user);
      currentUserIdRef.current = user?.id ?? null;
      if (!user) router.replace('/login');
    } catch {
      setIsAuthenticated(false);
      currentUserIdRef.current = null;
      router.replace('/login');
    }
  };

  const requestPermissions = async () => {
    await requestCameraPermission();
    await requestMicPermission();
    const mediaPermission = await MediaLibrary.requestPermissionsAsync();
    mediaPermissionGrantedRef.current = mediaPermission.status === 'granted';
    if (MEDIA_DIRECTORY && !mediaDirectoryReadyRef.current) {
      try {
        await FileSystem.makeDirectoryAsync(MEDIA_DIRECTORY, { intermediates: true });
        mediaDirectoryReadyRef.current = true;
      } catch (error) {
        console.warn('Failed to prepare media directory:', error);
      }
    }
  };

  const createMediaFilename = useCallback((isVideo: boolean) => {
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}-${now.getMilliseconds().toString().padStart(3, '0')}`;
    const ext = isVideo ? 'mov' : 'jpg';
    return `${isVideo ? 'video' : 'photo'}_${timestamp}.${ext}`;
  }, []);

  const ensureMediaDirectory = useCallback(async () => {
    if (!MEDIA_DIRECTORY || mediaDirectoryReadyRef.current) return;
    await FileSystem.makeDirectoryAsync(MEDIA_DIRECTORY, { intermediates: true });
    mediaDirectoryReadyRef.current = true;
  }, []);

  const finalizeCapturedMedia = useCallback(async (persistentUri: string, filename: string, isVideo: boolean, userId: string | null) => {
    try {
      if (mediaPermissionGrantedRef.current) {
        await MediaLibrary.createAssetAsync(persistentUri);
      }
    } catch (error) {
      console.warn('Failed to save captured media to camera roll:', error);
    }

    if (!userId) return;

    try {
      await mediaLibraryService.addMedia({
        user_id: userId,
        filename,
        file_path: persistentUri,
        mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
        is_video: isVideo,
      });
    } catch (error) {
      console.warn('Failed to register captured media:', error);
    }
  }, []);

  const prepareCapturedMedia = useCallback((mediaUri: string, isVideo: boolean = false): CapturedMedia => {
    const type = isVideo ? 'video' : 'photo';
    if (!MEDIA_DIRECTORY) return { uri: mediaUri, type };

    const filename = createMediaFilename(isVideo);
    const persistentUri = `${MEDIA_DIRECTORY}${filename}`;
    const userId = currentUserIdRef.current;

    const persistTask = (async () => {
      try {
        await ensureMediaDirectory();
        try {
          await FileSystem.moveAsync({ from: mediaUri, to: persistentUri });
        } catch (moveError) {
          console.warn('Move captured media failed, falling back to copy:', moveError);
          await FileSystem.copyAsync({ from: mediaUri, to: persistentUri });
        }

        void finalizeCapturedMedia(persistentUri, filename, isVideo, userId);
        return persistentUri;
      } catch (error) {
        console.error('Error preparing captured media:', error);
        return mediaUri;
      }
    })();

    return { uri: persistentUri, type, persistTask };
  }, [createMediaFilename, ensureMediaDirectory, finalizeCapturedMedia]);

  const openPostCreateWithCapturedMedia = useCallback((mediaItems: CapturedMedia[]) => {
    const targetItems = mediaItems.slice(-captureLimit);
    if (targetItems.length === 0) return;

    Promise.all(targetItems.map(async item => ({
      ...item,
      uri: item.persistTask ? await item.persistTask : item.uri,
    }))).then((readyItems) => {
      const selectedMedia = readyItems.map(item => item.uri).join(',');
      const mediaTypes = readyItems.map(item => item.type).join(',');
      const createParams: Record<string, string> = {
        selectedMedia,
        mediaTypes,
      };

      if (returnToCreate) {
        createParams.appendMedia = '1';
      }

      capturedMediaRef.current = [];
      if (returnToCreate) {
        router.setParams({
          returnToCreate: undefined,
          appendMedia: undefined,
          existingMediaCount: undefined,
        } as any);
      }
      router.push({
        pathname: '/post/create',
        params: createParams,
      } as any);
    }).catch((error) => {
      console.error('Failed to prepare media for post:', error);
      Alert.alert('エラー', '投稿作成の準備に失敗しました。もう一度お試しください。');
    });
  }, [captureLimit, returnToCreate, router]);

  const showCapturedMediaPrompt = useCallback((latestMedia: CapturedMedia) => {
    const nextItems = [...capturedMediaRef.current, latestMedia].slice(-captureLimit);
    capturedMediaRef.current = nextItems;

    const count = nextItems.length;
    const mediaLabel = latestMedia.type === 'video' ? '動画' : '写真';
    const canContinue = count < captureLimit;
    const submitLabel = returnToCreate ? '追加' : '投稿';

    const actions = canContinue
      ? [
          { text: '続けて撮影', style: 'cancel' as const },
          { text: submitLabel, onPress: () => openPostCreateWithCapturedMedia(nextItems) },
        ]
      : [
          { text: submitLabel, onPress: () => openPostCreateWithCapturedMedia(nextItems) },
        ];

    Alert.alert(
      `${mediaLabel}を保存しました`,
      returnToCreate
        ? `${count}件のメディアを保存しました。投稿に追加しますか？`
        : `${count}件のメディアを保存しました。投稿作成へ進みますか？`,
      actions
    );
  }, [captureLimit, openPostCreateWithCapturedMedia, returnToCreate]);

  const getCameraErrorMessage = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const isIosCaptureFailure =
      message.includes('AVFoundationErrorDomain') ||
      message.includes('-11800') ||
      message.includes('-11803') ||
      message.includes('-16409') ||
      message.includes('-16802');

    if (isIosCaptureFailure) {
      return 'カメラ処理が一時的に失敗しました。少し待ってからもう一度撮影してください。';
    }

    return `写真の撮影に失敗しました。\n${message}`;
  }, []);

  const takePicture = useCallback(async () => {
    if (isCapturingRef.current) {
      return;
    }

    if (!cameraRef.current || !isCameraReady) {
      Alert.alert('カメラ準備中', 'カメラの準備が完了するまでお待ちください。');
      return;
    }

    isCapturingRef.current = true;
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePhoto(
        flashMode === 'off' ? undefined : { flash: flashMode }
      );
      console.log('[Camera] Photo size:', photo.width, 'x', photo.height);

      const uri = Platform.OS === 'ios' ? `file://${photo.path}` : photo.path;
      const capturedMedia = prepareCapturedMedia(uri, false);
      showCapturedMediaPrompt(capturedMedia);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('写真撮影エラー:', message);
      Alert.alert('エラー', getCameraErrorMessage(error));
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
    }
  }, [isCameraReady, flashMode, prepareCapturedMedia, showCapturedMediaPrompt, getCameraErrorMessage]);

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
        const capturedMedia = prepareCapturedMedia(uri, true);
        showCapturedMediaPrompt(capturedMedia);
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
  }, [isCameraReady, isRecording, flashMode, prepareCapturedMedia, showCapturedMediaPrompt]);

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
      <View style={[styles.topControls, { top: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.topLeft}>
          <TouchableOpacity
            style={styles.topButton}
            onPress={() => {
              if (returnToCreate) {
                router.setParams({
                  returnToCreate: undefined,
                  appendMedia: undefined,
                  existingMediaCount: undefined,
                } as any);
                router.push({
                  pathname: '/gallery',
                  params: {
                    returnToCreate: '1',
                    appendMedia: '1',
                    existingMediaCount: String(existingMediaCount),
                  },
                } as any);
                return;
              }
              router.push('/gallery');
            }}
            activeOpacity={0.78}
          >
            <Ionicons name="images-outline" size={22} color="rgba(255,255,255,0.92)" />
          </TouchableOpacity>

          {currentMode === 'video' && (
            <View style={styles.resolutionSegmentTop}>
              <TouchableOpacity
                style={[styles.resolutionOption, videoResolution === 'hd' && styles.activeResolutionOption]}
                onPress={() => setVideoResolution('hd')}
                activeOpacity={0.78}
              >
                <Text style={[styles.resolutionText, videoResolution === 'hd' && styles.activeResolutionText]}>HD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resolutionOption, videoResolution === '4k' && styles.activeResolutionOption]}
                onPress={() => setVideoResolution('4k')}
                activeOpacity={0.78}
              >
                <Text style={[styles.resolutionText, videoResolution === '4k' && styles.activeResolutionText]}>4K</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity
            style={[styles.topButton, showGrid && styles.topButtonActive]}
            onPress={() => { console.log('[Grid] toggle:', !showGrid); setShowGrid(!showGrid); }}
            activeOpacity={0.78}
          >
            <Ionicons name="grid-outline" size={24} color={showGrid ? 'white' : 'rgba(255,255,255,0.6)'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.topButton, flashMode !== 'off' && styles.topButtonActive]}
            onPress={() => setFlashMode(f => f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off')}
            activeOpacity={0.78}
          >
            <Ionicons
              name={flashMode === 'off' ? 'flash-off' : flashMode === 'on' ? 'flash' : 'flash-outline'}
              size={24}
              color={flashMode === 'off' ? 'rgba(255,255,255,0.6)' : 'white'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topButton}
            onPress={() => {
              setIsCameraReady(false);
              setCameraPosition(p => p === 'back' ? 'front' : 'back');
            }}
            activeOpacity={0.78}
          >
            <Ionicons name="camera-reverse-outline" size={24} color="rgba(255,255,255,0.88)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera */}
      <View style={styles.cameraWrapper}>
        <View style={[styles.cameraFrame, currentMode === 'picture' ? styles.photoFrame : styles.videoFrame]}>
          <GestureDetector gesture={pinchGesture}>
            <AnimatedCamera
              key={`${device.id}-${currentMode}-${videoResolution}`}
              ref={cameraRef}
              style={styles.camera}
              device={device}
              format={format}
              isActive={isCameraActive}
              photo={currentMode === 'picture'}
              video={currentMode === 'video'}
              audio={currentMode === 'video' && hasMicPermission}
              animatedProps={animatedProps}
              exposure={exposure}
              resizeMode="contain"
              photoQualityBalance={currentMode === 'picture' ? 'quality' : undefined}
              onInitialized={() => setIsCameraReady(true)}
              onStopped={() => setIsCameraReady(false)}
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
        </View>

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

        {isCapturing && (
          <View style={styles.captureBusyIndicator}>
            <Text style={styles.captureBusyText}>保存中...</Text>
          </View>
        )}
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <View style={styles.modeContainer}>
          <TouchableOpacity
            style={[styles.modeButton, currentMode === 'picture' && styles.activeModeButton]}
            onPress={() => setCurrentMode('picture')}
            activeOpacity={0.82}
          >
            <Text style={[styles.modeText, currentMode === 'picture' && styles.activeModeText]}>写真</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, currentMode === 'video' && styles.activeModeButton]}
            onPress={() => setCurrentMode('video')}
            activeOpacity={0.82}
          >
            <Text style={[styles.modeText, currentMode === 'video' && styles.activeModeText]}>動画</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  cameraWrapper: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFrame: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'black',
    marginBottom: 96,
  },
  photoFrame: {
    aspectRatio: 3 / 4,
  },
  videoFrame: {
    aspectRatio: 9 / 16,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  topControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  topLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topRight: { flexDirection: 'row', gap: 8 },
  resolutionSegmentTop: {
    flexDirection: 'row',
    backgroundColor: 'rgba(10,12,18,0.52)',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: 3,
  },
  closeButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  topButton: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(10,12,18,0.52)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  topButtonActive: {
    backgroundColor: 'rgba(37,99,235,0.72)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 150,
    zIndex: 30,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  modeRow: { justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  modeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderRadius: 21,
    padding: 3,
    backgroundColor: 'rgba(10,12,18,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  resolutionOption: {
    minWidth: 52,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
    alignItems: 'center',
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
    minWidth: 72,
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeModeButton: { backgroundColor: '#FFFFFF' },
  modeText: { color: 'rgba(255,255,255,0.66)', fontSize: 13, fontWeight: '800' },
  activeModeText: { color: '#111827', fontWeight: '900' },
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
    position: 'absolute', top: 104, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    zIndex: 20,
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
  captureBusyIndicator: {
    position: 'absolute',
    top: 104,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
  },
  captureBusyText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  permissionTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginTop: 20, marginBottom: 16, textAlign: 'center' },
  permissionText: { fontSize: 16, color: '#ccc', textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  button: { backgroundColor: '#2196F3', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25, margin: 20 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  exposureOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
    justifyContent: 'flex-end', paddingBottom: 170,
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
