import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Animated,
  Pressable,
  ViewStyle,
  TextStyle,
  StyleProp,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { colors, borderRadius, shadows, typography } from '@/lib/theme';
import { lightTap } from '@/lib/haptics';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  gradient?: readonly [string, string, ...string[]];
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export default function GradientButton({
  title,
  onPress,
  gradient,
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: GradientButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const handlePressIn = () => {
    if (reduceMotion || disabled || loading) return;
    lightTap();
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (reduceMotion || disabled || loading) return;
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (!disabled && !loading) {
      onPress();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessible={true}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      testID={testID}
    >
      <Animated.View
        style={[
          { transform: [{ scale: scaleAnim }] },
          (disabled || loading) && styles.disabled,
        ]}
      >
        <View style={[styles.button, shadows.medium, style]}>
          {loading ? (
            <ActivityIndicator color={colors.textLight} size="small" />
          ) : (
            <Text style={[styles.buttonText, textStyle]}>{title}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    backgroundColor: '#2196F3',
  },
  buttonText: {
    ...typography.headline,
    color: colors.textLight,
  },
  disabled: {
    opacity: 0.6,
  },
});
