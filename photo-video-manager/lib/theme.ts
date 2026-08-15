// SalonCloud & SnapWork カラーシステム

export const colors = {
  // Primary colors
  primary: '#2196F3',
  primaryLight: '#42A5F5',
  primaryDark: '#1976D2',

  // Accent colors
  accent: '#2196F3',
  accentLight: '#64B5F6',
  accentDark: '#1976D2',

  // Gradient colors
  gradientStart: '#667eea',
  gradientEnd: '#764ba2',
  gradientBlue: '#4facfe',
  gradientGreen: '#00f2fe',

  // Background colors
  backgroundBase: '#F8F7FF',
  backgroundFA: '#F8F7FF',
  background: '#fafafa',
  backgroundFB: '#FFFFFF',
  backgroundSurface: '#FFFFFF',
  backgroundDark: '#121212',
  cardBackground: '#ffffff',
  cardBackgroundDark: '#1e1e1e',

  // Text colors
  textPrimary: '#444444',
  textSecondary: '#666666',
  textMuted: '#999999',
  textLight: '#ffffff',

  // Border colors
  border: '#e5e5e5',
  borderLight: '#f0f0f0',
  borderStrong: '#E5E7EB',
  borderDark: '#333333',

  // Status colors
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#007AFF',

  // Social colors
  like: '#FF3B30',
  likeBackground: 'rgba(255, 59, 48, 0.1)',
};

export const gradients = {
  primary: ['#667eea', '#764ba2'] as const,
  secondary: ['#667EEA', '#764BA2'] as const,
  blue: ['#4facfe', '#00f2fe'] as const,
  salonBlue: ['#2196F3', '#1976D2'] as const,
  purple: ['#a18cd1', '#fbc2eb'] as const,
  orange: ['#fa709a', '#fee140'] as const,
  dark: ['#444444', '#333333'] as const,
  glass: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)'] as const,
  softPurple: ['#F8F7FF', '#F3E8FF'] as const,
};

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 48,
    elevation: 12,
  },
  card: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 32,
  full: 9999,
};

export const typography = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  title2: {
    fontSize: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 17,
    fontWeight: '400' as const,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400' as const,
  },
  subhead: {
    fontSize: 15,
    fontWeight: '400' as const,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400' as const,
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400' as const,
  },
};

// ボタンスタイル
export const buttons = {
  // サイズ
  sizes: {
    small: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      fontSize: 13,
    },
    medium: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
      fontSize: 14,
    },
    large: {
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 14,
      fontSize: 16,
    },
  },

  // バリアント
  variants: {
    primary: {
      container: {
        backgroundColor: colors.primary,
        borderWidth: 0,
      },
      text: {
        color: colors.textLight,
        fontWeight: '600' as const,
      },
      disabled: {
        backgroundColor: '#D1D5DB',
      },
    },
    secondary: {
      container: {
        backgroundColor: '#F3F4F6',
        borderWidth: 0,
      },
      text: {
        color: colors.primary,
        fontWeight: '600' as const,
      },
      disabled: {
        backgroundColor: '#E5E7EB',
      },
    },
    outline: {
      container: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: colors.primary,
      },
      text: {
        color: colors.primary,
        fontWeight: '500' as const,
      },
      disabled: {
        borderColor: colors.border,
      },
    },
    danger: {
      container: {
        backgroundColor: colors.primary,
        borderWidth: 1,
        borderColor: colors.primary,
      },
      text: {
        color: colors.textLight,
        fontWeight: '600' as const,
      },
      disabled: {
        backgroundColor: '#f5f5f5',
        borderColor: '#e5e5e5',
      },
    },
    ghost: {
      container: {
        backgroundColor: 'transparent',
        borderWidth: 0,
      },
      text: {
        color: colors.primary,
        fontWeight: '500' as const,
      },
      disabled: {
        opacity: 0.5,
      },
    },
  },

  // アイコンボタン
  icon: {
    small: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    medium: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    large: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
  },

  // カテゴリ/タグボタン
  tag: {
    container: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: '#f5f5f5',
      borderWidth: 1.5,
      borderColor: '#e5e5e5',
    },
    containerSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    text: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: '#333333',
    },
    textSelected: {
      color: colors.textLight,
    },
  },
};
