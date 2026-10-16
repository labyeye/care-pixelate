import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Moon, Bell, LogOut, User } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import Card from '../components/Card';

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [apptReminders, setApptReminders] = useState(true);
  const [labAlerts, setLabAlerts] = useState(true);
  const [messageAlerts, setMessageAlerts] = useState(false);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.primary }]}>
            <User size={24} color={colors.white} />
          </View>
          <View>
            <Text style={[styles.name, { color: colors.text }]}>{user?.name || 'Patient'}</Text>
            <Text style={[styles.email, { color: colors.mutedText }]}>{user?.email || ''}</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>APPEARANCE</Text>
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Moon size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </Card>

        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>NOTIFICATIONS</Text>
        <Card style={styles.card}>
          <View style={[styles.rowBetween, styles.rowBorder, { borderBottomColor: colors.muted }]}>
            <View style={styles.rowLeft}>
              <Bell size={18} color={colors.secondary} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>Appointment Reminders</Text>
            </View>
            <Switch
              value={apptReminders}
              onValueChange={setApptReminders}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
          <View style={[styles.rowBetween, styles.rowBorder, { borderBottomColor: colors.muted }]}>
            <View style={styles.rowLeft}>
              <Bell size={18} color={colors.teal} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>Lab Result Alerts</Text>
            </View>
            <Switch
              value={labAlerts}
              onValueChange={setLabAlerts}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Bell size={18} color={colors.purple} />
              <Text style={[styles.rowLabel, { color: colors.text }]}>Message Alerts</Text>
            </View>
            <Switch
              value={messageAlerts}
              onValueChange={setMessageAlerts}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </Card>

        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.border, backgroundColor: colors.destructive }]}
          onPress={handleLogout}
        >
          <LogOut size={18} color={colors.white} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  avatar: { width: 56, height: 56, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '900' },
  email: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  card: { marginBottom: 22, padding: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontSize: 13, fontWeight: '700' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: 8, paddingVertical: 14 },
  logoutText: { fontSize: 14, fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
});
