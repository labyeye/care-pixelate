import React, { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

export default function Header({ title, subtitle, onBack, right }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          paddingTop: insets.top + 10,
        },
      ]}
    >
      {onBack ? (
        <TouchableOpacity
          style={[styles.backBtn, { borderColor: colors.border }]}
          onPress={onBack}
        >
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={styles.backBtnSpacer} />
      )}
      <View style={styles.titleWrap}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedText }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightWrap}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 2,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: { width: 4 },
  titleWrap: { flex: 1 },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  rightWrap: { minWidth: 4, alignItems: 'flex-end' },
});
