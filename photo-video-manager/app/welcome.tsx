import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { lightTap } from '@/lib/haptics';

export default function WelcomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  const logoSize = Math.min(width * 0.44, 172);

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
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, reduceMotion, slideAnim]);

  const goToSignup = () => {
    lightTap();
    router.push({ pathname: '/login', params: { mode: 'signup' } });
  };

  const goToLogin = () => {
    lightTap();
    router.push({ pathname: '/login', params: { mode: 'signin' } });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.brandArea}>
          <Image
            source={require('../assets/images/SalonCloudLogo.png')}
            style={[styles.logoImage, { width: logoSize, height: logoSize }]}
            resizeMode="contain"
            accessible
            accessibilityLabel="SalonCloud"
          />
          <Text style={styles.description}>店舗で使える写真共有アプリ</Text>
        </View>

        <View style={styles.actionBlock}>
          <TouchableOpacity
            style={styles.startButton}
            onPress={goToSignup}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="はじめる"
            testID="welcome-start-button"
          >
            <Text style={styles.startButtonText}>はじめる</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={goToLogin}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="ログインはこちら"
            testID="welcome-login-link"
          >
            <Text style={styles.loginLink}>ログインはこちら</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 80,
  },
  brandArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  logoImage: {
    marginBottom: 6,
  },
  description: {
    color: '#555555',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  actionBlock: {
    width: '100%',
    maxWidth: 292,
    alignSelf: 'center',
    alignItems: 'center',
  },
  startButton: {
    width: '100%',
    minHeight: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loginButton: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: 10,
  },
  loginLink: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '700',
  },
});
