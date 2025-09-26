import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { authService } from '@/lib/supabase';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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
        const { data: { user } } = await authService.getCurrentUser();
        setIsAuthenticated(!!user);
      } catch (error) {
        console.error('Auth check error:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuthState();

    // 認証状態の変更を監視
    const subscription = authService.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, !!session?.user);
      setIsAuthenticated(!!session?.user);
      
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('Navigating to history tab...');
        router.replace('/(tabs)/history');
      } else if (event === 'SIGNED_OUT') {
        console.log('Navigating to login...');
        router.replace('/login');
      }
    });

    return () => {
      console.log('Cleaning up auth subscription');
      subscription?.data?.subscription?.unsubscribe();
    };
  }, []);

  if (!loaded || isAuthenticated === null) {
    // フォント読み込み中または認証状態確認中
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName={isAuthenticated ? "(tabs)" : "login"}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post/create" options={{ headerShown: false }} />
        <Stack.Screen name="post/edit/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="gallery" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
    </ThemeProvider>
  );
}
