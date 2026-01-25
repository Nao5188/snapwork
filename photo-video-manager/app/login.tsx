import React, { useState, useEffect, useRef } from 'react';
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
  Dimensions,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authService, userService } from '../lib/supabase';
import { storageService } from '../lib/storage';
import { colors, gradients, borderRadius, shadows, typography } from '../lib/theme';
import { lightTap, successFeedback, errorFeedback } from '../lib/haptics';
import FloatingLabelInput from '../components/FloatingLabelInput';
import GradientButton from '../components/GradientButton';
import AnimatedButton from '../components/AnimatedButton';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    username: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [reduceMotion, setReduceMotion] = useState(false);

  // アニメーション
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      logoScale.setValue(1);
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
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduceMotion]);

  useEffect(() => {
    const loadRememberMeSettings = async () => {
      try {
        const rememberMeData = await storageService.getRememberMe();
        if (rememberMeData) {
          setRememberMe(rememberMeData.rememberMe);
          setFormData(prev => ({
            ...prev,
            email: rememberMeData.email,
          }));
        }
      } catch (error) {
        console.error('Failed to load remember me settings:', error);
      }
    };

    loadRememberMeSettings();
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // エラーをクリア
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): { isValid: boolean; message: string } => {
    if (password.length < 8) {
      return { isValid: false, message: 'パスワードは8文字以上で入力してください。' };
    }
    if (!/[a-z]/.test(password)) {
      return { isValid: false, message: 'パスワードには小文字を含めてください。' };
    }
    if (!/[A-Z]/.test(password)) {
      return { isValid: false, message: 'パスワードには大文字を含めてください。' };
    }
    if (!/[0-9]/.test(password)) {
      return { isValid: false, message: 'パスワードには数字を含めてください。' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return { isValid: false, message: 'パスワードには特殊文字（!@#$%^&*等）を含めてください。' };
    }
    return { isValid: true, message: '' };
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.email) {
      newErrors.email = 'メールアドレスを入力してください';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = '正しいメールアドレスを入力してください';
    }

    if (!formData.password) {
      newErrors.password = 'パスワードを入力してください';
    } else if (isSignUp) {
      const passwordValidation = validatePassword(formData.password);
      if (!passwordValidation.isValid) {
        newErrors.password = passwordValidation.message;
      }
    }

    if (isSignUp) {
      if (!formData.displayName) {
        newErrors.displayName = '表示名を入力してください';
      }
      if (!formData.username) {
        newErrors.username = 'ユーザー名を入力してください';
      } else if (formData.username.length < 3) {
        newErrors.username = 'ユーザー名は3文字以上で入力してください';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'パスワードが一致しません';
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      errorFeedback();
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    lightTap();

    try {
      if (isSignUp) {
        const isUsernameAvailable = await userService.checkUsernameAvailability(formData.username);
        if (!isUsernameAvailable) {
          setErrors({ username: 'このユーザー名は既に使用されています' });
          errorFeedback();
          setLoading(false);
          return;
        }

        const isDisplayNameAvailable = await userService.checkDisplayNameAvailability(formData.displayName);
        if (!isDisplayNameAvailable) {
          setErrors({ displayName: 'この表示名は既に使用されています' });
          errorFeedback();
          setLoading(false);
          return;
        }

        await authService.signUp(
          formData.email,
          formData.password,
          {
            username: formData.username,
            display_name: formData.displayName,
          }
        );

        successFeedback();
        Alert.alert(
          'アカウント作成完了',
          'メールアドレス宛に確認メールを送信しました。メールに記載されているリンクをクリックして認証を完了してから、ログインしてください。',
          [{
            text: 'OK',
            onPress: () => {
              setIsSignUp(false);
              setFormData({
                email: formData.email,
                password: '',
                confirmPassword: '',
                displayName: '',
                username: '',
              });
              setErrors({});
            }
          }]
        );
      } else {
        await authService.signIn(formData.email, formData.password, rememberMe);
        successFeedback();
        Alert.alert('ログイン成功', 'ログインしました。');
      }
    } catch (error: any) {
      errorFeedback();
      let errorMessage = '認証に失敗しました。もう一度お試しください。';

      if (error.message?.includes('Invalid login credentials')) {
        errorMessage = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (error.message?.includes('User already registered')) {
        errorMessage = 'このメールアドレスはすでに登録されています。';
      } else if (error.message?.includes('Email not confirmed')) {
        errorMessage = 'メール認証が完了していません。送信されたメールからアカウントを有効化してください。';
      } else if (error.message?.includes('rate limit')) {
        errorMessage = 'リクエストが多すぎます。しばらく待ってから再試行してください。';
      }

      Alert.alert('エラー', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    lightTap();
    if (!isSignUp) {
      Alert.alert(
        '利用規約への同意',
        '本サービスをご利用いただくにあたり、以下の事項にご同意いただく必要があります。\n\n' +
        '1. 投稿した写真・動画は会社内で共有されます\n\n' +
        '2. 投稿した写真・動画の社内利用（資料作成、広報活動等）に同意します\n\n' +
        '上記の内容に同意してアカウントを作成しますか？',
        [
          { text: 'いいえ', style: 'cancel' },
          {
            text: '同意する',
            onPress: () => {
              setIsSignUp(true);
              setFormData({
                email: '',
                password: '',
                confirmPassword: '',
                displayName: '',
                username: '',
              });
              setErrors({});
              setRememberMe(false);
            },
          },
        ],
        { cancelable: false }
      );
    } else {
      setIsSignUp(false);
      setFormData({
        email: '',
        password: '',
        confirmPassword: '',
        displayName: '',
        username: '',
      });
      setErrors({});
      setRememberMe(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ミニマル装飾 */}
      <View style={styles.decorCircle1} />
      <View style={styles.decorCircle2} />

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
            {/* Header */}
            <View style={styles.header}>
              <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
                <View style={styles.logoCircle}>
                  <Ionicons name="camera" size={32} color="#1a1a1a" />
                  <View style={styles.logoSecondIconContainer}>
                    <Ionicons name="briefcase" size={16} color="#666" />
                  </View>
                </View>
              </Animated.View>
              <View style={styles.appNameContainer}>
                <Text style={styles.appNameSnap}>Snap</Text>
                <Text style={styles.appNameWork}>Work</Text>
              </View>
              <Text style={styles.appTagline}>
                {isSignUp ? '新しいアカウントを作成' : 'おかえりなさい'}
              </Text>
            </View>

            {/* Form Card with Glassmorphism */}
            <View style={styles.formCard}>
              <View style={styles.formCardInner}>
                {isSignUp && (
                  <>
                    <FloatingLabelInput
                      label="表示名"
                      value={formData.displayName}
                      onChangeText={(text) => handleInputChange('displayName', text)}
                      icon="person-outline"
                      error={errors.displayName}
                      autoCapitalize="words"
                    />
                    <FloatingLabelInput
                      label="ユーザー名"
                      value={formData.username}
                      onChangeText={(text) => handleInputChange('username', text.toLowerCase())}
                      icon="at-outline"
                      error={errors.username}
                      autoCapitalize="none"
                    />
                  </>
                )}

                <FloatingLabelInput
                  label="メールアドレス"
                  value={formData.email}
                  onChangeText={(text) => handleInputChange('email', text)}
                  icon="mail-outline"
                  error={errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <FloatingLabelInput
                  label="パスワード"
                  value={formData.password}
                  onChangeText={(text) => handleInputChange('password', text)}
                  icon="lock-closed-outline"
                  error={errors.password}
                  secureTextEntry={!showPassword}
                />

                {isSignUp && (
                  <FloatingLabelInput
                    label="パスワード（確認）"
                    value={formData.confirmPassword}
                    onChangeText={(text) => handleInputChange('confirmPassword', text)}
                    icon="lock-closed-outline"
                    error={errors.confirmPassword}
                    secureTextEntry={!showPassword}
                  />
                )}

                {/* Password visibility toggle */}
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
                  <Text style={styles.showPasswordText}>
                    {showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  </Text>
                </TouchableOpacity>

                {/* Remember Me */}
                {!isSignUp && (
                  <TouchableOpacity
                    style={styles.rememberMeContainer}
                    onPress={() => {
                      lightTap();
                      setRememberMe(!rememberMe);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                      {rememberMe && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.rememberMeText}>ログイン状態を保持する</Text>
                  </TouchableOpacity>
                )}

                {/* Submit Button */}
                <GradientButton
                  title={isSignUp ? 'アカウント作成' : 'ログイン'}
                  onPress={handleSubmit}
                  loading={loading}
                  gradient={gradients.primary}
                  style={styles.submitButton}
                />

                {/* Divider */}
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>または</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Switch Mode */}
                <AnimatedButton
                  style={styles.switchButton}
                  onPress={switchMode}
                  accessibilityLabel={isSignUp ? '既にアカウントをお持ちの方はこちら' : '新規アカウント作成'}
                >
                  <Text style={styles.switchButtonText}>
                    {isSignUp ? '既にアカウントをお持ちの方' : '新規アカウント作成'}
                  </Text>
                </AnimatedButton>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                続行することで、利用規約とプライバシーポリシーに同意したことになります
              </Text>
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
    backgroundColor: '#ffffff',
  },
  decorCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#f5f5f5',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#f8f8f8',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    ...shadows.medium,
    position: 'relative',
  },
  logoSecondIconContainer: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 4,
    ...shadows.small,
  },
  appNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appNameSnap: {
    ...typography.largeTitle,
    color: '#1a1a1a',
  },
  appNameWork: {
    ...typography.largeTitle,
    color: '#666',
  },
  appTagline: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: 8,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    ...shadows.small,
    overflow: 'hidden',
  },
  formCardInner: {
    padding: 24,
  },
  showPasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginLeft: 4,
  },
  showPasswordText: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  checkboxChecked: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  rememberMeText: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  submitButton: {
    marginTop: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.footnote,
    color: colors.textMuted,
    marginHorizontal: 16,
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  switchButtonText: {
    ...typography.subhead,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  footer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    ...typography.caption1,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
