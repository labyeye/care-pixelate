import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  GraduationCap,
  BadgeCheck,
  Building2,
  Phone,
  Mail,
  Clock,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { doctorsAPI } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export default function DoctorDetailScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { doctorId } = route.params || {};
  const [doctor, setDoctor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await doctorsAPI.getOne(doctorId);
        setDoctor(res.data);
      } catch {
        /* no-op */
      } finally {
        setLoading(false);
      }
    })();
  }, [doctorId]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Doctor Profile" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !doctor ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedText, fontWeight: '600' }}>
            Doctor not found.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileRow}>
            <View
              style={[
                styles.avatar,
                { borderColor: colors.border, backgroundColor: colors.primary },
              ]}
            >
              <Text style={styles.avatarText}>
                {(doctor.name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>
                {doctor.name}
              </Text>
              <Text style={[styles.spec, { color: colors.primary }]}>
                {(doctor?.professionalDetails?.specializations || [])[0] ||
                  'General Physician'}
              </Text>
            </View>
          </View>

          <Card style={styles.card}>
            <Row
              icon={GraduationCap}
              label="Qualification"
              value={
                (doctor.professionalDetails?.qualifications || [])
                  .map((q: any) => q.degree)
                  .join(', ') || '—'
              }
              colors={colors}
            />
            <Row
              icon={BadgeCheck}
              label="Registration No."
              value={doctor.professionalDetails?.registrationNumber || '—'}
              colors={colors}
            />
            <Row
              icon={Building2}
              label="Experience"
              value={
                doctor.professionalDetails?.experienceYears
                  ? `${doctor.professionalDetails.experienceYears} yrs`
                  : '—'
              }
              colors={colors}
            />
            <Row
              icon={Phone}
              label="Phone"
              value={doctor.contact?.phone || '—'}
              colors={colors}
            />
            <Row
              icon={Mail}
              label="Email"
              value={doctor.contact?.email || '—'}
              colors={colors}
              last
            />
          </Card>

          <View style={styles.blockHeader}>
            <Clock size={16} color={colors.secondary} />
            <Text style={[styles.blockTitle, { color: colors.text }]}>
              Availability
            </Text>
          </View>
          {doctor.availability?.length ? (
            <Card style={styles.card}>
              {doctor.availability.map((slot: any, i: number) => (
                <View
                  key={i}
                  style={[
                    styles.availRow,
                    i < doctor.availability.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.muted,
                    },
                  ]}
                >
                  <Text style={[styles.availDay, { color: colors.text }]}>
                    {DAY_LABELS[slot.day] || slot.day}
                  </Text>
                  <Text style={[styles.availTime, { color: colors.mutedText }]}>
                    {slot.startTime} – {slot.endTime}
                  </Text>
                </View>
              ))}
            </Card>
          ) : (
            <Card style={styles.card}>
              <Text style={{ color: colors.mutedText, fontWeight: '600' }}>
                No availability listed yet.
              </Text>
            </Card>
          )}

          <Button
            title="Book Appointment"
            onPress={() => navigation.navigate('BookAppointment', { doctorId })}
            style={styles.bookBtn}
          />
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
  content: { padding: 16, paddingBottom: 40 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  avatar: {
    width: 62,
    height: 62,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: '#fff' },
  name: { fontSize: 19, fontWeight: '900' },
  spec: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  card: { marginBottom: 16 },
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
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  blockTitle: { fontSize: 14, fontWeight: '900' },
  availRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  availDay: { fontSize: 13, fontWeight: '700' },
  availTime: { fontSize: 12, fontWeight: '600' },
  bookBtn: { marginTop: 8 },
});
