import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { HeartPulse } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import storage from '../utils/storage';

export default function SplashScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(async () => {
      if (isAuthenticated) {
        navigation.replace('Main');
        return;
      }
      const seenOnboarding = await storage.getItem('nestcare_onboarded');
      navigation.replace(seenOnboarding === 'true' ? 'Login' : 'Onboarding');
    }, 900);
    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, navigation]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.primary }]}>
      <View
        style={[
          styles.logoBox,
          { borderColor: colors.border, backgroundColor: colors.white },
        ]}
      >
        <HeartPulse size={40} color={colors.primary} />
      </View>
      <Text style={[styles.wordmark, { color: colors.white }]}>NestDoc</Text>
      <Text style={[styles.tagline, { color: colors.white }]}>
        Your health, always within reach
      </Text>
      <ActivityIndicator color={colors.white} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoBox: {
    width: 84,
    height: 84,
    borderWidth: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  wordmark: { fontSize: 32, fontWeight: '900', letterSpacing: 0.5 },
  tagline: { fontSize: 13, fontWeight: '600', marginTop: 6, opacity: 0.9 },
  spinner: { marginTop: 28 },
});
