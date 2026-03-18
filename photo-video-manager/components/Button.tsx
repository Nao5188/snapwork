import React, { useRef, useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  StyleProp,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buttons } from '@/lib/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export default function Button({
  title,
  onPress,
  onLongPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
  textStyle,
  children,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const handlePressIn = () => {
    if (reduceMotion || disabled || loading) return;

    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (reduceMotion) return;

    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const sizeStyle = buttons.sizes[size];
  const variantStyle = buttons.variants[variant];

  const containerStyles: StyleProp<ViewStyle>[] = [
    styles.container,
    {
      paddingVertical: sizeStyle.paddingVertical,
      paddingHorizontal: sizeStyle.paddingHorizontal,
      borderRadius: sizeStyle.borderRadius,
    },
    variantStyle.container as ViewStyle,
    fullWidth ? styles.fullWidth : undefined,
    (disabled || loading) ? (variantStyle.disabled as ViewStyle) : undefined,
    (disabled || loading) ? styles.disabled : undefined,
  ];

  const textStyles: TextStyle[] = [
    styles.text,
    { fontSize: sizeStyle.fontSize },
    variantStyle.text as TextStyle,
  ];

  const iconSize = size === 'small' ? 16 : size === 'large' ? 20 : 18;
  const iconColor = variantStyle.text.color as string;

  const renderContent = () => {
    if (loading) {
      return (
        <ActivityIndicator
          size="small"
          color={iconColor}
        />
      );
    }

    if (children) {
      return children;
    }

    return (
      <View style={styles.content}>
        {icon && iconPosition === 'left' && (
          <Ionicons
            name={icon}
            size={iconSize}
            color={iconColor}
            style={styles.iconLeft}
          />
        )}
        {title && (
          <Text style={[textStyles, textStyle]}>{title}</Text>
        )}
        {icon && iconPosition === 'right' && (
          <Ionicons
            name={icon}
            size={iconSize}
            color={iconColor}
            style={styles.iconRight}
          />
        )}
      </View>
    );
  };

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        accessible={true}
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading }}
        style={fullWidth ? styles.fullWidth : undefined}
        testID={testID}
      >
        <Animated.View
          style={[
            fullWidth ? styles.fullWidth : undefined,
            (disabled || loading) ? styles.disabled : undefined,
            style,
            !reduceMotion && { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View
            style={[
              styles.container,
              {
                paddingVertical: sizeStyle.paddingVertical,
                paddingHorizontal: sizeStyle.paddingHorizontal,
                borderRadius: sizeStyle.borderRadius,
                backgroundColor: (disabled || loading) ? '#cccccc' : '#444444',
              },
            ]}
          >
            {renderContent()}
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessible={true}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      style={fullWidth ? styles.fullWidth : undefined}
      testID={testID}
    >
      <Animated.View
        style={[
          containerStyles,
          style,
          !reduceMotion && { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {renderContent()}
      </Animated.View>
    </Pressable>
  );
}

// アイコンボタン
interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  iconColor?: string;
  accessibilityLabel?: string;
}

export function IconButton({
  icon,
  onPress,
  onLongPress,
  variant = 'secondary',
  size = 'medium',
  disabled = false,
  style,
  iconColor,
  accessibilityLabel,
}: IconButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const handlePressIn = () => {
    if (reduceMotion || disabled) return;

    Animated.timing(scaleAnim, {
      toValue: 0.95,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (reduceMotion) return;

    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const sizeStyle = buttons.icon[size];
  const variantStyle = buttons.variants[variant];
  const finalIconColor = iconColor || (variantStyle.text.color as string);
  const iconSize = size === 'small' ? 18 : size === 'large' ? 24 : 20;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={[
          styles.iconButton,
          sizeStyle,
          variantStyle.container as ViewStyle,
          disabled && (variantStyle.disabled as ViewStyle),
          disabled && styles.disabled,
          style,
          !reduceMotion && { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color={finalIconColor} />
      </Animated.View>
    </Pressable>
  );
}

// タグボタン
interface TagButtonProps {
  title: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function TagButton({
  title,
  selected = false,
  onPress,
  onLongPress,
  style,
  disabled = false,
}: TagButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const handlePressIn = () => {
    if (reduceMotion || disabled) return;

    Animated.timing(scaleAnim, {
      toValue: 0.95,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (reduceMotion) return;

    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessible={true}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      <Animated.View
        style={[
          styles.tagContainer,
          selected && styles.tagContainerSelected,
          disabled && styles.disabled,
          style,
          !reduceMotion && { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={[styles.tagText, selected && styles.tagTextSelected]}>
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagContainer: {
    paddingHorizontal: buttons.tag.container.paddingHorizontal,
    paddingVertical: buttons.tag.container.paddingVertical,
    borderRadius: buttons.tag.container.borderRadius,
    backgroundColor: buttons.tag.container.backgroundColor,
    borderWidth: buttons.tag.container.borderWidth,
    borderColor: buttons.tag.container.borderColor,
  },
  tagContainerSelected: {
    backgroundColor: buttons.tag.containerSelected.backgroundColor,
    borderColor: buttons.tag.containerSelected.borderColor,
  },
  tagText: {
    fontSize: buttons.tag.text.fontSize,
    fontWeight: buttons.tag.text.fontWeight,
    color: buttons.tag.text.color,
  },
  tagTextSelected: {
    color: buttons.tag.textSelected.color,
  },
});
