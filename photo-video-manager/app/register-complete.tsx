import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import GradientButton from '@/components/GradientButton';
import { authService, storeService } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import { borderRadius, gradients, typography } from '@/lib/theme';
import { errorFeedback, lightTap } from '@/lib/haptics';

export default function RegisterCompleteScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { colors, isDark } = useAppTheme();
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    setLoading(true);
    lightTap();

    try {
      const { data: { user } } = await authService.getCurrentUser();

      if (!user) {
        router.replace({ pathname: '/login', params: { mode: 'signin' } } as any);
        return;
      }

      const hasMembership = await storeService.hasMembership(user.id);
      router.replace((hasMembership ? '/(tabs)/history' : '/store-onboarding') as any);
    } catch (error) {
      console.warn('Failed to continue after registration:', error);
      errorFeedback();
      router.replace({ pathname: '/login', params: { mode: 'signin' } } as any);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2f2545' : '#F3E8FF' }]}>
          <Ionicons name="checkmark" size={44} color="#7D4ED7" />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>登録が完了しました</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {email
            ? `${email} でアカウントを作成しました。`
            : 'アカウントを作成しました。'}
          {'\n'}続いて利用方法を選択してください。
        </Text>
      </View>

      <View style={styles.footer}>
        <GradientButton
          title={loading ? '確認中...' : '次へ'}
          onPress={handleNext}
          loading={loading}
          gradient={gradients.salonBlue}
          style={styles.nextButton}
          testID="register-complete-next"
        />
        {loading && (
          <ActivityIndicator style={styles.loadingIndicator} color="#1976D2" />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  title: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    ...typography.subhead,
    textAlign: 'center',
    lineHeight: 23,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 42,
  },
  nextButton: {
    borderRadius: borderRadius.md,
  },
  loadingIndicator: {
    marginTop: 12,
  },
});
