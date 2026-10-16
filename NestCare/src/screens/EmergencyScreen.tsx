import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhoneCall, Phone, User } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import Card from '../components/Card';
import { nbShadow } from '../theme';

// Mock contacts — no emergency-contacts backend model exists yet, but tap-to-call
// via Linking works for real without any backend.
const CONTACTS = [
  { id: '1', name: 'City Hospital Emergency', relation: 'Hospital', phone: '+911234567890' },
  { id: '2', name: 'Dr. Rao (Primary Physician)', relation: 'Doctor', phone: '+919876543210' },
  { id: '3', name: 'Ramesh Kumar', relation: 'Emergency Contact', phone: '+919812345678' },
];

const EMERGENCY_NUMBER = '108'; // India national emergency number

function call(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Unable to place call', 'No dialer available on this device.'));
}

export default function EmergencyScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Emergency" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.sosBtn, { borderColor: colors.border, backgroundColor: colors.destructive }, nbShadow]}
          onPress={() => call(EMERGENCY_NUMBER)}
          activeOpacity={0.85}
        >
          <PhoneCall size={36} color={colors.white} />
          <Text style={styles.sosText}>CALL EMERGENCY</Text>
          <Text style={styles.sosSub}>{EMERGENCY_NUMBER}</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>EMERGENCY CONTACTS</Text>
        <FlatList
          data={CONTACTS}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item }) => (
            <Card style={styles.contactCard}>
              <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <User size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.relation, { color: colors.mutedText }]}>{item.relation}</Text>
              </View>
              <TouchableOpacity
                style={[styles.callBtn, { borderColor: colors.border, backgroundColor: colors.success }]}
                onPress={() => call(item.phone)}
              >
                <Phone size={16} color={colors.white} />
              </TouchableOpacity>
            </Card>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { flex: 1, padding: 16 },
  sosBtn: { borderWidth: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 28, marginBottom: 24 },
  sosText: { fontSize: 18, fontWeight: '900', color: '#fff', marginTop: 10, letterSpacing: 0.5 },
  sosSub: { fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 4, opacity: 0.9 },
  sectionLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '800' },
  relation: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  callBtn: { width: 38, height: 38, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
