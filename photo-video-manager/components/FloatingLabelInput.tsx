import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Animated,
  TextInputProps,
  ViewStyle,
  StyleProp,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, typography } from '@/lib/theme';

interface FloatingLabelInputProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function FloatingLabelInput({
  label,
  error,
  icon,
  containerStyle,
  value,
  onFocus,
  onBlur,
  ...props
}: FloatingLabelInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      labelAnim.setValue(isFocused || value ? 1 : 0);
      return;
    }

    Animated.timing(labelAnim, {
      toValue: isFocused || value ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [isFocused, value, reduceMotion]);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const labelTop = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 8],
  });

  const labelFontSize = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 12],
  });

  const labelColor = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textMuted, isFocused ? colors.accent : colors.textSecondary],
  });

  return (
    <View style={[styles.container, containerStyle]}>
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputContainerFocused,
          error && styles.inputContainerError,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={isFocused ? colors.accent : colors.textMuted}
            style={styles.icon}
          />
        )}
        <View style={styles.inputWrapper}>
          <Animated.Text
            style={[
              styles.label,
              {
                top: labelTop,
                fontSize: labelFontSize,
                color: error ? colors.error : labelColor,
              },
            ]}
          >
            {label}
          </Animated.Text>
          <TextInput
            style={[styles.input, icon && styles.inputWithIcon]}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholderTextColor="transparent"
            accessible={true}
            accessibilityLabel={label}
            {...props}
          />
        </View>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 60,
    paddingHorizontal: 16,
  },
  inputContainerFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.background,
  },
  inputContainerError: {
    borderColor: colors.error,
  },
  icon: {
    marginRight: 12,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    minHeight: 56,
  },
  label: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'transparent',
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    paddingTop: 18,
    paddingBottom: 6,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  errorText: {
    ...typography.caption1,
    color: colors.error,
    marginTop: 6,
    marginLeft: 16,
  },
});
