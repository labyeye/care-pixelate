import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LucideIcon, Inbox } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ icon: Icon = Inbox, title, subtitle }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
        <Icon size={28} color={colors.mutedText} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.mutedText }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  iconBox: {
    width: 64,
    height: 64,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 4 },
});
