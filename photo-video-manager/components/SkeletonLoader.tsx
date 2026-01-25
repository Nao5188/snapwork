import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, StyleProp } from 'react-native';
import { colors, borderRadius } from '@/lib/theme';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export default function SkeletonLoader({
  width = '100%',
  height = 20,
  borderRadius: radius = borderRadius.md,
  style,
}: SkeletonLoaderProps) {
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
  }, []);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: radius,
          opacity,
        },
        style,
      ]}
    />
  );
}

// 投稿カード用スケルトン
export function PostCardSkeleton() {
  return (
    <View style={styles.postCardSkeleton}>
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
        height={300}
        borderRadius={0}
        style={{ marginVertical: 8 }}
      />

      {/* Actions */}
      <View style={styles.actions}>
        <SkeletonLoader width={28} height={28} borderRadius={14} />
        <SkeletonLoader width={28} height={28} borderRadius={14} style={{ marginLeft: 16 }} />
      </View>

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
  return (
    <View style={styles.profileSkeleton}>
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
  skeleton: {
    backgroundColor: colors.border,
  },
  postCardSkeleton: {
    backgroundColor: colors.cardBackground,
    marginBottom: 12,
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  content: {
    paddingTop: 4,
  },
  profileSkeleton: {
    alignItems: 'center',
    padding: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 16,
  },
});
