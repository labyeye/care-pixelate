import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stethoscope, FileText, FlaskConical, Syringe } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';

// Mock timeline — no dedicated health-events backend model exists yet.
const EVENTS = [
  { type: 'visit', title: 'Consultation with Dr. Rao', desc: 'General checkup — mild fever', date: '12 Jul 2026' },
  { type: 'prescription', title: 'Prescription issued', desc: 'Amoxicillin 500mg, 3x daily', date: '12 Jul 2026' },
  { type: 'lab', title: 'Lab test completed', desc: 'Complete Blood Count — normal', date: '08 Jul 2026' },
  { type: 'vaccine', title: 'Vaccination', desc: 'Influenza vaccine administered', date: '15 Jun 2026' },
  { type: 'visit', title: 'Follow-up with Dr. Iyer', desc: 'Vitamin D deficiency review', date: '02 Jun 2026' },
  { type: 'lab', title: 'Lab test completed', desc: 'Lipid Profile — borderline', date: '20 May 2026' },
];

const ICONS: Record<string, any> = { visit: Stethoscope, prescription: FileText, lab: FlaskConical, vaccine: Syringe };

export default function HealthTimelineScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const toneColor: Record<string, string> = {
    visit: colors.primary,
    prescription: colors.secondary,
    lab: colors.teal,
    vaccine: colors.purple,
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Health Timeline" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {EVENTS.map((e, i) => {
          const Icon = ICONS[e.type];
          const color = toneColor[e.type];
          return (
            <View key={i} style={styles.row}>
              <View style={styles.markerCol}>
                <View style={[styles.marker, { borderColor: colors.border, backgroundColor: color }]}>
                  <Icon size={14} color={colors.white} />
                </View>
                {i < EVENTS.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
              </View>
              <View style={styles.eventBody}>
                <Text style={[styles.eventDate, { color: colors.mutedText }]}>{e.date}</Text>
                <Text style={[styles.eventTitle, { color: colors.text }]}>{e.title}</Text>
                <Text style={[styles.eventDesc, { color: colors.mutedText }]}>{e.desc}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16 },
  row: { flexDirection: 'row' },
  markerCol: { alignItems: 'center', width: 40 },
  marker: { width: 30, height: 30, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginVertical: 2 },
  eventBody: { flex: 1, paddingBottom: 20 },
  eventDate: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  eventTitle: { fontSize: 14, fontWeight: '900', marginTop: 3 },
  eventDesc: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
