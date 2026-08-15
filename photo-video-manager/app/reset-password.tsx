import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/lib/supabase';
import { gradients, borderRadius, typography } from '@/lib/theme';
import { lightTap, successFeedback, errorFeedback } from '@/lib/haptics';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import GradientButton from '@/components/GradientButton';
import { useAppTheme } from '@/lib/ThemeContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { fromRecovery } = useLocalSearchParams<{ fromRecovery?: string }>();
  const { colors } = useAppTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [reduceMotion, setReduceMotion] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const validatePassword = (password: string): { isValid: boolean; message: string } => {
    if (password.length < 6) {
      return { isValid: false, message: 'パスワードは6文字以上で入力してください。' };
    }
    if (!/[0-9]/.test(password)) {
      return { isValid: false, message: 'パスワードには数字を含めてください。' };
    }
    return { isValid: true, message: '' };
  };

  const handleSubmit = async () => {
    const newErrors: { [key: string]: string } = {};

    const passwordValidation = validatePassword(newPassword);
    if (!newPassword) {
      newErrors.newPassword = 'パスワードを入力してください';
    } else if (!passwordValidation.isValid) {
      newErrors.newPassword = passwordValidation.message;
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'パスワード（確認）を入力してください';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'パスワードが一致しません';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      errorFeedback();
      return;
    }

    setLoading(true);
    lightTap();

    try {
      await authService.updatePassword(newPassword);
      successFeedback();
      const isFromRecovery = fromRecovery === '1';
      Alert.alert(
        'パスワードを変更しました',
        isFromRecovery
          ? 'パスワードが正常に再設定されました。'
          : 'パスワードが正常に変更されました。',
        [{
          text: 'OK',
          onPress: () => {
            if (isFromRecovery) {
              router.replace('/(tabs)/history');
            } else {
              router.back();
            }
          },
        }]
      );
    } catch (error: any) {
      errorFeedback();
      Alert.alert('エラー', error?.message || 'パスワードの変更に失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              }
            ]}
          >
            {/* 戻るボタン */}
            {router.canGoBack() && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={[styles.backButtonText, { color: colors.text }]}>戻る</Text>
              </TouchableOpacity>
            )}

            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.screenTitle, { color: colors.text }]}>
                パスワードを変更
              </Text>
              <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
                {fromRecovery === '1'
                  ? '新しいパスワードを設定してください'
                  : '新しいパスワードを入力してください'}
              </Text>
            </View>

            {/* Form Card */}
            <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.formCardInner}>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  新しいパスワードを入力してください。
                </Text>

                <FloatingLabelInput
                  label="新しいパスワード"
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    if (errors.newPassword) setErrors(prev => ({ ...prev, newPassword: '' }));
                  }}
                  icon="lock-closed-outline"
                  error={errors.newPassword}
                  secureTextEntry={!showPassword}
                />

                <FloatingLabelInput
                  label="新しいパスワード（確認）"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: '' }));
                  }}
                  icon="lock-closed-outline"
                  error={errors.confirmPassword}
                  secureTextEntry={!showPassword}
                />

                <TouchableOpacity
                  style={styles.showPasswordButton}
                  onPress={() => {
                    lightTap();
                    setShowPassword(!showPassword);
                  }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={18}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.showPasswordText, { color: colors.textSecondary }]}>
                    {showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  </Text>
                </TouchableOpacity>

                <GradientButton
                  title={loading ? '変更中...' : 'パスワードを変更する'}
                  onPress={handleSubmit}
                  loading={loading}
                  gradient={gradients.salonBlue}
                  style={styles.submitButton}
                />
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
    marginBottom: 8,
    gap: 2,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 36,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  screenTitle: {
    ...typography.title1,
    textAlign: 'center',
    marginBottom: 8,
  },
  screenSubtitle: {
    ...typography.subhead,
    lineHeight: 22,
    textAlign: 'center',
  },
  formCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 8,
    overflow: 'hidden',
  },
  formCardInner: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 24,
  },
  description: {
    ...typography.subhead,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  showPasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginLeft: 4,
  },
  showPasswordText: {
    ...typography.footnote,
    marginLeft: 6,
  },
  submitButton: {
    marginTop: 8,
  },
});
