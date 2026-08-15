import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const FALLBACK_KEY_PREFIX = '@secure-auth:';
let secureStoreAvailability: Promise<boolean> | null = null;

const getFallbackKey = (key: string) => `${FALLBACK_KEY_PREFIX}${key}`;

const isSecureStoreAvailable = () => {
  if (Platform.OS === 'web') {
    return Promise.resolve(false);
  }

  if (!secureStoreAvailability) {
    secureStoreAvailability = SecureStore.isAvailableAsync()
      .catch(() => false);
  }

  return secureStoreAvailability;
};

const getLegacyAsyncStorageValue = async (key: string) => {
  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue !== null) return legacyValue;

  return AsyncStorage.getItem(getFallbackKey(key));
};

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    if (await isSecureStoreAvailable()) {
      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue !== null) return secureValue;

      const legacyValue = await getLegacyAsyncStorageValue(key);
      if (legacyValue !== null) {
        await SecureStore.setItemAsync(key, legacyValue);
        await AsyncStorage.removeItem(key).catch(() => {});
        await AsyncStorage.removeItem(getFallbackKey(key)).catch(() => {});
      }

      return legacyValue;
    }

    return getLegacyAsyncStorageValue(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (await isSecureStoreAvailable()) {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key).catch(() => {});
      await AsyncStorage.removeItem(getFallbackKey(key)).catch(() => {});
      return;
    }

    await AsyncStorage.setItem(getFallbackKey(key), value);
  },

  async removeItem(key: string): Promise<void> {
    if (await isSecureStoreAvailable()) {
      await SecureStore.deleteItemAsync(key);
    }

    await AsyncStorage.removeItem(key).catch(() => {});
    await AsyncStorage.removeItem(getFallbackKey(key)).catch(() => {});
  },
};
