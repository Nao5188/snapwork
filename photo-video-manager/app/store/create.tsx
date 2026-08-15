import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import FloatingLabelInput from '@/components/FloatingLabelInput';
import GradientButton from '@/components/GradientButton';
import { authService, Store, storeService } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import { borderRadius, gradients, shadows, typography } from '@/lib/theme';
import { errorFeedback, lightTap, successFeedback } from '@/lib/haptics';

const getCreateStoreErrorMessage = (error: any) => {
  const message = String(error?.message ?? '');

  if (error?.code === '42501' || message.includes('Only store owners can create additional stores')) {
    return '店舗を追加できるのはオーナーのみです。';
  }

  if (error?.code === '28000' || message.includes('Authentication required')) {
    return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
  }

  if (error?.code === '22023' || message.includes('Store name is required')) {
    return '店舗名を入力してください。';
  }

  if (error?.code === 'PGRST202' || message.includes('create_store_with_owner')) {
    return 'DB更新が必要です。Supabaseで database/secure_store_invite_codes.sql を実行してください。';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '通信に失敗しました。時間をおいてもう一度お試しください。';
  }

  return message || '店舗の作成に失敗しました。もう一度お試しください。';
};

export default function CreateStoreScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [createdStore, setCreatedStore] = useState<Store | null>(null);
  const [isAdditionalStore, setIsAdditionalStore] = useState(false);

  useEffect(() => {
    let mounted = true;

    const guardRoute = async () => {
      try {
        const { data: { user } } = await authService.getCurrentUser();
        if (!user) {
          router.replace('/login');
          return;
        }

        const memberships = await storeService.getMyMemberships(user.id);
        if (!mounted) return;

        if (memberships.length > 0) {
          const canCreateAdditionalStore = memberships.some(membership => membership.role === 'owner');
          if (!canCreateAdditionalStore) {
            setChecking(false);
            Alert.alert(
              '店舗を追加できません',
              '店舗を追加できるのはオーナーのみです。',
              [{ text: 'OK', onPress: () => router.replace('/(tabs)/history') }]
            );
            return;
          }

          setIsAdditionalStore(true);
        } else {
          setIsAdditionalStore(false);
        }

        setChecking(false);
      } catch (guardError) {
        console.warn('Failed to verify create store state:', guardError);
        if (mounted) {
          setChecking(false);
          Alert.alert(
            '確認できませんでした',
            '店舗への所属状態を確認できませんでした。時間をおいてもう一度お試しください。',
            [{ text: 'OK', onPress: () => router.replace('/(tabs)/history') }]
          );
        }
      }
    };

    guardRoute();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleCreateStore = async () => {
    const trimmedName = storeName.trim();
    if (!trimmedName) {
      setError('店舗名を入力してください');
      errorFeedback();
      return;
    }

    setLoading(true);
    setError('');
    lightTap();

    try {
      const { data: { user } } = await authService.getCurrentUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const store = await storeService.createStore(user.id, trimmedName);
      setCreatedStore(store);
      successFeedback();
    } catch (createError: any) {
      console.error('Create store error:', createError);
      errorFeedback();
      Alert.alert(
        'エラー',
        getCreateStoreErrorMessage(createError)
      );
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  const renderSuccess = () => (
    <View style={styles.successContent}>
      <View style={[styles.successIcon, { backgroundColor: isDark ? '#2f2545' : '#F3E8FF' }]}>
        <Ionicons name="checkmark" size={36} color="#8B5CF6" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>
        {isAdditionalStore ? '店舗の追加が完了しました！' : '店舗の作成が完了しました！'}
      </Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        あなたはこの店舗のオーナーです
      </Text>

      <View style={[styles.inviteCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <View style={styles.inviteRow}>
          <Text style={[styles.inviteLabel, { color: colors.textSecondary }]}>店舗名</Text>
          <Text style={[styles.inviteValue, { color: colors.text }]}>{createdStore?.name}</Text>
        </View>
        <View style={styles.inviteDivider} />
        <View style={styles.inviteRow}>
          <Text style={[styles.inviteLabel, { color: colors.textSecondary }]}>招待コード</Text>
          <Text
            style={[styles.inviteCode, { color: colors.text }]}
            selectable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {createdStore?.invite_code}
          </Text>
        </View>
      </View>

      <Text style={[styles.helperText, { color: colors.textMuted }]}>
        このコードをスタッフに共有すると、店舗メンバーとして参加できます。
      </Text>

      <GradientButton
        title="通常画面へ"
        onPress={() => router.replace('/(tabs)/history')}
        gradient={gradients.salonBlue}
        style={styles.primaryButton}
        testID="store-create-go-tabs"
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              lightTap();
              router.back();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="戻る"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {createdStore ? (
              renderSuccess()
            ) : (
              <>
                <View style={styles.header}>
                  <View style={[styles.headerIcon, { backgroundColor: isDark ? '#2f2545' : '#F3E8FF' }]}>
                    <Ionicons name="storefront-outline" size={32} color="#8B5CF6" />
                  </View>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {isAdditionalStore ? '店舗を追加する' : '店舗を作成する'}
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    {isAdditionalStore
                      ? '新しい店舗名を入力して、スタッフ招待用のコードを発行します'
                      : '店舗名を入力して、スタッフ招待用のコードを発行します'}
                  </Text>
                </View>

                <FloatingLabelInput
                  label="店舗名"
                  value={storeName}
                  onChangeText={(text) => {
                    setStoreName(text);
                    if (error) setError('');
                  }}
                  icon="business-outline"
                  error={error}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleCreateStore}
                  testID="store-create-name-input"
                />

                <GradientButton
                  title={loading
                    ? (isAdditionalStore ? '追加中...' : '作成中...')
                    : (isAdditionalStore ? '追加する' : '作成する')}
                  loading={loading}
                  onPress={handleCreateStore}
                  gradient={gradients.salonBlue}
                  style={styles.primaryButton}
                  testID="store-create-submit"
                />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 132,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: 24,
    ...shadows.medium,
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  headerIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    ...typography.subhead,
    textAlign: 'center',
    lineHeight: 22,
  },
  successContent: {
    alignItems: 'center',
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  inviteCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 18,
    marginTop: 22,
    marginBottom: 14,
  },
  inviteRow: {
    gap: 6,
  },
  inviteLabel: {
    ...typography.caption1,
    fontWeight: '600',
  },
  inviteValue: {
    ...typography.headline,
  },
  inviteCode: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 28,
  },
  inviteDivider: {
    height: 1,
    backgroundColor: '#dddddd',
    marginVertical: 16,
    opacity: 0.7,
  },
  helperText: {
    ...typography.footnote,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryButton: {
    width: '100%',
    borderRadius: borderRadius.md,
  },
});
