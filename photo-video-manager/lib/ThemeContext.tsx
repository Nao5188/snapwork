import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppThemeColors {
  // 背景
  background: string;
  surface: string;
  surface2: string;
  // テキスト
  text: string;
  textSecondary: string;
  textMuted: string;
  // ボーダー
  border: string;
  borderLight: string;
  // ヘッダー・タブバー
  headerBg: string;
  tabBar: string;
  tabBarBorder: string;
  tabIconActive: string;
  tabIconInactive: string;
  // カード・インプット
  card: string;
  inputBg: string;
  // プライマリ
  primary: string;
  primaryText: string;
}

const lightColors: AppThemeColors = {
  background: '#fafafa',
  surface: '#ffffff',
  surface2: '#f5f5f5',
  text: '#222222',
  textSecondary: '#666666',
  textMuted: '#999999',
  border: '#e5e5e5',
  borderLight: '#f0f0f0',
  headerBg: '#ffffff',
  tabBar: '#ffffff',
  tabBarBorder: '#e5e5e5',
  tabIconActive: '#444444',
  tabIconInactive: '#999999',
  card: '#ffffff',
  inputBg: '#f5f5f5',
  primary: '#444444',
  primaryText: '#ffffff',
};

const darkColors: AppThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  surface2: '#2a2a2a',
  text: '#f0f0f0',
  textSecondary: '#aaaaaa',
  textMuted: '#666666',
  border: '#333333',
  borderLight: '#2a2a2a',
  headerBg: '#1a1a1a',
  tabBar: '#1a1a1a',
  tabBarBorder: '#2a2a2a',
  tabIconActive: '#ffffff',
  tabIconInactive: '#666666',
  card: '#1e1e1e',
  inputBg: '#2a2a2a',
  primary: '#ffffff',
  primaryText: '#121212',
};

const STORAGE_KEY = '@theme_mode';

interface ThemeContextValue {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: AppThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'system',
  isDark: false,
  colors: lightColors,
  setThemeMode: () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeModeState(saved);
      }
    });
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  };

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, colors, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
