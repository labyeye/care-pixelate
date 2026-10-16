// Pixelate Nest "neo-brutalist" design language — light + dark palettes.
// Hardcoded hex values since React Native has no CSS variables.

export const lightColors = {
  primary: '#024BAB',
  secondary: '#FA731C',
  success: '#00C48C',
  warning: '#F59E0B',
  destructive: '#EF4444',
  border: '#0A0A0A',
  text: '#0A0A0A',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  muted: '#E9EEF5',
  mutedText: '#616161',
  white: '#FFFFFF',
  black: '#0A0A0A',
  purple: '#A855F7',
  teal: '#0D9488',
  lime: '#A3E635',
  pink: '#FF3366',
};

export const darkColors = {
  primary: '#3B82F6',
  secondary: '#FA731C',
  success: '#00C48C',
  warning: '#F59E0B',
  destructive: '#F87171',
  border: '#F3F7FC',
  text: '#F3F7FC',
  background: '#0A0A0A',
  surface: '#171717',
  muted: '#262626',
  mutedText: '#A3A3A3',
  white: '#FFFFFF',
  black: '#0A0A0A',
  purple: '#C084FC',
  teal: '#2DD4BF',
  lime: '#BEF264',
  pink: '#FF6690',
};

export type ThemeColors = typeof lightColors;

// Default export kept for convenience in files that don't need dark mode.
export const colors = lightColors;
