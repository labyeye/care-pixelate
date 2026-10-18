import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { nbShadowSm } from '../theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'destructive';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  fullWidth?: boolean;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  fullWidth = true,
}: ButtonProps) {
  const { colors } = useTheme();

  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? colors.secondary
        : variant === 'destructive'
          ? colors.destructive
          : colors.surface;

  const textColor = variant === 'outline' ? colors.text : colors.white;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.btn,
        nbShadowSm,
        { backgroundColor: bg, borderColor: colors.border },
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  text: {
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
