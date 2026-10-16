import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { lightColors, darkColors, ThemeColors } from '../theme/colors';
import storage from '../utils/storage';

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: lightColors,
  toggleTheme: () => {},
  isLoading: true,
});

const STORAGE_KEY = 'nestcare_dark_mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem(STORAGE_KEY);
      if (stored === 'true') setIsDark(true);
      setIsLoading(false);
    })();
  }, []);

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      storage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors: isDark ? darkColors : lightColors,
        toggleTheme,
        isLoading,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
