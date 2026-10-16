import AsyncStorage from '@react-native-async-storage/async-storage';

const storage = {
  getItem: async (key: string): Promise<string | null> =>
    AsyncStorage.getItem(key),

  setItem: async (key: string, value: string): Promise<void> => {
    await AsyncStorage.setItem(key, value);
  },

  removeItem: async (key: string): Promise<void> => {
    await AsyncStorage.removeItem(key);
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    await AsyncStorage.multiRemove(keys);
  },
};

export default storage;
