import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authService, userService } from '../lib/supabase';
import { storageService } from '../lib/storage';

const { width } = Dimensions.get('window');

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
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // アニメーション
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return false;
    }

    if (!validateEmail(formData.email)) {
      Alert.alert('入力エラー', '正しいメールアドレスを入力してください。');
      return false;
    }

    if (formData.password.length < 6) {
      Alert.alert('入力エラー', 'パスワードは6文字以上で入力してください。');
      return false;
    }

    if (isSignUp) {
      if (!formData.displayName || !formData.username) {
        Alert.alert('入力エラー', '表示名とユーザー名を入力してください。');
        return false;
      }

      if (formData.password !== formData.confirmPassword) {
        Alert.alert('入力エラー', 'パスワードが一致しません。');
        return false;
      }

      if (formData.username.length < 3) {
        Alert.alert('入力エラー', 'ユーザー名は3文字以上で入力してください。');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    console.log('=== Login/Signup attempt started ===');
    console.log('Mode:', isSignUp ? 'SignUp' : 'SignIn');
    console.log('Email:', formData.email);

    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        console.log('Starting signup process...');
        const isUsernameAvailable = await userService.checkUsernameAvailability(formData.username);
        if (!isUsernameAvailable) {
          Alert.alert('入力エラー', 'このユーザー名は既に使用されています。');
          setLoading(false);
          return;
        }

        const isDisplayNameAvailable = await userService.checkDisplayNameAvailability(formData.displayName);
        if (!isDisplayNameAvailable) {
          Alert.alert('入力エラー', 'この表示名は既に使用されています。');
          setLoading(false);
          return;
        }

        console.log('Calling authService.signUp...');
        const result = await authService.signUp(
          formData.email,
          formData.password,
          {
            username: formData.username,
            display_name: formData.displayName,
          }
        );
        console.log('SignUp result:', result);

        Alert.alert(
          'アカウント作成完了',
          'アカウントが正常に作成されました。\n\nメールアドレス宛に確認メールを送信しました。メールに記載されているリンクをクリックして認証を完了してから、ログインしてください。',
          [{
            text: 'OK',
            onPress: () => {
              console.log('Switching to login mode...');
              setIsSignUp(false);
              setFormData({
                email: formData.email,
                password: '',
                confirmPassword: '',
                displayName: '',
                username: '',
              });
            }
          }]
        );
      } else {
        console.log('Starting signin process...');
        const result = await authService.signIn(formData.email, formData.password, rememberMe);
        console.log('SignIn result:', result);

        Alert.alert(
          'ログイン成功',
          'ログインしました。'
        );
      }
    } catch (error: any) {
      console.error('Auth error:', error);

      let errorMessage = '認証に失敗しました。もう一度お試しください。';

      if (error.message?.includes('Invalid login credentials')) {
        errorMessage = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (error.message?.includes('User already registered')) {
        errorMessage = 'このメールアドレスは既に登録されています。';
      } else if (error.message?.includes('Username already exists')) {
        errorMessage = 'このユーザー名は既に使用されています。';
      } else if (error.message?.includes('Display name already exists')) {
        errorMessage = 'この表示名は既に使用されています。';
      } else if (error.message?.includes('For security purposes, you can only request this after')) {
        const match = error.message.match(/after (\d+) seconds?/);
        const seconds = match ? match[1] : '少し';
        errorMessage = `セキュリティのため、${seconds}秒後に再試行してください。\n\n短時間に複数回の登録試行があったため、一時的に制限されています。`;
      } else if (error.message?.includes('Password should be')) {
        errorMessage = 'パスワードは6文字以上で入力してください。';
      } else if (error.message?.includes('Unable to validate email address')) {
        errorMessage = '正しいメールアドレスを入力してください。';
      } else if (error.message?.includes('Email not confirmed')) {
        errorMessage = 'メールアドレスが確認されていません。送信されたメールから認証を完了してからログインしてください。';
      } else if (error.message?.includes('rate limit')) {
        errorMessage = 'リクエストが多すぎます。しばらく待ってから再試行してください。';
      }

      Alert.alert('エラー', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      username: '',
    });
    setRememberMe(false);
  };

  const renderInput = (
    field: string,
    label: string,
    placeholder: string,
    options: {
      icon: keyof typeof Ionicons.glyphMap;
      secureTextEntry?: boolean;
      keyboardType?: 'default' | 'email-address';
      autoCapitalize?: 'none' | 'words';
    }
  ) => {
    const isFocused = focusedField === field;
    const hasValue = formData[field as keyof typeof formData]?.length > 0;

    return (
      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={[
          styles.inputContainer,
          isFocused && styles.inputContainerFocused,
        ]}>
          <Ionicons
            name={options.icon}
            size={20}
            color={isFocused ? '#1a1a1a' : '#999'}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#bbb"
            value={formData[field as keyof typeof formData]}
            onChangeText={(text) => handleInputChange(field, options.autoCapitalize === 'none' ? text.toLowerCase() : text)}
            secureTextEntry={options.secureTextEntry && !showPassword}
            keyboardType={options.keyboardType || 'default'}
            autoCapitalize={options.autoCapitalize || 'none'}
            autoCorrect={false}
            onFocus={() => setFocusedField(field)}
            onBlur={() => setFocusedField(null)}
          />
          {options.secureTextEntry && (
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="#999"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
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
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <Ionicons name="camera" size={32} color="#1a1a1a" />
                </View>
              </View>
              <Text style={styles.appName}>PhotoManager</Text>
              <Text style={styles.appTagline}>
                {isSignUp ? '新しいアカウントを作成' : 'おかえりなさい'}
              </Text>
            </View>

            {/* Form Card */}
            <View style={styles.formCard}>
              {isSignUp && (
                <>
                  {renderInput('displayName', '表示名', '山田 太郎', {
                    icon: 'person-outline',
                    autoCapitalize: 'words',
                  })}
                  {renderInput('username', 'ユーザー名', 'yamada_taro', {
                    icon: 'at-outline',
                    autoCapitalize: 'none',
                  })}
                </>
              )}

              {renderInput('email', 'メールアドレス', 'example@email.com', {
                icon: 'mail-outline',
                keyboardType: 'email-address',
                autoCapitalize: 'none',
              })}

              {renderInput('password', 'パスワード', '6文字以上', {
                icon: 'lock-closed-outline',
                secureTextEntry: true,
              })}

              {isSignUp && renderInput('confirmPassword', 'パスワード（確認）', '再度入力', {
                icon: 'lock-closed-outline',
                secureTextEntry: true,
              })}

              {/* Remember Me */}
              {!isSignUp && (
                <TouchableOpacity
                  style={styles.rememberMeContainer}
                  onPress={() => setRememberMe(!rememberMe)}
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
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <Text style={styles.submitButtonText}>処理中...</Text>
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>
                      {isSignUp ? 'アカウント作成' : 'ログイン'}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" style={styles.submitIcon} />
                  </>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>または</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Switch Mode */}
              <TouchableOpacity
                style={styles.switchButton}
                onPress={switchMode}
                activeOpacity={0.7}
              >
                <Text style={styles.switchButtonText}>
                  {isSignUp ? '既にアカウントをお持ちの方' : '新規アカウント作成'}
                </Text>
              </TouchableOpacity>
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
    backgroundColor: '#fafafa',
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
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 15,
    color: '#888',
    marginTop: 6,
    fontWeight: '400',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  inputWrapper: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputContainerFocused: {
    backgroundColor: '#fff',
    borderColor: '#1a1a1a',
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  eyeButton: {
    padding: 14,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ddd',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  checkboxChecked: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  rememberMeText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitIcon: {
    marginLeft: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#eee',
  },
  dividerText: {
    color: '#aaa',
    fontSize: 13,
    marginHorizontal: 16,
    fontWeight: '500',
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    backgroundColor: '#fafafa',
  },
  switchButtonText: {
    color: '#555',
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 18,
  },
});
