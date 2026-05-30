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

export default function CreateStoreScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [createdStore, setCreatedStore] = useState<Store | null>(null);

  useEffect(() => {
    let mounted = true;

    const guardRoute = async () => {
      try {
        const { data: { user } } = await authService.getCurrentUser();
        if (!user) {
          router.replace('/login');
          return;
        }

        const hasMembership = await storeService.hasMembership(user.id);
        if (!mounted) return;

        if (hasMembership) {
          router.replace('/(tabs)/history');
          return;
        }

        setChecking(false);
      } catch (guardError) {
        console.warn('Failed to verify create store state:', guardError);
        if (mounted) setChecking(false);
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
        createError?.message || '店舗の作成に失敗しました。もう一度お試しください。'
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
      <Text style={[styles.title, { color: colors.text }]}>店舗の作成が完了しました！</Text>
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
          <Text style={[styles.inviteCode, { color: colors.text }]} selectable>
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
                  <Text style={[styles.title, { color: colors.text }]}>店舗を作成する</Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    店舗名を入力して、スタッフ招待用のコードを発行します
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
                  title={loading ? '作成中...' : '作成する'}
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
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1.5,
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
