import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Pill, User, CalendarDays } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import Card from '../components/Card';

export default function PrescriptionDetailScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const rx = route.params?.prescription;
  const meds: any[] = rx?.prescription?.items || [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Prescription" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Row
            icon={User}
            label="Prescribed By"
            value={rx?.doctorId?.name || '—'}
            colors={colors}
          />
          <Row
            icon={CalendarDays}
            label="Date"
            value={
              rx
                ? new Date(rx.signedAt || rx.createdAt).toLocaleDateString(
                    'en-IN',
                  )
                : '—'
            }
            colors={colors}
            last
          />
        </Card>

        {meds.map((m, i) => (
          <Card key={i} style={styles.med}>
            <View style={styles.headerRow}>
              <View
                style={[
                  styles.icon,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.secondary,
                  },
                ]}
              >
                <Pill size={18} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.medicine, { color: colors.text }]}>
                  {m.drug}
                </Text>
                <Text style={[styles.dosage, { color: colors.mutedText }]}>
                  {[m.dose, m.frequency, m.days ? `${m.days} days` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {!!m.instructions && (
                  <Text style={[styles.dosage, { color: colors.mutedText }]}>
                    {m.instructions}
                  </Text>
                )}
              </View>
            </View>
          </Card>
        ))}

        {!!rx?.prescription?.advice && (
          <Card style={styles.med}>
            <Text style={[styles.rowLabel, { color: colors.mutedText }]}>
              Advice
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {rx.prescription.advice}
            </Text>
          </Card>
        )}
        {!!rx?.followUpOn && (
          <Card style={styles.med}>
            <Text style={[styles.rowLabel, { color: colors.mutedText }]}>
              Follow-up
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {new Date(rx.followUpOn).toLocaleDateString('en-IN')}
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ icon: Icon, label, value, colors, last }: any) {
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.muted },
      ]}
    >
      <View style={[styles.rowIcon, { borderColor: colors.border }]}>
        <Icon size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.mutedText }]}>
          {label}
        </Text>
        <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicine: { fontSize: 16, fontWeight: '900' },
  dosage: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  card: {},
  med: { marginBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  rowValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
});
