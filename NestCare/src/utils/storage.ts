import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

// The auth token lives in the OS keychain/keystore, everything else in AsyncStorage.
const SECURE_KEYS = ['token'];
const secure = (key: string) => SECURE_KEYS.includes(key);

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!secure(key)) return AsyncStorage.getItem(key);
    const c = await Keychain.getGenericPassword({ service: key });
    if (c) return c.password;
    // one-time migration of tokens saved by older builds
    const old = await AsyncStorage.getItem(key);
    if (old) {
      await Keychain.setGenericPassword(key, old, { service: key });
      await AsyncStorage.removeItem(key);
    }
    return old;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (secure(key)) await Keychain.setGenericPassword(key, value, { service: key });
    else await AsyncStorage.setItem(key, value);
  },

  removeItem: async (key: string): Promise<void> => {
    if (secure(key)) await Keychain.resetGenericPassword({ service: key });
    await AsyncStorage.removeItem(key);
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    await AsyncStorage.multiRemove(keys);
    await Promise.all(keys.filter(secure).map((k) => Keychain.resetGenericPassword({ service: k })));
  },
};

export default storage;
