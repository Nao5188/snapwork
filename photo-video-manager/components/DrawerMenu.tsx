import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  Alert,
  SafeAreaView,
  ScrollView,
  Switch,
  Clipboard,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { authService, storeService, supabase } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import {
  DrawerUserInfo,
  getCachedDrawerUserInfo,
  refreshDrawerUserInfo,
} from '@/lib/drawerUserInfo';
import { useSignedStorageUrlResolver } from '@/lib/signedStorageUrls';
import { getStoreRoleLabel, isStoreAdminRole } from '@/lib/storeRoles';
import { errorFeedback, lightTap, successFeedback } from '@/lib/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.76, 340);

interface DrawerMenuProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function DrawerMenu({ isVisible, onClose }: DrawerMenuProps) {
  const router = useRouter();
  const { isDark, setThemeMode, colors } = useAppTheme();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const [userInfo, setUserInfo] = useState<DrawerUserInfo | null>(null);
  const [storeInfoVisible, setStoreInfoVisible] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [permissionsVerified, setPermissionsVerified] = useState(false);
  const [switchingStoreId, setSwitchingStoreId] = useState<string | null>(null);
  const [editingStoreName, setEditingStoreName] = useState(false);
  const [storeNameDraft, setStoreNameDraft] = useState('');
  const [storeNameUpdating, setStoreNameUpdating] = useState(false);
  const isMountedRef = useRef(true);
  const currentUserIdRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUserInfo = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    const shouldApplyResult = () => (
      isMountedRef.current && loadRequestIdRef.current === requestId
    );

    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user = session?.user ?? null;

      if (!user) {
        const { data: { user: currentUser } } = await authService.getCurrentUser();
        user = currentUser;
      }

      if (!user) {
        if (shouldApplyResult()) {
          currentUserIdRef.current = null;
          setUserInfo(null);
          setPermissionsVerified(false);
        }
        return;
      }

      const isSameUser = currentUserIdRef.current === user.id;
      if (!isSameUser && shouldApplyResult()) {
        currentUserIdRef.current = user.id;
        setUserInfo(null);
        setPermissionsVerified(false);
      }

      const cachedUserInfo = await getCachedDrawerUserInfo(user.id);
      if (cachedUserInfo && shouldApplyResult()) {
        setUserInfo(previousUserInfo => {
          if (isSameUser && previousUserInfo?.role && !cachedUserInfo.role) {
            return {
              ...cachedUserInfo,
              storeInviteCode: previousUserInfo.storeInviteCode,
              role: previousUserInfo.role,
            };
          }

          return cachedUserInfo;
        });

        if (cachedUserInfo.role) {
          setPermissionsVerified(true);
        }
      }

      const nextUserInfo = await refreshDrawerUserInfo(user.id);
      if (!nextUserInfo || !shouldApplyResult()) return;
      setUserInfo(nextUserInfo);
      setPermissionsVerified(true);
    } catch (error) {
      if (shouldApplyResult() && !currentUserIdRef.current) {
        setPermissionsVerified(false);
      }
      console.error('DrawerMenu: ユーザー情報取得エラー', error);
    }
  }, []);

  useEffect(() => {
    loadUserInfo();
  }, [loadUserInfo]);

  useEffect(() => {
    if (isVisible) {
      setModalVisible(true);
      loadUserInfo();
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setModalVisible(false));
    }
  }, [isVisible, loadUserInfo, overlayAnim, slideAnim]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const navigate = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 280);
  };

  const handleLogout = () => {
    Alert.alert(
      'ログアウト',
      'ログアウトしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'ログアウト',
          style: 'destructive',
          onPress: async () => {
            onClose();
            await authService.signOut();
            router.replace('/login' as any);
          },
        },
      ]
    );
  };

  const handleCopyStoreNumber = async () => {
    const storeNumber = userInfo?.storeInviteCode;

    if (!storeNumber) {
      errorFeedback();
      Alert.alert('コピーできません', '店舗番号を取得できませんでした。時間をおいてもう一度お試しください。');
      return;
    }

    try {
      lightTap();
      Clipboard.setString(storeNumber);
      successFeedback();
      setInviteCopied(true);

      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }

      copiedTimer.current = setTimeout(() => {
        setInviteCopied(false);
      }, 1800);
    } catch {
      errorFeedback();
      Alert.alert('コピーできませんでした', '時間をおいてもう一度お試しください。');
    }
  };

  const handleSwitchStore = async (storeId: string) => {
    const userId = currentUserIdRef.current;
    if (!userId || storeId === userInfo?.storeId || switchingStoreId) return;

    setSwitchingStoreId(storeId);
    lightTap();

    try {
      await storeService.setActiveStoreId(userId, storeId);
      const nextUserInfo = await refreshDrawerUserInfo(userId);
      if (nextUserInfo) {
        setUserInfo(nextUserInfo);
      }
      successFeedback();
      setStoreInfoVisible(false);
      onClose();
      setTimeout(() => router.replace('/(tabs)/history' as any), 280);
    } catch (error) {
      console.error('DrawerMenu: 店舗切り替えエラー', error);
      errorFeedback();
      Alert.alert('切り替えできませんでした', '店舗への所属状態を確認して、もう一度お試しください。');
    } finally {
      setSwitchingStoreId(null);
    }
  };

  const handleJoinAnotherStore = () => {
    setStoreInfoVisible(false);
    onClose();
    setTimeout(() => router.push('/store/join' as any), 280);
  };

  const handleCreateAnotherStore = () => {
    setStoreInfoVisible(false);
    onClose();
    setTimeout(() => router.push('/store/create' as any), 280);
  };

  const handleStartStoreNameEdit = () => {
    if (userInfo?.role !== 'owner' || !userInfo.storeId) return;
    setStoreNameDraft(userInfo.storeName ?? '');
    setEditingStoreName(true);
  };

  const handleCancelStoreNameEdit = () => {
    setStoreNameDraft('');
    setEditingStoreName(false);
  };

  const getStoreNameUpdateErrorMessage = (error: any) => {
    const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;

    if (error?.code === 'PGRST202' || message.includes('store_owner_update_store_name')) {
      return '店名変更用のDB更新が必要です。Supabaseで database/store_member_admin.sql を実行してください。';
    }

    if (message.includes('Only store owners can update store name')) {
      return '店名を変更できるのはオーナーのみです。';
    }

    if (error?.code === '22023') {
      return '店舗名を入力してください。';
    }

    return message.trim() || 'もう一度お試しください。';
  };

  const handleSaveStoreName = async () => {
    const userId = currentUserIdRef.current;
    const storeId = userInfo?.storeId;
    const nextStoreName = storeNameDraft.trim();

    if (!userId || !storeId || userInfo?.role !== 'owner') {
      errorFeedback();
      Alert.alert('変更できません', '店名を変更できるのはオーナーのみです。');
      return;
    }

    if (!nextStoreName) {
      errorFeedback();
      Alert.alert('店舗名を入力してください');
      return;
    }

    if (nextStoreName === userInfo?.storeName) {
      handleCancelStoreNameEdit();
      return;
    }

    try {
      setStoreNameUpdating(true);
      lightTap();
      await storeService.updateStoreName(userId, storeId, nextStoreName);
      const nextUserInfo = await refreshDrawerUserInfo(userId);

      if (nextUserInfo) {
        setUserInfo(nextUserInfo);
      } else {
        setUserInfo(prev => prev ? {
          ...prev,
          storeName: nextStoreName,
          stores: prev.stores.map(store => (
            store.id === storeId ? { ...store, name: nextStoreName } : store
          )),
        } : prev);
      }

      successFeedback();
      setEditingStoreName(false);
      setStoreNameDraft('');
    } catch (error) {
      console.error('DrawerMenu: 店名変更エラー', error);
      errorFeedback();
      Alert.alert('店名を変更できませんでした', getStoreNameUpdateErrorMessage(error));
    } finally {
      setStoreNameUpdating(false);
    }
  };

  const MenuItem = ({
    icon,
    label,
    onPress,
    iconColor,
    iconBackground,
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    iconColor: string;
    iconBackground: string;
  }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={[styles.menuIconWrapper, { backgroundColor: iconBackground }]}>
        <Ionicons
          name={icon as any}
          size={22}
          color={iconColor}
        />
      </View>
      <Text style={[styles.menuItemText, { color: colors.text }]}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={22} color={isDark ? '#5f5f5f' : '#b8b8b8'} />
    </TouchableOpacity>
  );

  const ThemeToggleItem = () => (
    <View style={[styles.themeItem, { backgroundColor: colors.surface }]}>
      <View style={[styles.menuIconWrapper, { backgroundColor: isDark ? '#2a2a2a' : '#f7f7f7' }]}>
        <Ionicons name="moon-outline" size={22} color={isDark ? '#a78bfa' : '#111111'} />
      </View>
      <Text style={[styles.menuItemText, { color: colors.text }]}>ダークモード</Text>
      <Switch
        value={isDark}
        onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')}
        trackColor={{ false: '#b9b9bd', true: '#9dbcf8' }}
        thumbColor="#ffffff"
        ios_backgroundColor="#b9b9bd"
      />
    </View>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
  );

  const roleLabel = getStoreRoleLabel(userInfo?.role);
  const canUseAdminMenu = permissionsVerified && isStoreAdminRole(userInfo?.role);
  const canUseStaffFilterSearch = permissionsVerified && userInfo?.role === 'staff';
  const canEditStoreName = permissionsVerified && userInfo?.role === 'owner' && Boolean(userInfo?.storeId);
  const ownsAnyStore = (userInfo?.stores ?? []).some(store => store.role === 'owner');
  const canAddStore = permissionsVerified && ownsAnyStore;
  const avatarStorageUrls = useMemo(
    () => [userInfo?.avatarUrl],
    [userInfo?.avatarUrl]
  );
  const resolveAvatarStorageUrl = useSignedStorageUrlResolver('avatars', avatarStorageUrls);

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* 背景オーバーレイ */}
        <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        {/* ドロワー本体 */}
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }], backgroundColor: colors.background }]}>
          <SafeAreaView style={styles.drawerInner}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* ユーザーヘッダー */}
              <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
                <View style={styles.profileRow}>
                  <TouchableOpacity
                    style={styles.profileInfoButton}
                    onPress={() => setStoreInfoVisible(true)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="店舗情報を見る"
                  >
                    {userInfo?.avatarUrl ? (
                      <Image
                        source={{ uri: resolveAvatarStorageUrl(userInfo.avatarUrl) }}
                        style={styles.avatar}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#2a2a2a' : '#f2f2f2' }]}>
                        <Ionicons name="person" size={30} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.profileTextBlock}>
                      <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                        {userInfo?.displayName ?? '読み込み中...'}
                      </Text>
                      <View style={styles.profileHintRow}>
                        <Text style={[styles.profileHintText, { color: colors.textMuted }]}>
                          店舗情報を見る
                        </Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.closeButton, { backgroundColor: isDark ? colors.surface2 : '#F7F7F7' }]}
                    onPress={onClose}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="閉じる"
                  >
                    <Ionicons name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* メニューコンテンツ */}
              <View style={styles.menuContent}>
                <SectionTitle title="メニュー" />
                <View style={[styles.menuGroup, { backgroundColor: colors.surface }]}>
                  <MenuItem
                    icon="images-outline"
                    label="ギャラリー"
                    onPress={() => navigate('/gallery')}
                    iconColor="#4F35FF"
                    iconBackground={isDark ? '#302a54' : '#F2EEFF'}
                  />
                  <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                  <MenuItem
                    icon="grid-outline"
                    label="自分の投稿"
                    onPress={() => navigate('/my-posts')}
                    iconColor="#1F7AE0"
                    iconBackground={isDark ? '#18304c' : '#EAF3FF'}
                  />
                  <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                  {canUseStaffFilterSearch && (
                    <>
                      <MenuItem
                        icon="search-outline"
                        label="フィルタ検索"
                        onPress={() => navigate('/admin/filter-search')}
                        iconColor="#E07B00"
                        iconBackground={isDark ? '#3d2c00' : '#FFF4E0'}
                      />
                      <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                    </>
                  )}
                  <MenuItem
                    icon="add-circle-outline"
                    label="新規投稿"
                    onPress={() => navigate('/post/create')}
                    iconColor="#00A6C7"
                    iconBackground={isDark ? '#123a3d' : '#E7FAF9'}
                  />
                </View>

                <SectionTitle title="アカウント" />
                <View style={[styles.menuGroup, { backgroundColor: colors.surface }]}>
                  <MenuItem
                    icon="person-outline"
                    label="プロフィール編集"
                    onPress={() => navigate('/(tabs)/profile')}
                    iconColor="#4F35FF"
                    iconBackground={isDark ? '#302a54' : '#F2EEFF'}
                  />
                  <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                  <MenuItem
                    icon="lock-closed-outline"
                    label="パスワード変更"
                    onPress={() => navigate('/reset-password')}
                    iconColor="#1F7AE0"
                    iconBackground={isDark ? '#18304c' : '#EAF3FF'}
                  />
                </View>

                {canUseAdminMenu && (
                  <>
                    <SectionTitle title="管理" />
                    <View style={[styles.menuGroup, { backgroundColor: colors.surface }]}>
                      <MenuItem
                        icon="search-outline"
                        label="フィルタ検索"
                        onPress={() => navigate('/admin/filter-search')}
                        iconColor="#E07B00"
                        iconBackground={isDark ? '#3d2c00' : '#FFF4E0'}
                      />
                      <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                      <MenuItem
                        icon="bar-chart-outline"
                        label="投稿集計"
                        onPress={() => navigate('/admin/statistics')}
                        iconColor="#0E8F83"
                        iconBackground={isDark ? '#0b332f' : '#E7F7F5'}
                      />
                      <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                      <MenuItem
                        icon="people-outline"
                        label="スタッフ一覧管理"
                        onPress={() => navigate('/admin/staff-list')}
                        iconColor="#C0392B"
                        iconBackground={isDark ? '#2e0f0f' : '#FDECEA'}
                      />
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.logoutButton, { backgroundColor: '#2196F3', borderColor: '#2196F3' }]}
                  onPress={handleLogout}
                  activeOpacity={0.72}
                >
                  <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
                  <Text style={[styles.logoutText, { color: '#FFFFFF' }]}>ログアウト</Text>
                </TouchableOpacity>

                <SectionTitle title="その他" />
                <View style={[styles.menuGroup, { backgroundColor: colors.surface }]}>
                  <MenuItem
                    icon="help-circle-outline"
                    label="ヘルプ・使い方"
                    onPress={() => Alert.alert('ヘルプ・使い方', 'この機能は準備中です。')}
                    iconColor={colors.text}
                    iconBackground={isDark ? '#2a2a2a' : '#f7f7f7'}
                  />
                  <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                  <MenuItem
                    icon="mail-outline"
                    label="お問い合わせ"
                    onPress={() => Alert.alert('お問い合わせ', 'この機能は準備中です。')}
                    iconColor={colors.text}
                    iconBackground={isDark ? '#2a2a2a' : '#f7f7f7'}
                  />
                  <View style={[styles.itemDivider, { backgroundColor: colors.borderLight }]} />
                  <ThemeToggleItem />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>

        <Modal
          visible={storeInfoVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setStoreInfoVisible(false)}
        >
          <View style={styles.infoModalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setStoreInfoVisible(false)}
            />
            <View style={[styles.infoModalCard, { backgroundColor: colors.surface }]}>
              <View style={styles.infoModalHeader}>
                <View>
                  <Text style={[styles.infoModalTitle, { color: colors.text }]}>店舗情報</Text>
                  <Text style={[styles.infoModalSubtitle, { color: colors.textSecondary }]}>
                    {canAddStore
                      ? '表示店舗の切り替え、参加、追加ができます'
                      : canUseAdminMenu
                      ? '店舗番号を確認・コピーできます'
                      : '所属店舗の情報です'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.infoCloseButton, { backgroundColor: colors.surface2 }]}
                  onPress={() => setStoreInfoVisible(false)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="店舗情報を閉じる"
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={[styles.infoRow, { borderColor: colors.borderLight }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>店舗名</Text>
                {editingStoreName ? (
                  <View style={styles.storeNameEditBlock}>
                    <TextInput
                      style={[
                        styles.storeNameInput,
                        {
                          color: colors.text,
                          borderColor: colors.borderLight,
                          backgroundColor: colors.surface2,
                        },
                      ]}
                      value={storeNameDraft}
                      onChangeText={setStoreNameDraft}
                      placeholder="店舗名"
                      placeholderTextColor={colors.textMuted}
                      maxLength={80}
                      autoFocus
                      editable={!storeNameUpdating}
                      returnKeyType="done"
                      onSubmitEditing={handleSaveStoreName}
                    />
                    <View style={styles.storeNameActionRow}>
                      <TouchableOpacity
                        style={[styles.storeNameSecondaryButton, { borderColor: colors.borderLight }]}
                        onPress={handleCancelStoreNameEdit}
                        activeOpacity={0.72}
                        disabled={storeNameUpdating}
                      >
                        <Text style={[styles.storeNameSecondaryButtonText, { color: colors.textSecondary }]}>
                          キャンセル
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.storeNamePrimaryButton, storeNameUpdating && styles.storeNameButtonDisabled]}
                        onPress={handleSaveStoreName}
                        activeOpacity={0.78}
                        disabled={storeNameUpdating}
                      >
                        {storeNameUpdating ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.storeNamePrimaryButtonText}>保存</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.storeNameValueRow}>
                    <Text style={[styles.infoValue, styles.storeNameValueText, { color: colors.text }]} numberOfLines={1}>
                      {userInfo?.storeName ?? '店舗未所属'}
                    </Text>
                    {canEditStoreName ? (
                      <TouchableOpacity
                        style={styles.storeNameEditButton}
                        onPress={handleStartStoreNameEdit}
                        activeOpacity={0.72}
                        accessibilityRole="button"
                        accessibilityLabel="店舗名を変更"
                      >
                        <Ionicons name="create-outline" size={15} color="#2196F3" />
                        <Text style={styles.storeNameEditButtonText}>変更</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
              <View style={[styles.infoRow, { borderColor: colors.borderLight }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>あなたの役割</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{roleLabel}</Text>
              </View>
              <View style={[styles.storeSwitcher, { borderColor: colors.borderLight }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>表示する店舗</Text>
                <View style={styles.storeOptionList}>
                  {(userInfo?.stores ?? []).map(store => {
                    const isActive = store.id === userInfo?.storeId;
                    const isSwitching = store.id === switchingStoreId;

                    return (
                      <TouchableOpacity
                        key={store.id}
                        style={[
                          styles.storeOption,
                          {
                            backgroundColor: isActive
                              ? 'rgba(33, 150, 243, 0.10)'
                              : colors.surface2,
                            borderColor: isActive ? '#2196F3' : colors.borderLight,
                          },
                        ]}
                        onPress={() => handleSwitchStore(store.id)}
                        activeOpacity={0.72}
                        disabled={isActive || switchingStoreId !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`${store.name}へ切り替え`}
                      >
                        <View style={styles.storeOptionText}>
                          <Text style={[styles.storeOptionName, { color: colors.text }]} numberOfLines={1}>
                            {store.name}
                          </Text>
                          <Text style={[styles.storeOptionRole, { color: colors.textMuted }]}>
                            {getStoreRoleLabel(store.role)}
                          </Text>
                        </View>
                        {isSwitching ? (
                          <ActivityIndicator size="small" color="#2196F3" />
                        ) : (
                          <Ionicons
                            name={isActive ? 'checkmark-circle' : 'chevron-forward'}
                            size={21}
                            color={isActive ? '#2196F3' : colors.textMuted}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.storeActionRow}>
                  <TouchableOpacity
                    style={[styles.storeActionButton, { borderColor: colors.borderLight }]}
                    onPress={handleJoinAnotherStore}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityLabel="店舗に参加する"
                  >
                    <Ionicons name="people-outline" size={19} color="#2196F3" />
                    <Text style={[styles.storeActionButtonText, { color: '#2196F3' }]} numberOfLines={1}>
                      店舗に参加
                    </Text>
                  </TouchableOpacity>
                  {canAddStore ? (
                    <TouchableOpacity
                      style={[styles.storeActionButton, { borderColor: colors.borderLight }]}
                      onPress={handleCreateAnotherStore}
                      activeOpacity={0.72}
                      accessibilityRole="button"
                      accessibilityLabel="店舗を追加する"
                    >
                      <Ionicons name="storefront-outline" size={19} color="#8B5CF6" />
                      <Text style={[styles.storeActionButtonText, { color: '#8B5CF6' }]} numberOfLines={1}>
                        店舗を追加
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              {canUseAdminMenu && (
                <View style={styles.inviteCodeBlock}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>店舗番号</Text>
                  <View style={styles.inviteCodeRow}>
                    <Text
                      style={[styles.inviteCodeText, { color: colors.text }]}
                      selectable
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {userInfo?.storeInviteCode ?? '取得中'}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.copyButton,
                        {
                          backgroundColor: userInfo?.storeInviteCode ? '#2196F3' : colors.surface2,
                        },
                      ]}
                      onPress={handleCopyStoreNumber}
                      activeOpacity={0.78}
                      disabled={!userInfo?.storeInviteCode}
                      accessibilityRole="button"
                      accessibilityLabel="店舗番号をコピー"
                    >
                      <Ionicons
                        name={inviteCopied ? 'checkmark' : 'copy-outline'}
                        size={16}
                        color={userInfo?.storeInviteCode ? '#FFFFFF' : colors.textMuted}
                      />
                      <Text style={[styles.copyButtonText, { color: userInfo?.storeInviteCode ? '#FFFFFF' : colors.textMuted }]}>
                        {inviteCopied ? 'コピー済み' : 'コピー'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.inviteCodeHelp, { color: inviteCopied ? '#1E9B50' : colors.textMuted }]}>
                    {inviteCopied ? '店舗番号をコピーしました' : 'オーナー・管理者がスタッフへ共有できます'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 20,
    overflow: 'hidden',
  },
  drawerInner: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
    elevation: 5,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileInfoButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  profileHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 2,
  },
  profileHintText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  menuContent: {
    paddingTop: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    paddingHorizontal: 2,
    marginBottom: 8,
    marginTop: 10,
  },
  menuGroup: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: 6,
    gap: 12,
  },
  menuIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
  },
  itemDivider: {
    height: 1,
    marginLeft: 50,
  },
  logoutButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  themeItem: {
    minHeight: 50,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  infoModalCard: {
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 18,
  },
  infoModalTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
  },
  infoModalSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 5,
    letterSpacing: 0,
  },
  infoCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    borderTopWidth: 1,
    paddingTop: 14,
    paddingBottom: 13,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  storeNameValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  storeNameValueText: {
    flex: 1,
    minWidth: 0,
  },
  storeNameEditButton: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(33, 150, 243, 0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  storeNameEditButtonText: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: '800',
  },
  storeNameEditBlock: {
    gap: 10,
  },
  storeNameInput: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  storeNameActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  storeNameSecondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeNameSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  storeNamePrimaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
  },
  storeNamePrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  storeNameButtonDisabled: {
    opacity: 0.72,
  },
  storeSwitcher: {
    borderTopWidth: 1,
    paddingTop: 14,
    paddingBottom: 4,
  },
  storeOptionList: {
    gap: 8,
  },
  storeOption: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storeOptionText: {
    flex: 1,
    minWidth: 0,
  },
  storeOptionName: {
    fontSize: 15,
    fontWeight: '700',
  },
  storeOptionRole: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  storeActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  storeActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  storeActionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  inviteCodeBlock: {
    marginTop: 4,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(33, 150, 243, 0.08)',
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteCodeText: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 26,
  },
  copyButton: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  inviteCodeHelp: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    letterSpacing: 0,
  },
});
