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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authService, supabase } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.75;

interface DrawerMenuProps {
  isVisible: boolean;
  onClose: () => void;
}

interface UserInfo {
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

export default function DrawerMenu({ isVisible, onClose }: DrawerMenuProps) {
  const router = useRouter();
  const { isDark, setThemeMode, colors } = useAppTheme();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

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
        setUserInfo({
          displayName: data.display_name || data.username || 'ユーザー',
          username: data.username || '',
          avatarUrl: data.avatar_url || null,
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
            router.replace('/login');
          },
        },
      ]
    );
  };

  const MenuItem = ({
    icon,
    label,
    onPress,
    disabled,
    badge,
    danger,
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    badge?: string;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.menuItem, disabled && styles.menuItemDisabled, { backgroundColor: colors.surface }]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.65}
    >
      <View style={[styles.menuIconWrapper, { backgroundColor: colors.surface2 }, danger && styles.menuIconWrapperDanger]}>
        <Ionicons
          name={icon as any}
          size={20}
          color={disabled ? colors.textMuted : danger ? '#FF3B30' : colors.text}
        />
      </View>
      <Text style={[
        styles.menuItemText,
        { color: colors.text },
        disabled && { color: colors.textMuted },
        danger && styles.menuItemTextDanger,
      ]}>
        {label}
      </Text>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.surface2 }]}>
          <Text style={[styles.badgeText, { color: colors.textMuted }]}>{badge}</Text>
        </View>
      ) : (
        !disabled && <Ionicons name="chevron-forward" size={15} color={colors.border} />
      )}
    </TouchableOpacity>
  );

  const ThemeToggleItem = () => (
    <View style={[styles.menuItem, { backgroundColor: colors.surface }]}>
      <View style={[styles.menuIconWrapper, { backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5' }]}>
        <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? '#a78bfa' : '#f59e0b'} />
      </View>
      <Text style={[styles.menuItemText, { color: colors.text }]}>ダークモード</Text>
      <Switch
        value={isDark}
        onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')}
        trackColor={{ false: '#e5e5e5', true: '#a78bfa' }}
        thumbColor={isDark ? '#7c3aed' : '#ffffff'}
        ios_backgroundColor="#e5e5e5"
      />
    </View>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
  );

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
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }], backgroundColor: colors.surface }]}>
          <SafeAreaView style={styles.drawerInner}>
            {/* ユーザーヘッダー */}
            <View style={styles.userHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>

              {userInfo?.avatarUrl ? (
                <Image source={{ uri: userInfo.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={30} color="#fff" />
                </View>
              )}
              <Text style={styles.displayName} numberOfLines={1}>
                {userInfo?.displayName ?? '読み込み中...'}
              </Text>
            </View>

            {/* メニューコンテンツ */}
            <View style={styles.menuContent}>
              {/* ナビゲーション */}
              <SectionTitle title="メニュー" />
              <MenuItem
                icon="images-outline"
                label="ギャラリー"
                onPress={() => navigate('/gallery')}
              />
              <MenuItem
                icon="grid-outline"
                label="自分の投稿"
                onPress={() => navigate('/my-posts')}
              />
              <MenuItem
                icon="add-circle-outline"
                label="新規投稿"
                onPress={() => navigate('/post/create')}
              />

              <View style={styles.divider} />

              {/* アカウント */}
              <SectionTitle title="アカウント" />
              <MenuItem
                icon="person-outline"
                label="プロフィール編集"
                onPress={() => navigate('/(tabs)/profile')}
              />
              <MenuItem
                icon="lock-closed-outline"
                label="パスワード変更"
                onPress={() => navigate('/reset-password')}
              />
              <MenuItem
                icon="log-out-outline"
                label="ログアウト"
                onPress={handleLogout}
                danger
              />

              <View style={styles.divider} />

              {/* 設定 */}
              <SectionTitle title="設定" />
              <ThemeToggleItem />
            </View>
          </SafeAreaView>
        </Animated.View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 20,
  },
  drawerInner: {
    flex: 1,
  },
  userHeader: {
    backgroundColor: '#444444',
    paddingTop: 48,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'flex-start',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  displayName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  menuContent: {
    flex: 1,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 14,
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconWrapperDanger: {
    backgroundColor: '#fff0ef',
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#222',
  },
  menuItemTextDisabled: {
    color: '#bbb',
  },
  menuItemTextDanger: {
    color: '#FF3B30',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 20,
    marginTop: 8,
  },
  badge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
  },
});
