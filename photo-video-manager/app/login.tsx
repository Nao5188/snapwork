import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Image,
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
import * as Linking from 'expo-linking';
import { authService, userService } from '../lib/supabase';
import { storageService } from '../lib/storage';
import { gradients, borderRadius, typography } from '../lib/theme';
import { lightTap, successFeedback, errorFeedback } from '../lib/haptics';
import FloatingLabelInput from '../components/FloatingLabelInput';
import GradientButton from '../components/GradientButton';
import AnimatedButton from '../components/AnimatedButton';
import { useAppTheme } from '@/lib/ThemeContext';

const { height } = Dimensions.get('window');

export default function LoginScreen() {
  const { colors, isDark } = useAppTheme();
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (password.length < 6) {
      return { isValid: false, message: 'パスワードは6文字以上で入力してください。' };
    }
    if (!/[0-9]/.test(password)) {
      return { isValid: false, message: 'パスワードには数字を含めてください。' };
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

  const handleForgotPassword = async () => {
    if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setErrors({ resetEmail: '正しいメールアドレスを入力してください' });
      errorFeedback();
      return;
    }

    setLoading(true);
    lightTap();
    try {
      const redirectTo = Linking.createURL('reset-password');
      console.log('=== redirectTo URL ===', redirectTo);
      await authService.resetPassword(resetEmail, redirectTo);
      successFeedback();
      Alert.alert(
        'メールを送信しました',
        `${resetEmail} にパスワードリセット用のメールを送信しました。メール内のリンクからパスワードを再設定してください。`,
        [{
          text: 'OK',
          onPress: () => {
            setIsForgotPassword(false);
            setResetEmail('');
            setErrors({});
          }
        }]
      );
    } catch {
      errorFeedback();
      Alert.alert('エラー', 'メールの送信に失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  const generateUsername = (displayName: string): string => {
    const base = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (base.length >= 3) {
      return base.substring(0, 42);
    }
    return 'user_' + Math.random().toString(36).substring(2, 10);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    lightTap();

    try {
      if (isSignUp) {
        console.log('[Step 1] checkDisplayNameAvailability...');
        const isDisplayNameAvailable = await userService.checkDisplayNameAvailability(formData.displayName);
        if (!isDisplayNameAvailable) {
          setErrors({ displayName: 'この表示名は既に使用されています' });
          errorFeedback();
          setLoading(false);
          return;
        }

        console.log('[Step 2] generateUsername & checkUsernameAvailability...');
        let username = generateUsername(formData.displayName);
        // 重複時は最大5回リトライ
        for (let i = 0; i < 5; i++) {
          const isAvailable = await userService.checkUsernameAvailability(username);
          if (isAvailable) break;
          username = 'user_' + Math.random().toString(36).substring(2, 10);
        }

        console.log('[Step 3] authService.signUp...');
        const emailRedirectTo = Linking.createURL('login');
        await authService.signUp(
          formData.email,
          formData.password,
          {
            username,
            display_name: formData.displayName,
          },
          emailRedirectTo
        );

        successFeedback();
        Alert.alert(
          'アカウント作成完了',
          'メールアドレス宛に確認メールを送信しました。メール内のリンクをタップするとアプリが開き、自動的にログインされます。',
          [{
            text: 'OK',
            onPress: () => {
              setIsSignUp(false);
              setFormData({
                email: formData.email,
                password: '',
                confirmPassword: '',
                displayName: '',
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
      console.error('Auth error:', error.message, '| code:', error.code, '| status:', error.status);
      let errorMessage = '認証に失敗しました。もう一度お試しください。';

      if (error.message?.includes('Invalid login credentials')) {
        errorMessage = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (error.message?.includes('User already registered')) {
        errorMessage = 'このメールアドレスはすでに登録されています。\nメール確認が完了していない場合は、届いたメールのリンクをタップしてください。';
      } else if (error.message?.includes('Email not confirmed')) {
        errorMessage = 'メール認証が完了していません。送信されたメールからアカウントを有効化してください。';
      } else if (
        error.message?.includes('rate limit') ||
        error.code === 'over_request_rate_limit' ||
        error.code === 'over_email_send_rate_limit' ||
        error.message?.includes('security purposes')
      ) {
        errorMessage = 'リクエストが多すぎます。約1時間後に再試行してください。';
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
      });
      setErrors({});
      setRememberMe(false);
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
            {/* Header */}
            <View style={styles.header}>
              <Animated.View style={[styles.appNameContainer, { transform: [{ scale: logoScale }] }]}>
                <Image
                  source={require('../assets/images/SalonCloudLogo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </Animated.View>
              {(isForgotPassword || isSignUp) && (
                <Text style={[styles.appTagline, { color: colors.textSecondary }]}>
                  {isForgotPassword ? 'パスワードをリセット' : '新しいアカウントを作成'}
                </Text>
              )}
            </View>

            {/* Form Card with Glassmorphism */}
            <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.formCardInner}>
                {isForgotPassword ? (
                  <>
                    <Text style={[styles.forgotPasswordDescription, { color: colors.textSecondary }]}>
                      登録したメールアドレスを入力してください。パスワードリセット用のメールをお送りします。
                    </Text>
                    <FloatingLabelInput
                      label="メールアドレス"
                      value={resetEmail}
                      onChangeText={(text) => {
                        setResetEmail(text);
                        if (errors.resetEmail) setErrors({});
                      }}
                      icon="mail-outline"
                      error={errors.resetEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    <GradientButton
                      title={loading ? '送信中...' : 'リセットメールを送信'}
                      onPress={handleForgotPassword}
                      loading={loading}
                      gradient={gradients.salonBlue}
                      style={styles.submitButton}
                    />
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>または</Text>
                      <View style={styles.dividerLine} />
                    </View>
                    <AnimatedButton
                      style={[styles.switchButton, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
                      onPress={() => {
                        setIsForgotPassword(false);
                        setResetEmail('');
                        setErrors({});
                      }}
                    >
                      <Text style={[styles.switchButtonText, { color: colors.text }]}>ログインに戻る</Text>
                    </AnimatedButton>
                  </>
                ) : (
                <>
                {isSignUp && (
                  <>
                    <FloatingLabelInput
                      label="表示名"
                      value={formData.displayName}
                      onChangeText={(text) => handleInputChange('displayName', text)}
                      icon="person-outline"
                      error={errors.displayName}
                      autoCapitalize="words"
                      testID="login-displayname-input"
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
                  testID="login-email-input"
                />

                <FloatingLabelInput
                  label="パスワード"
                  value={formData.password}
                  onChangeText={(text) => handleInputChange('password', text)}
                  icon="lock-closed-outline"
                  error={errors.password}
                  secureTextEntry={!showPassword}
                  testID="login-password-input"
                />

                {isSignUp && (
                  <FloatingLabelInput
                    label="パスワード（確認）"
                    value={formData.confirmPassword}
                    onChangeText={(text) => handleInputChange('confirmPassword', text)}
                    icon="lock-closed-outline"
                    error={errors.confirmPassword}
                    secureTextEntry={!showPassword}
                    testID="login-confirm-password-input"
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
                  <Text style={[styles.showPasswordText, { color: colors.textSecondary }]}>
                    {showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  </Text>
                </TouchableOpacity>

                {/* Remember Me */}
                {!isSignUp && (
                  <>
                    <TouchableOpacity
                      style={styles.rememberMeContainer}
                      onPress={() => {
                        lightTap();
                        setRememberMe(!rememberMe);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: colors.surface2 }, rememberMe && styles.checkboxChecked]}>
                        {rememberMe && (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>
                      <Text style={[styles.rememberMeText, { color: colors.textSecondary }]}>ログイン状態を保持する</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.forgotPasswordButton}
                      onPress={() => {
                        lightTap();
                        setIsForgotPassword(true);
                        setResetEmail(formData.email);
                        setErrors({});
                      }}
                      activeOpacity={0.7}
                      testID="login-forgot-password"
                    >
                      <Text style={[styles.forgotPasswordText, { color: colors.text }]}>パスワードをお忘れの方</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Submit Button */}
                <GradientButton
                  title={isSignUp ? 'アカウント作成' : 'ログイン'}
                  onPress={handleSubmit}
                  loading={loading}
                  gradient={gradients.salonBlue}
                  style={styles.submitButton}
                  testID="login-submit-button"
                />

                {/* Divider */}
                <View style={styles.divider}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textMuted }]}>または</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                {/* Switch Mode */}
                <AnimatedButton
                  style={[styles.switchButton, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
                  onPress={switchMode}
                  accessibilityLabel={isSignUp ? '既にアカウントをお持ちの方はこちら' : '新規アカウント作成'}
                  testID="login-signup-button"
                >
                  <Text style={[styles.switchButtonText, { color: colors.text }]}>
                    {isSignUp ? '既にアカウントをお持ちの方' : '新規アカウント作成'}
                  </Text>
                </AnimatedButton>
                </>
                )}
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.textMuted }]}>
                続行することで、利用規約と{'\n'}プライバシーポリシーに同意したことになります
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
  },
  bgTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.45,
    borderBottomLeftRadius: 60,
    borderBottomRightRadius: 60,
    opacity: 0.5,
  },
  decorBlob1: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.4,
  },
  decorBlob2: {
    position: 'absolute',
    top: height * 0.2,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    opacity: 0.3,
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
    marginBottom: 40,
  },
  appNameContainer: {
    alignItems: 'center',
  },
  logoImage: {
    width: 360,
    height: 140,
  },
  appTagline: {
    fontSize: 15,
    marginTop: 10,
    letterSpacing: 0.3,
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
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#444444',
    borderColor: '#444444',
  },
  rememberMeText: {
    ...typography.subhead,
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
  },
  dividerText: {
    ...typography.footnote,
    marginHorizontal: 16,
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  switchButtonText: {
    ...typography.subhead,
    fontWeight: '600',
  },
  footer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    ...typography.caption1,
    textAlign: 'center',
    lineHeight: 18,
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginBottom: 20,
  },
  forgotPasswordText: {
    ...typography.footnote,
    fontWeight: '500',
  },
  forgotPasswordDescription: {
    ...typography.subhead,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
});
