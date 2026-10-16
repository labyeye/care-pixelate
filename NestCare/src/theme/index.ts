import { lightColors, darkColors, ThemeColors } from './colors';

export { lightColors, darkColors };
export type { ThemeColors };

export const radius = 8; // NestHR / NestLeads / NestSports card radius

export const FONT = {
  regular: 'DMSans-Regular',
  medium: 'DMSans-Medium',
  semiBold: 'DMSans-SemiBold',
  bold: 'DMSans-Bold',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Hard offset "neo-brutalist" shadow — same recipe used across the web apps,
// approximated in RN via elevation (Android) + shadow* props (iOS).
// The NestHR look: a heavy right + bottom edge instead of a blurred shadow.
export const nbShadow = {
  borderRadius: 8,
  borderRightWidth: 5,
  borderBottomWidth: 5,
};

export const nbShadowSm = {
  borderRadius: 8,
  borderRightWidth: 4,
  borderBottomWidth: 4,
};

export const borderWidth = 2;
