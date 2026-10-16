import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  noShadow?: boolean; // kept for call-site compatibility
}

export default function Card({ children, style, noShadow }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRightColor: '#0A0A0A', borderBottomColor: '#0A0A0A' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same card as NestHR / NestLeads / NestSports: rounded, heavy right + bottom edge.
  card: {
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    padding: 14,
  },
});
