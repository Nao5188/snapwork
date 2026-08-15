import React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import Button from '@/components/Button';
import GradientButton from '@/components/GradientButton';
import { authService, storeService } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import { borderRadius, gradients, typography } from '@/lib/theme';
import { errorFeedback, lightTap, successFeedback } from '@/lib/haptics';

export default function RegisterCompleteScreen() {
  const router = useRouter();
  const { email, requiresEmailConfirmation } = useLocalSearchParams<{
    email?: string;
    requiresEmailConfirmation?: string;
  }>();
  const { colors, isDark } = useAppTheme();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const confirmationRequired = requiresEmailConfirmation !== '0';

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

  const handleGoToLogin = () => {
    lightTap();
    router.replace({
      pathname: '/login',
      params: {
        mode: 'signin',
        ...(email ? { email } : {}),
      },
    } as any);
  };

  const handleResendConfirmation = async () => {
    if (!email) {
      errorFeedback();
      Alert.alert('再送できません', 'メールアドレスを確認できませんでした。登録画面からもう一度お試しください。');
      return;
    }

    setResending(true);
    lightTap();

    try {
      await authService.resendSignUpConfirmation(email, Linking.createURL('login'));
      successFeedback();
      Alert.alert(
        '認証メールを再送しました',
        `${email} に認証メールを送信しました。メール内のリンクをタップしてください。`
      );
    } catch (error: any) {
      errorFeedback();
      const message = String(error?.message ?? '');
      const isRateLimited = (
        error?.code === 'over_email_send_rate_limit'
        || message.includes('rate limit')
        || message.includes('security purposes')
      );

      Alert.alert(
        '再送できませんでした',
        isRateLimited
          ? '短時間に複数回送信されています。しばらく待ってからもう一度お試しください。'
          : '認証メールの再送に失敗しました。通信状態を確認してもう一度お試しください。'
      );
    } finally {
      setResending(false);
    }
  };

  if (confirmationRequired) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.confirmationScroll}
          contentContainerStyle={styles.confirmationScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#18304c' : '#EAF3FF' }]}>
              <Ionicons name="mail-unread-outline" size={42} color="#2196F3" />
            </View>

            <Text style={[styles.title, { color: colors.text }]}>認証メールを確認してください</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              次のメールアドレスに認証メールを送信しました。
            </Text>
            {email ? (
              <Text style={[styles.email, { color: colors.text }]} selectable>
                {email}
              </Text>
            ) : null}

            <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                  受信した「メールアドレスを確認」メールを開きます。
                </Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                  メール内の認証リンクをタップして登録を完了します。
                </Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                  SalonCloudに戻り、登録したメールアドレスでログインします。
                </Text>
              </View>
            </View>

            <Text style={[styles.note, { color: colors.textMuted }]}>
              メールが届かない場合は、迷惑メールフォルダをご確認ください。受信まで数分かかることがあります。
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <GradientButton
            title="認証後にログイン"
            onPress={handleGoToLogin}
            gradient={gradients.salonBlue}
            style={styles.nextButton}
            testID="register-complete-login"
          />
          <Button
            title={resending ? '再送中...' : '認証メールを再送'}
            onPress={handleResendConfirmation}
            variant="outline"
            loading={resending}
            fullWidth
            style={styles.secondaryButton}
            testID="register-complete-resend"
          />
        </View>
      </SafeAreaView>
    );
  }

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
  confirmationScroll: {
    flex: 1,
  },
  confirmationScrollContent: {
    flexGrow: 1,
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
  email: {
    ...typography.headline,
    textAlign: 'center',
    marginTop: 10,
  },
  stepCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 28,
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  stepText: {
    ...typography.footnote,
    flex: 1,
    lineHeight: 20,
    paddingTop: 2,
  },
  note: {
    ...typography.caption1,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 18,
    paddingHorizontal: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 42,
  },
  nextButton: {
    borderRadius: borderRadius.md,
  },
  secondaryButton: {
    marginTop: 12,
  },
});
