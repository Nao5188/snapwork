import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';
import * as Linking from 'expo-linking';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from '@/hooks/useColorScheme';
import { authService, supabase } from '@/lib/supabase';
import { AppThemeProvider, useAppTheme } from '@/lib/ThemeContext';

function AppContent({ isAuthenticated, colorScheme }: { isAuthenticated: boolean | null; colorScheme: string | null | undefined }) {
  const { isDark } = useAppTheme();
  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName={isAuthenticated ? "(tabs)" : "login"}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post/create" options={{ headerShown: false }} />
        <Stack.Screen name="post/edit/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="gallery" options={{ headerShown: false }} />
        <Stack.Screen
          name="my-posts"
          options={{
            headerShown: false,
            gestureEnabled: true,
            fullScreenGestureEnabled: false,
            gestureDirection: 'horizontal',

            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={isDark ? '#1a1a1a' : '#ffffff'} translucent={false} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const isRecoveryFlow = useRef(false);

  useEffect(() => {
    // 初期認証状態チェック（自動ログイン含む）
    const checkAuthState = async () => {
      try {
        // まず自動ログインを試行
        const autoLoginResult = await authService.attemptAutoLogin();
        
        if (autoLoginResult.success) {
          console.log('Auto login successful for:', autoLoginResult.email);
          setIsAuthenticated(true);
          return;
        }

        // 自動ログインが失敗した場合は通常の認証状態チェック
        const { data: { user }, error: userError } = await authService.getCurrentUser();
        if (userError) {
          // リフレッシュトークン無効などのエラー時はセッションをクリア
          await supabase.auth.signOut();
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(!!user);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      }
    };

    checkAuthState();

    // ディープリンクを処理してSupabaseセッションを設定
    const handleDeepLink = async (url: string) => {
      if (url.includes('reset-password')) {
        const fragment = url.split('#')[1];
        if (fragment) {
          // Implicit フロー: #access_token=...&refresh_token=...&type=recovery
          const params = new URLSearchParams(fragment);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            isRecoveryFlow.current = true;
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            console.log('=== setSession result ===', error?.message ?? 'success');
            if (!error) {
              router.replace({ pathname: '/reset-password', params: { fromRecovery: '1' } });
            } else {
              isRecoveryFlow.current = false;
            }
          }
        } else {
          // PKCE フロー: ?code=xxx
          isRecoveryFlow.current = true;
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          console.log('=== exchangeCodeForSession ===', { session: !!data?.session, error: error?.message });
          if (!error && data?.session) {
            router.replace({ pathname: '/reset-password', params: { fromRecovery: '1' } });
          } else {
            isRecoveryFlow.current = false;
          }
        }
      } else {
        // メール確認ディープリンクの処理
        const fragment = url.split('#')[1];
        if (fragment) {
          // Implicit フロー: #access_token=...&refresh_token=...&type=signup
          const params = new URLSearchParams(fragment);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            console.log('=== Email confirmation (implicit flow) ===');
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) console.error('Email confirmation session error:', error.message);
            // onAuthStateChange の SIGNED_IN イベントが /(tabs)/history に遷移
          }
        } else if (url.includes('code=')) {
          // PKCE フロー: ?code=xxx
          console.log('=== Email confirmation (PKCE flow) ===');
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          console.log('=== exchangeCodeForSession (signup) ===', { session: !!data?.session, error: error?.message });
          // onAuthStateChange の SIGNED_IN イベントが /(tabs)/history に遷移
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // 認証状態の変更を監視
    const subscription = authService.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, !!session?.user);

      if (event === 'PASSWORD_RECOVERY') {
        // リカバリーフロー: 通常ログインとして扱わない
        console.log('PASSWORD_RECOVERY - navigating to reset-password');
        isRecoveryFlow.current = false;
        router.replace({ pathname: '/reset-password', params: { fromRecovery: '1' } });
      } else if (event === 'SIGNED_IN' && session?.user) {
        if (isRecoveryFlow.current) {
          // PKCEリカバリーフロー: ホーム画面に遷移しない（handleDeepLinkがreset-passwordに遷移済み）
          console.log('SIGNED_IN during recovery flow, skipping navigation');
          isRecoveryFlow.current = false;
        } else {
          // 通常ログイン
          setIsAuthenticated(true);
          console.log('Navigating to history tab...');
          router.replace('/(tabs)/history');
        }
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        console.log('Navigating to login...');
        router.replace('/login');
      } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        setIsAuthenticated(!!session?.user);
      }
    });

    return () => {
      console.log('Cleaning up auth subscription');
      subscription?.data?.subscription?.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  if (!loaded || isAuthenticated === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <AppContent isAuthenticated={isAuthenticated} colorScheme={colorScheme} />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});
