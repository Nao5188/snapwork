import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { authService, storeService, supabase } from '@/lib/supabase';
import { AppThemeProvider, useAppTheme } from '@/lib/ThemeContext';

const WELCOME_COMPLETED_KEY = 'saloncloud_welcome_completed';

type AppContentProps = {
  isAuthenticated: boolean | null;
  hasStoreMembership: boolean | null;
  hasCompletedWelcome: boolean;
};

function AppContent({ isAuthenticated, hasStoreMembership, hasCompletedWelcome }: AppContentProps) {
  const { isDark } = useAppTheme();
  const initialRouteName = isAuthenticated
    ? (hasStoreMembership ? '(tabs)' : 'store-onboarding')
    : (hasCompletedWelcome ? 'login' : 'welcome');

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName={initialRouteName}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register-complete" options={{ headerShown: false }} />
        <Stack.Screen name="store-onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="store/create" options={{ headerShown: false }} />
        <Stack.Screen name="store/join" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post/create" options={{ headerShown: false }} />
        <Stack.Screen name="post/edit/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="gallery" options={{ headerShown: false }} />
        <Stack.Screen name="admin/filter-search" options={{ headerShown: false }} />
        <Stack.Screen name="admin/staff-album" options={{ headerShown: false }} />
        <Stack.Screen name="admin/staff-list" options={{ headerShown: false }} />
        <Stack.Screen name="admin/staff-posts" options={{ headerShown: false }} />
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
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasStoreMembership, setHasStoreMembership] = useState<boolean | null>(null);
  const [hasCompletedWelcome, setHasCompletedWelcome] = useState<boolean | null>(null);
  const isRecoveryFlow = useRef(false);
  const routedUserId = useRef<string | null>(null);
  const routingPromise = useRef<Promise<void> | null>(null);
  const hasCompletedWelcomeRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadWelcomeState = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(WELCOME_COMPLETED_KEY);
        const completed = storedValue === 'true';
        hasCompletedWelcomeRef.current = completed;
        if (mounted) {
          setHasCompletedWelcome(completed);
        }
      } catch (error) {
        console.warn('Failed to load welcome state:', error);
        hasCompletedWelcomeRef.current = false;
        if (mounted) {
          setHasCompletedWelcome(false);
        }
      }
    };

    const markWelcomeCompleted = async () => {
      hasCompletedWelcomeRef.current = true;
      if (mounted) {
        setHasCompletedWelcome(true);
      }

      try {
        await AsyncStorage.setItem(WELCOME_COMPLETED_KEY, 'true');
      } catch (error) {
        console.warn('Failed to save welcome state:', error);
      }
    };

    const resetSignedOutState = () => {
      routedUserId.current = null;
      routingPromise.current = null;
      setHasStoreMembership(null);
      setIsAuthenticated(false);
    };

    const routeAuthenticatedUser = async (userId: string, shouldNavigate = true) => {
      if (routedUserId.current === userId && routingPromise.current) {
        return routingPromise.current;
      }

      routedUserId.current = userId;
      const nextRoutingPromise = (async () => {
        const hasMembership = await storeService.hasMembership(userId);
        if (!mounted) return;

        setHasStoreMembership(hasMembership);
        setIsAuthenticated(true);
        await markWelcomeCompleted();
        if (shouldNavigate) {
          router.replace((hasMembership ? '/(tabs)/history' : '/store-onboarding') as any);
        }
      })();

      routingPromise.current = nextRoutingPromise;

      try {
        await nextRoutingPromise;
      } finally {
        if (routingPromise.current === nextRoutingPromise) {
          routingPromise.current = null;
        }
      }
    };

    const checkAuthState = async () => {
      try {
        await loadWelcomeState();
        const autoLoginResult = await authService.attemptAutoLogin();

        if (autoLoginResult.success && 'user' in autoLoginResult && autoLoginResult.user) {
          console.log('Auto login successful for:', autoLoginResult.email);
          await routeAuthenticatedUser(autoLoginResult.user.id, false);
          return;
        }

        const { data: { user }, error: userError } = await authService.getCurrentUser();
        if (userError) {
          await supabase.auth.signOut();
          resetSignedOutState();
        } else if (user) {
          await routeAuthenticatedUser(user.id, false);
        } else {
          resetSignedOutState();
        }
      } catch (error) {
        console.error('Auth check error:', error);
        await supabase.auth.signOut();
        resetSignedOutState();
      }
    };

    const handleDeepLink = async (url: string) => {
      if (url.includes('reset-password')) {
        const fragment = url.split('#')[1];
        if (fragment) {
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
          isRecoveryFlow.current = true;
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          console.log('=== exchangeCodeForSession ===', { session: !!data?.session, error: error?.message });
          if (!error && data?.session) {
            router.replace({ pathname: '/reset-password', params: { fromRecovery: '1' } });
          } else {
            isRecoveryFlow.current = false;
          }
        }
        return;
      }

      const fragment = url.split('#')[1];
      if (fragment) {
        const params = new URLSearchParams(fragment);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          console.log('=== Email confirmation (implicit flow) ===');
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) console.error('Email confirmation session error:', error.message);
        }
      } else if (url.includes('code=')) {
        console.log('=== Email confirmation (PKCE flow) ===');
        const { data, error } = await supabase.auth.exchangeCodeForSession(url);
        console.log('=== exchangeCodeForSession (signup) ===', { session: !!data?.session, error: error?.message });
      }
    };

    checkAuthState();

    Linking.getInitialURL().then((url) => {
      if (url) void handleDeepLink(url);
    });

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url);
    });

    const subscription = authService.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setHasStoreMembership(true);
        setIsAuthenticated(true);
        isRecoveryFlow.current = false;
        router.replace({ pathname: '/reset-password', params: { fromRecovery: '1' } });
      } else if (event === 'SIGNED_IN' && session?.user) {
        if (isRecoveryFlow.current) {
          setHasStoreMembership(true);
          setIsAuthenticated(true);
          isRecoveryFlow.current = false;
        } else {
          void routeAuthenticatedUser(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        resetSignedOutState();
        router.replace((hasCompletedWelcomeRef.current ? '/login' : '/welcome') as any);
      } else if (event === 'INITIAL_SESSION') {
        if (!session?.user) {
          resetSignedOutState();
        }
      } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          setIsAuthenticated(true);
        } else {
          resetSignedOutState();
        }
      }
    });

    return () => {
      mounted = false;
      subscription?.data?.subscription?.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  if (!loaded || hasCompletedWelcome === null || isAuthenticated === null || (isAuthenticated && hasStoreMembership === null)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <AppContent
          isAuthenticated={isAuthenticated}
          hasStoreMembership={hasStoreMembership}
          hasCompletedWelcome={hasCompletedWelcome}
        />
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
