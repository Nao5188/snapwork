import AsyncStorage from '@react-native-async-storage/async-storage';

// ストレージのキー定数
const STORAGE_KEYS = {
  REMEMBER_ME_ENABLED: '@remember_me_enabled',
  USER_EMAIL: '@user_email',
  AUTO_LOGIN_ENABLED: '@auto_login_enabled',
} as const;

export interface RememberMeData {
  email: string;
  rememberMe: boolean;
  autoLoginEnabled: boolean;
}

// Remember Me関連のストレージ操作
export const storageService = {
  // Remember Me状態を保存
  async setRememberMe(email: string, rememberMe: boolean) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_ME_ENABLED, JSON.stringify(rememberMe));
      if (rememberMe) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
        await AsyncStorage.setItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED, JSON.stringify(true));
      } else {
        // Remember Meが無効の場合は関連データを削除
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.USER_EMAIL,
          STORAGE_KEYS.AUTO_LOGIN_ENABLED,
        ]);
      }
    } catch (error) {
      console.error('Failed to save Remember Me state:', error);
      throw error;
    }
  },

  // Remember Me状態を取得
  async getRememberMe(): Promise<RememberMeData | null> {
    try {
      const [rememberMeStr, email, autoLoginStr] = await AsyncStorage.multiGet([
        STORAGE_KEYS.REMEMBER_ME_ENABLED,
        STORAGE_KEYS.USER_EMAIL,
        STORAGE_KEYS.AUTO_LOGIN_ENABLED,
      ]);

      const rememberMe = rememberMeStr[1] ? JSON.parse(rememberMeStr[1]) : false;
      const userEmail = email[1] || '';
      const autoLoginEnabled = autoLoginStr[1] ? JSON.parse(autoLoginStr[1]) : false;

      if (rememberMe && userEmail) {
        return {
          email: userEmail,
          rememberMe,
          autoLoginEnabled,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get Remember Me state:', error);
      return null;
    }
  },

  // Remember Me状態をクリア
  async clearRememberMe() {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.REMEMBER_ME_ENABLED,
        STORAGE_KEYS.USER_EMAIL,
        STORAGE_KEYS.AUTO_LOGIN_ENABLED,
      ]);
    } catch (error) {
      console.error('Failed to clear Remember Me state:', error);
      throw error;
    }
  },

  // 自動ログイン有効状態を設定
  async setAutoLoginEnabled(enabled: boolean) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED, JSON.stringify(enabled));
    } catch (error) {
      console.error('Failed to set auto login enabled:', error);
      throw error;
    }
  },

  // 自動ログイン有効状態を取得
  async getAutoLoginEnabled(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Failed to get auto login enabled:', error);
      return false;
    }
  },
};