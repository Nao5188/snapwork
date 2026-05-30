import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import Button from '@/components/Button';
import { authService, storeService } from '@/lib/supabase';
import { useAppTheme } from '@/lib/ThemeContext';
import { borderRadius, shadows, typography } from '@/lib/theme';
import { lightTap } from '@/lib/haptics';

type StoreChoiceCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBackground: string;
  title: string;
  description: string;
  onPress: () => void;
  testID: string;
};

function StoreChoiceCard({
  icon,
  iconColor,
  iconBackground,
  title,
  description,
  onPress,
  testID,
}: StoreChoiceCardProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={() => {
        lightTap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.choiceCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={[styles.choiceIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={30} color={iconColor} />
      </View>
      <View style={styles.choiceText}>
        <Text style={[styles.choiceTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.choiceDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

export default function StoreOnboardingScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const guardRoute = async () => {
      try {
        const { data: { user } } = await authService.getCurrentUser();
        if (!user) {
          router.replace('/login');
          return;
        }

        const hasMembership = await storeService.hasMembership(user.id);
        if (!mounted) return;

        if (hasMembership) {
          router.replace('/(tabs)/history');
          return;
        }

        setChecking(false);
      } catch (error) {
        console.warn('Failed to verify store onboarding state:', error);
        if (mounted) setChecking(false);
      }
    };

    guardRoute();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (checking) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={[styles.title, { color: colors.text }]}>利用方法を選択</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            店舗を作成するか、招待コードで店舗に参加してください
          </Text>
        </View>

        <View style={styles.choiceList}>
          <StoreChoiceCard
            icon="storefront-outline"
            iconColor="#8B5CF6"
            iconBackground={isDark ? '#2f2545' : '#F3E8FF'}
            title="店舗を作成する"
            description="オーナーとして店舗を作成し、メンバーを招待できます"
            onPress={() => router.push('/store/create' as any)}
            testID="store-onboarding-create"
          />
          <StoreChoiceCard
            icon="people-outline"
            iconColor="#1F7AE0"
            iconBackground={isDark ? '#18304c' : '#EAF3FF'}
            title="店舗に参加する"
            description="スタッフとして招待コードを入力し、店舗に参加します"
            onPress={() => router.push('/store/join' as any)}
            testID="store-onboarding-join"
          />
        </View>

        <Text style={[styles.note, { color: colors.textMuted }]}>
          どちらを選んでも、投稿やプロフィールの既存機能はそのまま利用できます。
        </Text>

        <Button
          title="ログアウト"
          variant="ghost"
          size="medium"
          icon="log-out-outline"
          onPress={async () => {
            await authService.signOut();
            router.replace('/welcome' as any);
          }}
          style={styles.logoutButton}
          testID="store-onboarding-logout"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    ...typography.title1,
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    ...typography.subhead,
    textAlign: 'center',
    lineHeight: 22,
  },
  choiceList: {
    gap: 16,
  },
  choiceCard: {
    minHeight: 124,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.medium,
  },
  choiceIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  choiceText: {
    flex: 1,
    paddingRight: 8,
  },
  choiceTitle: {
    ...typography.headline,
    marginBottom: 6,
  },
  choiceDescription: {
    ...typography.footnote,
    lineHeight: 19,
  },
  note: {
    ...typography.caption1,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 26,
    paddingHorizontal: 8,
  },
  logoutButton: {
    marginTop: 18,
    alignSelf: 'center',
  },
});
