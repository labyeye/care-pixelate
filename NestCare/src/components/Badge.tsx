import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

type Tone = 'primary' | 'secondary' | 'success' | 'warning' | 'destructive' | 'muted';

interface BadgeProps {
  label: string;
  tone?: Tone;
}

export default function Badge({ label, tone = 'muted' }: BadgeProps) {
  const { colors } = useTheme();

  const toneColor: Record<Tone, string> = {
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    warning: colors.warning,
    destructive: colors.destructive,
    muted: colors.mutedText,
  };

  const bg = tone === 'muted' ? colors.muted : toneColor[tone];
  const textColor = tone === 'muted' ? colors.text : colors.white;

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
