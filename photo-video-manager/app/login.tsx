import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

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
    if (!validateForm()) return;

    setLoading(true);

    try {
      // TODO: 実際の認証処理を実装
      if (isSignUp) {
        // サインアップ処理
        console.log('Sign up:', formData);
        Alert.alert(
          'アカウント作成完了',
          'アカウントが正常に作成されました。',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      } else {
        // ログイン処理
        console.log('Login:', { email: formData.email, password: formData.password });
        Alert.alert(
          'ログイン成功',
          'ログインしました。',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      }
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert('エラー', '認証に失敗しました。もう一度お試しください。');
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
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="camera" size={60} color="#262626" />
            <Text style={styles.appName}>PhotoManager</Text>
            <Text style={styles.appSubtitle}>スタッフ専用アプリ</Text>
          </View>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isSignUp ? 'アカウント作成' : 'ログイン'}
          </Text>

          {isSignUp && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>表示名</Text>
                <TextInput
                  style={styles.input}
                  placeholder="山田太郎"
                  value={formData.displayName}
                  onChangeText={(text) => handleInputChange('displayName', text)}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>ユーザー名</Text>
                <TextInput
                  style={styles.input}
                  placeholder="yamada_taro"
                  value={formData.username}
                  onChangeText={(text) => handleInputChange('username', text.toLowerCase())}
                  autoCapitalize="none"
                />
              </View>
            </>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>メールアドレス</Text>
            <TextInput
              style={styles.input}
              placeholder="example@company.com"
              value={formData.email}
              onChangeText={(text) => handleInputChange('email', text)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>パスワード</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="6文字以上"
                value={formData.password}
                onChangeText={(text) => handleInputChange('password', text)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity 
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons 
                  name={showPassword ? 'eye' : 'eye-off'} 
                  size={20} 
                  color="#8e8e8e" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {isSignUp && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>パスワード（確認）</Text>
              <TextInput
                style={styles.input}
                placeholder="パスワードを再入力"
                value={formData.confirmPassword}
                onChangeText={(text) => handleInputChange('confirmPassword', text)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          <TouchableOpacity 
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? '処理中...' : (isSignUp ? 'アカウント作成' : 'ログイン')}
            </Text>
          </TouchableOpacity>

          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>
              {isSignUp ? 'すでにアカウントをお持ちですか？' : 'アカウントをお持ちでないですか？'}
            </Text>
            <TouchableOpacity onPress={switchMode}>
              <Text style={styles.switchLink}>
                {isSignUp ? 'ログイン' : 'アカウント作成'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            スタッフ専用アプリです。{'\n'}
            関係者以外の利用はご遠慮ください。
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#262626',
    marginTop: 16,
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#8e8e8e',
    fontWeight: '500',
  },
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#262626',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#262626',
    backgroundColor: '#fafafa',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#262626',
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  submitButton: {
    backgroundColor: '#0095f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonDisabled: {
    backgroundColor: '#b3b3b3',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchContainer: {
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    color: '#8e8e8e',
    marginBottom: 4,
  },
  switchLink: {
    fontSize: 14,
    color: '#0095f6',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#8e8e8e',
    textAlign: 'center',
    lineHeight: 16,
  },
});