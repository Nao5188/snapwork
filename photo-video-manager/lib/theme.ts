// SalonCloud & SnapWork カラーシステム

export const colors = {
  // Primary colors
  primary: '#1a1a1a',
  primaryLight: '#333333',
  primaryDark: '#000000',

  // Accent colors
  accent: '#007AFF',
  accentLight: '#4DA3FF',
  accentDark: '#0056B3',

  // Gradient colors
  gradientStart: '#667eea',
  gradientEnd: '#764ba2',
  gradientBlue: '#4facfe',
  gradientGreen: '#00f2fe',

  // Background colors
  background: '#fafafa',
  backgroundDark: '#121212',
  cardBackground: '#ffffff',
  cardBackgroundDark: '#1e1e1e',

  // Text colors
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',
  textLight: '#ffffff',

  // Border colors
  border: '#e5e5e5',
  borderLight: '#f0f0f0',
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
  primary: ['#667eea', '#764ba2'],
  blue: ['#4facfe', '#00f2fe'],
  purple: ['#a18cd1', '#fbc2eb'],
  orange: ['#fa709a', '#fee140'],
  dark: ['#1a1a1a', '#333333'],
  glass: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)'],
};

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
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
