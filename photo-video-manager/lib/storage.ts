import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ストレージのキー定数
const STORAGE_KEYS = {
  REMEMBER_ME_ENABLED: 'remember_me_enabled',
  USER_EMAIL: 'user_email',
  AUTO_LOGIN_ENABLED: 'auto_login_enabled',
} as const;

export interface RememberMeData {
  email: string;
  rememberMe: boolean;
  autoLoginEnabled: boolean;
}

// SecureStoreが利用可能かチェック
const isSecureStoreAvailable = async (): Promise<boolean> => {
  // Webプラットフォームではexpo-secure-storeは利用不可
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    await SecureStore.getItemAsync('__test__');
    return true;
  } catch {
    return false;
  }
};

// セキュアストレージへの保存（フォールバック付き）
const secureSetItem = async (key: string, value: string): Promise<void> => {
  if (await isSecureStoreAvailable()) {
    await SecureStore.setItemAsync(key, value);
  } else {
    // Web環境ではAsyncStorageにフォールバック（開発用）
    await AsyncStorage.setItem(`@${key}`, value);
  }
};

// セキュアストレージからの取得（フォールバック付き）
const secureGetItem = async (key: string): Promise<string | null> => {
  if (await isSecureStoreAvailable()) {
    return await SecureStore.getItemAsync(key);
  } else {
    // Web環境ではAsyncStorageにフォールバック（開発用）
    return await AsyncStorage.getItem(`@${key}`);
  }
};

// セキュアストレージからの削除（フォールバック付き）
const secureDeleteItem = async (key: string): Promise<void> => {
  if (await isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(key);
  } else {
    // Web環境ではAsyncStorageにフォールバック（開発用）
    await AsyncStorage.removeItem(`@${key}`);
  }
};

// Remember Me関連のストレージ操作（セキュア版）
export const storageService = {
  // Remember Me状態を保存
  async setRememberMe(email: string, rememberMe: boolean) {
    try {
      await secureSetItem(STORAGE_KEYS.REMEMBER_ME_ENABLED, JSON.stringify(rememberMe));
      if (rememberMe) {
        await secureSetItem(STORAGE_KEYS.USER_EMAIL, email);
        await secureSetItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED, JSON.stringify(true));
      } else {
        // Remember Meが無効の場合は関連データを削除
        await secureDeleteItem(STORAGE_KEYS.USER_EMAIL);
        await secureDeleteItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED);
      }
    } catch (error) {
      console.error('Failed to save Remember Me state:', error);
      throw error;
    }
  },

  // Remember Me状態を取得
  async getRememberMe(): Promise<RememberMeData | null> {
    try {
      const rememberMeStr = await secureGetItem(STORAGE_KEYS.REMEMBER_ME_ENABLED);
      const userEmail = await secureGetItem(STORAGE_KEYS.USER_EMAIL);
      const autoLoginStr = await secureGetItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED);

      const rememberMe = rememberMeStr ? JSON.parse(rememberMeStr) : false;
      const autoLoginEnabled = autoLoginStr ? JSON.parse(autoLoginStr) : false;

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
      await secureDeleteItem(STORAGE_KEYS.REMEMBER_ME_ENABLED);
      await secureDeleteItem(STORAGE_KEYS.USER_EMAIL);
      await secureDeleteItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED);
    } catch (error) {
      console.error('Failed to clear Remember Me state:', error);
      throw error;
    }
  },

  // 自動ログイン有効状態を設定
  async setAutoLoginEnabled(enabled: boolean) {
    try {
      await secureSetItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED, JSON.stringify(enabled));
    } catch (error) {
      console.error('Failed to set auto login enabled:', error);
      throw error;
    }
  },

  // 自動ログイン有効状態を取得
  async getAutoLoginEnabled(): Promise<boolean> {
    try {
      const value = await secureGetItem(STORAGE_KEYS.AUTO_LOGIN_ENABLED);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Failed to get auto login enabled:', error);
      return false;
    }
  },
};