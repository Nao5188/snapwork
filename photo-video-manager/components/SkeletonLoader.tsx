import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, StyleProp, Dimensions } from 'react-native';
import { borderRadius } from '@/lib/theme';
import { useAppTheme } from '@/lib/ThemeContext';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HORIZONTAL_MARGIN = 10;
const CARD_PADDING = 10;
const MEDIA_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2 - CARD_PADDING * 2;
const DEFAULT_MEDIA_ASPECT_RATIO = 3 / 4;
const CARD_MEDIA_HEIGHT = Math.round(MEDIA_WIDTH / DEFAULT_MEDIA_ASPECT_RATIO);

export default function SkeletonLoader({
  width = '100%',
  height = 20,
  borderRadius: radius = borderRadius.md,
  style,
}: SkeletonLoaderProps) {
  const { colors } = useAppTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width as any, height, borderRadius: radius, backgroundColor: colors.border },
        { opacity },
        style,
      ]}
    />
  );
}

// 投稿カード用スケルトン
export function PostCardSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.postCardSkeleton, { backgroundColor: colors.surface }]}>
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <SkeletonLoader width={40} height={40} borderRadius={20} />
        <View style={styles.profileInfo}>
          <SkeletonLoader width={120} height={14} />
          <SkeletonLoader width={80} height={12} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Image */}
      <SkeletonLoader
        width="100%"
        height={CARD_MEDIA_HEIGHT}
        borderRadius={10}
        style={{ marginTop: 10 }}
      />

      {/* Content */}
      <View style={styles.content}>
        <SkeletonLoader width={60} height={14} />
        <SkeletonLoader width="80%" height={14} style={{ marginTop: 8 }} />
        <SkeletonLoader width={100} height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

// プロフィール用スケルトン
export function ProfileSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.profileSkeleton, { backgroundColor: colors.surface }]}>
      <SkeletonLoader width={100} height={100} borderRadius={50} />
      <SkeletonLoader width={150} height={20} style={{ marginTop: 16 }} />
      <SkeletonLoader width={100} height={14} style={{ marginTop: 8 }} />
      <View style={styles.statsRow}>
        <SkeletonLoader width={60} height={40} />
        <SkeletonLoader width={60} height={40} />
        <SkeletonLoader width={60} height={40} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {},
  postCardSkeleton: {
    marginHorizontal: CARD_HORIZONTAL_MARGIN,
    marginTop: 10,
    marginBottom: 14,
    padding: CARD_PADDING,
    borderRadius: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  content: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  profileSkeleton: {
    alignItems: 'center' as const,
    padding: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 16,
  },
});
