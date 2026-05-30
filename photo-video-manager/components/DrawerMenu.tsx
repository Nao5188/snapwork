import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  Switch,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authService, storeService, supabase } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import { errorFeedback, lightTap, successFeedback } from '@/lib/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.76, 340);

interface DrawerMenuProps {
  isVisible: boolean;
  onClose: () => void;
}

interface UserInfo {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  storeName: string | null;
  storeInviteCode: string | null;
  role: 'owner' | 'staff' | null;
}

export default function DrawerMenu({ isVisible, onClose }: DrawerMenuProps) {
  const router = useRouter();
  const { isDark, setThemeMode, colors } = useAppTheme();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [storeInfoVisible, setStoreInfoVisible] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const loadUserInfo = async () => {
    try {
      const { data: { user } } = await authService.getCurrentUser();
      if (!user) return;

      const { data } = await supabase
        .from('users')
        .select('username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (data) {
        const memberships = await storeService.getMyMemberships(user.id);
        const storeName = memberships[0]?.store?.name ?? null;

        setUserInfo({
          displayName: data.display_name || data.username || 'ユーザー',
          username: data.username || '',
          avatarUrl: data.avatar_url || null,
          storeName,
          storeInviteCode: memberships[0]?.store?.invite_code ?? null,
          role: memberships[0]?.role ?? null,
        });
      }
    } catch (error) {
      console.error('DrawerMenu: ユーザー情報取得エラー', error);
    }
  };

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

  const handleCopyInviteCode = async () => {
    const inviteCode = userInfo?.storeInviteCode;

    if (!inviteCode) {
      errorFeedback();
      Alert.alert('コピーできません', '招待コードがまだ発行されていません。');
      return;
    }

    try {
      lightTap();
      Clipboard.setString(inviteCode);
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

  const roleLabel = userInfo?.role === 'owner'
    ? 'オーナー'
    : userInfo?.role === 'staff'
      ? 'スタッフ'
      : '未設定';

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
                      <Image source={{ uri: userInfo.avatarUrl }} style={styles.avatar} />
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

                {userInfo?.role === 'owner' && (
                  <>
                    <SectionTitle title="管理者" />
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
                        icon="albums-outline"
                        label="スタッフ別アルバム"
                        onPress={() => navigate('/admin/staff-album')}
                        iconColor="#1E9B50"
                        iconBackground={isDark ? '#0f2e1a' : '#E8F8EF'}
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
                  style={[styles.logoutButton, { backgroundColor: isDark ? '#2a1717' : '#FFF4F3', borderColor: isDark ? '#5a2927' : '#FFD4D0' }]}
                  onPress={handleLogout}
                  activeOpacity={0.72}
                >
                  <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
                  <Text style={styles.logoutText}>ログアウト</Text>
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
                    スタッフ招待に使う情報です
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
                <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
                  {userInfo?.storeName ?? '店舗未所属'}
                </Text>
              </View>
              <View style={[styles.infoRow, { borderColor: colors.borderLight }]}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>あなたの役割</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{roleLabel}</Text>
              </View>
              <View style={styles.inviteCodeBlock}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>招待コード</Text>
                <View style={styles.inviteCodeRow}>
                  <Text
                    style={[styles.inviteCodeText, { color: colors.text }]}
                    selectable
                  >
                    {userInfo?.storeInviteCode ?? '未発行'}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.copyButton,
                      {
                        backgroundColor: inviteCopied ? '#E8F8EF' : '#2196F3',
                      },
                    ]}
                    onPress={handleCopyInviteCode}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel="招待コードをコピー"
                  >
                    <Ionicons
                      name={inviteCopied ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={inviteCopied ? '#1E9B50' : '#FFFFFF'}
                    />
                    <Text style={[styles.copyButtonText, { color: inviteCopied ? '#1E9B50' : '#FFFFFF' }]}>
                      {inviteCopied ? 'コピー済み' : 'コピー'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.inviteCodeHelp, { color: inviteCopied ? '#1E9B50' : colors.textMuted }]}>
                  {inviteCopied ? '招待コードをコピーしました' : 'スタッフへ共有して店舗に参加してもらえます'}
                </Text>
              </View>
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
    color: '#FF3B30',
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
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
