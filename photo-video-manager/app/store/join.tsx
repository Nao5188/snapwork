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
import { authService, storeService } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import { borderRadius, gradients, shadows, typography } from '@/lib/theme';
import { errorFeedback, lightTap, successFeedback } from '@/lib/haptics';

const getJoinStoreErrorMessage = (error: any) => {
  const message = String(error?.message ?? '');

  if (error?.code === 'P0001' || message.includes('Invalid invite code')) {
    return '招待コードが正しくありません。店舗を作成したオーナーに確認してください。';
  }

  if (error?.code === '28000' || message.includes('Authentication required')) {
    return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '通信に失敗しました。時間をおいてもう一度お試しください。';
  }

  return '店舗への参加に失敗しました。招待コードを確認してもう一度お試しください。';
};

export default function JoinStoreScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const guardRoute = async () => {
      try {
        const { data: { user } } = await authService.getCurrentUser();
        if (!user) {
          router.replace('/login');
          return;
        }

        if (mounted) setChecking(false);
      } catch (guardError) {
        console.warn('Failed to verify join store state:', guardError);
        if (mounted) setChecking(false);
      }
    };

    guardRoute();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleJoinStore = async () => {
    const normalizedCode = inviteCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError('招待コードを入力してください');
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

      await storeService.joinStore(user.id, normalizedCode);
      successFeedback();
      Alert.alert('参加しました', '参加した店舗へ切り替えました。', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/history'),
        },
      ]);
    } catch (joinError: any) {
      console.error('Join store error:', joinError);
      errorFeedback();
      Alert.alert(
        'エラー',
        getJoinStoreErrorMessage(joinError)
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
            <View style={styles.header}>
              <View style={[styles.headerIcon, { backgroundColor: isDark ? '#18304c' : '#EAF3FF' }]}>
                <Ionicons name="people-outline" size={34} color="#1F7AE0" />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>店舗に参加する</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                オーナーまたは管理者から受け取った招待コードを入力してください
              </Text>
            </View>

            <FloatingLabelInput
              label="招待コード"
              value={inviteCode}
              onChangeText={(text) => {
                setInviteCode(text.toUpperCase());
                if (error) setError('');
              }}
              icon="key-outline"
              error={error}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleJoinStore}
              testID="store-join-code-input"
            />

            <Text style={[styles.helperText, { color: colors.textMuted }]}>
              招待コードは店舗を作成したオーナーから共有されます。
            </Text>

            <GradientButton
              title={loading ? '参加中...' : '参加する'}
              loading={loading}
              onPress={handleJoinStore}
              gradient={gradients.salonBlue}
              style={styles.primaryButton}
              testID="store-join-submit"
            />
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
  helperText: {
    ...typography.footnote,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 22,
  },
  primaryButton: {
    width: '100%',
    borderRadius: borderRadius.md,
  },
});
