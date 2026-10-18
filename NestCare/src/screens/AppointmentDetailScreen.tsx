import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  User,
  Stethoscope,
  CalendarClock,
  FileText,
  StickyNote,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { appointmentsAPI } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';

const statusTone: Record<string, any> = {
  scheduled: 'primary',
  completed: 'success',
  cancelled: 'destructive',
  no_show: 'warning',
};

export default function AppointmentDetailScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { appointmentId } = route.params || {};
  const [appointment, setAppointment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await appointmentsAPI.getOne(appointmentId);
        setAppointment(res.data);
      } catch {
        /* no-op — show empty detail */
      } finally {
        setLoading(false);
      }
    })();
  }, [appointmentId]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Appointment Details" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !appointment ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedText, fontWeight: '600' }}>
            Appointment not found.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statusRow}>
            <Badge
              label={appointment.status}
              tone={statusTone[appointment.status] || 'muted'}
            />
          </View>

          <Card style={styles.card}>
            <Row
              icon={Stethoscope}
              label="Doctor"
              value={appointment.doctorId?.name || '—'}
              colors={colors}
            />
            <Row
              icon={User}
              label="Specialization"
              value={
                (appointment.doctorId?.professionalDetails?.specializations ||
                  [])[0] || '—'
              }
              colors={colors}
            />
            <Row
              icon={CalendarClock}
              label="Date & Time"
              value={new Date(appointment.scheduledAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              colors={colors}
            />
            <Row
              icon={User}
              label="Patient"
              value={appointment.patientId?.name || '—'}
              colors={colors}
              last
            />
          </Card>

          {appointment.type === 'video' &&
            appointment.status === 'scheduled' && (
              <Button
                title="Join video consult"
                onPress={() =>
                  navigation.navigate('VideoCall', {
                    appointmentId: appointment._id,
                    doctorName: appointment.doctorId?.name,
                  })
                }
                style={{ marginBottom: 12 }}
              />
            )}

          {!!appointment.reason && (
            <Card style={styles.card}>
              <View style={styles.blockHeader}>
                <FileText size={16} color={colors.primary} />
                <Text style={[styles.blockTitle, { color: colors.text }]}>
                  Reason for Visit
                </Text>
              </View>
              <Text style={[styles.blockText, { color: colors.mutedText }]}>
                {appointment.reason}
              </Text>
            </Card>
          )}

          {!!appointment.notes && (
            <Card style={styles.card}>
              <View style={styles.blockHeader}>
                <StickyNote size={16} color={colors.secondary} />
                <Text style={[styles.blockTitle, { color: colors.text }]}>
                  Doctor's Notes
                </Text>
              </View>
              <Text style={[styles.blockText, { color: colors.mutedText }]}>
                {appointment.notes}
              </Text>
            </Card>
          )}
        </ScrollView>
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16 },
  statusRow: { marginBottom: 12, alignItems: 'flex-start' },
  card: { marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rowValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  blockTitle: { fontSize: 13, fontWeight: '800' },
  blockText: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
});
