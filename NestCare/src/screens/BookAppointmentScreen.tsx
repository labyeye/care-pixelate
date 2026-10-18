import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Info } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import {
  doctorsAPI,
  patientsAPI,
  appointmentsAPI,
  slotsAPI,
} from '../services/api';
import Header from '../components/Header';
import Button from '../components/Button';
import Card from '../components/Card';

const DAYS_AHEAD = 7;
const TIME_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
];

function buildDayOptions() {
  const days = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function BookAppointmentScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState(TIME_SLOTS[0]);
  const [slots, setSlots] = useState<any[]>([]);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const days = buildDayOptions();

  useEffect(() => {
    (async () => {
      try {
        const [docRes, patRes] = await Promise.all([
          doctorsAPI.getAll(),
          patientsAPI.getAll(),
        ]);
        setDoctors(docRes.data || []);
        setPatients(patRes.data || []);
        if (docRes.data?.length) setDoctorId(docRes.data[0]._id);
        if (patRes.data?.length) setPatientId(patRes.data[0]._id);
      } catch {
        /* leave pickers empty */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const doctor = doctors.find(d => d._id === doctorId);
  const hasSchedule = !!doctor?.availability?.length;

  useEffect(() => {
    setSlotIso(null);
    setSlots([]);
    if (!doctorId || !hasSchedule) return;
    const d = days[dayIndex];
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    slotsAPI
      .forDoctor(doctorId, date)
      .then(r => setSlots(r.data || []))
      .catch(() => setSlots([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, dayIndex, hasSchedule]);

  const handleSubmit = async () => {
    if (!doctorId) {
      Alert.alert('Select a doctor', 'Please choose a doctor to continue.');
      return;
    }
    if (!patientId) {
      Alert.alert(
        'No patient record found',
        'This tenant has no patient record to link this booking to yet. A staff member needs to register a patient record for you first — patient self-service registration is not a backend capability yet.',
      );
      return;
    }
    if (hasSchedule && !slotIso) {
      Alert.alert('Select a slot', 'Please pick one of the available times.');
      return;
    }
    const [h, m] = time.split(':').map(Number);
    const scheduledAt = new Date(days[dayIndex]);
    scheduledAt.setHours(h, m, 0, 0);

    setSubmitting(true);
    try {
      await appointmentsAPI.create({
        patientId,
        doctorId,
        scheduledAt: hasSchedule
          ? (slotIso as string)
          : scheduledAt.toISOString(),
        reason: reason.trim(),
      });
      Alert.alert(
        'Appointment booked',
        'Your appointment request has been submitted.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      Alert.alert('Booking failed', err.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Book Appointment" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {patients.length === 0 && (
            <View
              style={[
                styles.noteBox,
                { borderColor: colors.warning, backgroundColor: colors.muted },
              ]}
            >
              <Info size={16} color={colors.warning} />
              <Text style={[styles.noteText, { color: colors.text }]}>
                No patient profile found on this account. Patients can sign up
                from the Register screen ("Joining a clinic as a patient?"), or
                clinic staff can create a record for you.
              </Text>
            </View>
          )}

          <Text style={[styles.label, { color: colors.text }]}>
            Select Doctor
          </Text>
          {doctors.length === 0 ? (
            <Card style={styles.card}>
              <Text style={{ color: colors.mutedText, fontWeight: '600' }}>
                No doctors available.
              </Text>
            </Card>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsRow}
            >
              {doctors.map(d => (
                <TouchableOpacity
                  key={d._id}
                  onPress={() => setDoctorId(d._id)}
                  style={[
                    styles.doctorChip,
                    { borderColor: colors.border },
                    doctorId === d._id && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.doctorChipName,
                      {
                        color: doctorId === d._id ? colors.white : colors.text,
                      },
                    ]}
                  >
                    {d.name}
                  </Text>
                  <Text
                    style={[
                      styles.doctorChipSpec,
                      {
                        color:
                          doctorId === d._id ? colors.white : colors.mutedText,
                      },
                    ]}
                  >
                    {(d?.professionalDetails?.specializations || [])[0] ||
                      'General'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={[styles.label, { color: colors.text, marginTop: 20 }]}>
            Select Date
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
          >
            {days.map((d, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setDayIndex(i)}
                style={[
                  styles.dateChip,
                  { borderColor: colors.border },
                  dayIndex === i && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.dateChipDay,
                    { color: dayIndex === i ? colors.white : colors.mutedText },
                  ]}
                >
                  {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                </Text>
                <Text
                  style={[
                    styles.dateChipNum,
                    { color: dayIndex === i ? colors.white : colors.text },
                  ]}
                >
                  {d.getDate()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.label, { color: colors.text, marginTop: 20 }]}>
            Select Time
          </Text>
          <View style={styles.timeGrid}>
            {hasSchedule && slots.length === 0 && (
              <Text style={{ color: colors.mutedText, fontWeight: '600' }}>
                No free slots on this day.
              </Text>
            )}
            {(hasSchedule
              ? slots.map(sl => ({
                  key: sl.start as string,
                  label: new Date(sl.start).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  active: slotIso === sl.start,
                  onPress: () => setSlotIso(sl.start),
                }))
              : TIME_SLOTS.map(t => ({
                  key: t,
                  label: t,
                  active: time === t,
                  onPress: () => setTime(t),
                }))
            ).map(o => (
              <TouchableOpacity
                key={o.key}
                onPress={o.onPress}
                style={[
                  styles.timeChip,
                  { borderColor: colors.border },
                  o.active && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.timeChipText,
                    { color: o.active ? colors.white : colors.text },
                  ]}
                >
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.text, marginTop: 20 }]}>
            Reason for Visit
          </Text>
          <View
            style={[
              styles.inputBorder,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Briefly describe your symptoms or reason"
              placeholderTextColor={colors.mutedText}
              value={reason}
              onChangeText={setReason}
              multiline
            />
          </View>

          <Button
            title="Confirm Booking"
            onPress={handleSubmit}
            loading={submitting}
            style={styles.submitBtn}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  noteBox: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
  },
  noteText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  card: { marginBottom: 10 },
  chipsRow: { flexDirection: 'row' },
  doctorChip: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    minWidth: 130,
  },
  doctorChipName: { fontSize: 13, fontWeight: '800' },
  doctorChipSpec: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  dateChip: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 54,
  },
  dateChipDay: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  dateChipNum: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeChip: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  timeChipText: { fontSize: 13, fontWeight: '800' },
  inputBorder: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
  },
  input: { fontSize: 13, fontWeight: '600', flex: 1, textAlignVertical: 'top' },
  submitBtn: { marginTop: 24 },
});
