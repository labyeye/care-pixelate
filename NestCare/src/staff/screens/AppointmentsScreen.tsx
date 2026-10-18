import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Download,
  Play,
  Plus,
  Receipt,
  Stethoscope,
  Trash2,
  UserX,
  Video,
  X,
  XCircle,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { SelectInput } from '../form';
import { confirm, fail, useLoad } from '../hooks';
import ListPage from '../ListPage';
import { receiptNumber, shareReceipt } from '../receipt';
import {
  Btn,
  C,
  Chip,
  fmtDate,
  fmtTime,
  HeaderBtn,
  Item,
  label,
  money,
  personName,
  Pill,
  Stat,
  StatGrid,
  ymd,
} from '../ui';

const DAY = 86_400_000;
const TYPES = [
  { key: 'in_clinic', label: 'In clinic' },
  { key: 'video', label: 'Video' },
  { key: 'walk_in', label: 'Walk-in' },
];

function BookModal({
  visible,
  presetPatient,
  onClose,
  onDone,
}: {
  visible: boolean;
  presetPatient?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(ymd(new Date()));
  const [slot, setSlot] = useState('');
  const [manual, setManual] = useState('');
  const [type, setType] = useState('in_clinic');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const patients = useLoad(
    () => (visible ? api.patients.list() : Promise.resolve([])),
    [visible],
  );
  const doctors = useLoad(
    () => (visible ? api.doctors.list() : Promise.resolve([])),
    [visible],
  );
  const doctor = (doctors.data ?? []).find((d: any) => d._id === doctorId);
  const hasSchedule = !!doctor?.availability?.length;
  const slots = useLoad(
    () =>
      visible && doctorId && hasSchedule && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? api.slots(doctorId, date)
        : Promise.resolve([]),
    [visible, doctorId, date, hasSchedule],
  );

  useEffect(() => {
    if (visible) {
      setPatientId(presetPatient ?? '');
      setDoctorId('');
      setDate(ymd(new Date()));
      setSlot('');
      setManual('');
      setType('in_clinic');
      setReason('');
    }
  }, [visible, presetPatient]);

  const submit = async () => {
    const scheduledAt = hasSchedule
      ? slot
      : manual && /^\d{2}:\d{2}$/.test(manual)
        ? `${date}T${manual}:00+05:30`
        : '';
    if (!patientId || !doctorId || !scheduledAt)
      return Alert.alert(
        'Missing details',
        hasSchedule
          ? 'Choose patient, doctor and a free slot.'
          : 'Choose patient, doctor and a time (HH:MM).',
      );
    setBusy(true);
    try {
      await api.appointments.create({
        patientId,
        doctorId,
        scheduledAt,
        type,
        reason: reason.trim() || undefined,
      });
      onDone();
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const lbl = {
    fontSize: 11,
    fontWeight: '800' as const,
    color: C.black,
    textTransform: 'uppercase' as const,
    marginBottom: 5,
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: C.primary,
            padding: 14,
            borderBottomWidth: 2,
            borderBottomColor: C.black,
          }}
        >
          <Text
            style={{ flex: 1, color: C.white, fontSize: 18, fontWeight: '800' }}
          >
            Schedule appointment
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={C.white} />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={lbl}>Patient *</Text>
            <SelectInput
              value={patientId}
              options={(patients.data ?? []).map((p: any) => ({
                value: p._id,
                label: `${p.name} ${p.patientId ? `(${p.patientId})` : ''}`,
              }))}
              onChange={setPatientId}
              placeholder="Select patient"
            />
          </View>
          <View>
            <Text style={lbl}>Doctor *</Text>
            <SelectInput
              value={doctorId}
              options={(doctors.data ?? []).map((d: any) => ({
                value: d._id,
                label: `Dr. ${String(d.name).replace(/^Dr\.?\s+/i, '')} — ${(d.professionalDetails?.specializations ?? [])[0] || 'General'}`,
              }))}
              onChange={v => {
                setDoctorId(v);
                setSlot('');
              }}
              placeholder="Select doctor"
            />
          </View>
          <View>
            <Text style={lbl}>Date *</Text>
            <TextInput
              value={date}
              onChangeText={v => {
                setDate(v);
                setSlot('');
              }}
              placeholder="YYYY-MM-DD"
              style={{
                borderWidth: 2,
                borderColor: C.black,
                borderRadius: 8,
                padding: 10,
                fontSize: 14,
                color: C.black,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <Chip text="Today" onPress={() => setDate(ymd(new Date()))} />
              <Chip
                text="Tomorrow"
                onPress={() => setDate(ymd(new Date(Date.now() + DAY)))}
              />
            </View>
          </View>
          {doctor &&
            (hasSchedule ? (
              <View>
                <Text style={lbl}>Free slots</Text>
                {!(slots.data ?? []).length ? (
                  <Text style={{ color: C.muted }}>
                    {slots.loading ? 'Loading…' : 'No free slots on this day.'}
                  </Text>
                ) : (
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                  >
                    {(slots.data ?? []).map((sl: any) => (
                      <TouchableOpacity
                        key={sl.start}
                        onPress={() => setSlot(sl.start)}
                        style={{
                          borderWidth: 2,
                          borderColor: C.black,
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          backgroundColor:
                            slot === sl.start ? C.primary : C.white,
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: '800',
                            color: slot === sl.start ? C.white : C.black,
                          }}
                        >
                          {fmtTime(sl.start)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Text style={lbl}>Time (HH:MM, 24h) *</Text>
                <TextInput
                  value={manual}
                  onChangeText={setManual}
                  placeholder="10:30"
                  style={{
                    borderWidth: 2,
                    borderColor: C.black,
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 14,
                    color: C.black,
                  }}
                />
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  This doctor has no fixed schedule, so any time is accepted.
                </Text>
              </View>
            ))}
          <View>
            <Text style={lbl}>Visit type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setType(t.key)}
                  style={{
                    flex: 1,
                    borderWidth: 2,
                    borderColor: C.black,
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: 'center',
                    backgroundColor: type === t.key ? C.black : C.white,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: '800',
                      fontSize: 12,
                      color: type === t.key ? C.white : C.black,
                    }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={lbl}>Reason</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              maxLength={200}
              placeholder="e.g. Fever since two days"
              style={{
                borderWidth: 2,
                borderColor: C.black,
                borderRadius: 8,
                padding: 10,
                fontSize: 14,
                color: C.black,
              }}
            />
          </View>
        </ScrollView>
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            padding: 12,
            borderTopWidth: 2,
            borderTopColor: C.black,
            backgroundColor: C.soft,
          }}
        >
          <Btn
            text="Cancel"
            kind="secondary"
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <Btn
            text="Schedule"
            onPress={submit}
            loading={busy}
            style={{ flex: 1.4 }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function AppointmentsScreen({ navigation, route }: any) {
  const { user, tenant } = useAuth();
  const role = user?.role ?? '';
  const isAdmin = ['super_admin', 'tenant_owner', 'hospital_admin'].includes(
    role,
  );
  const canVitals = [
    ...['super_admin', 'tenant_owner', 'hospital_admin'],
    'doctor',
    'nurse',
    'receptionist',
  ].includes(role);
  const canBill = [
    ...['super_admin', 'tenant_owner', 'hospital_admin'],
    'receptionist',
    'billing_executive',
  ].includes(role);
  const [book, setBook] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);

  useEffect(() => {
    if (route?.params?.patientId) setBook(true);
  }, [route?.params?.patientId]);

  const setStatus = (id: string, status: string) =>
    api.appointments.update(id, { status }).then(reload).catch(fail);

  return (
    <>
      <ListPage<any>
        title="Appointments"
        right={
          <HeaderBtn text="Book" icon={Plus} onPress={() => setBook(true)} />
        }
        load={() => api.appointments.list({ limit: 200 })}
        reloadKey={tick}
        searchOn={a => [
          personName(a.patientId),
          a.patientId?.patientId,
          personName(a.doctorId),
          a.reason,
        ]}
        searchPlaceholder="Patient, doctor or reason…"
        filters={[
          { key: 'today', label: 'Today' },
          { key: 'scheduled', label: 'Scheduled' },
          { key: 'completed', label: 'Completed' },
          { key: 'cancelled', label: 'Cancelled' },
          { key: 'no_show', label: 'No show' },
        ]}
        filterFn={(a, k) =>
          k === 'today'
            ? new Date(a.scheduledAt).toDateString() ===
              new Date().toDateString()
            : a.status === k
        }
        emptyIcon={CalendarDays}
        emptyText="No appointments yet."
        header={list => {
          const t = new Date().toDateString();
          return (
            <StatGrid>
              <Stat
                label="Today"
                value={
                  list.filter(a => new Date(a.scheduledAt).toDateString() === t)
                    .length
                }
                icon={CalendarCheck}
                color={C.primary}
              />
              <Stat
                label="Upcoming"
                value={
                  list.filter(
                    a =>
                      a.status === 'scheduled' &&
                      new Date(a.scheduledAt) > new Date(),
                  ).length
                }
                icon={CalendarClock}
                color={C.secondary}
              />
              <Stat
                label="Completed"
                value={list.filter(a => a.status === 'completed').length}
                icon={Stethoscope}
                color={C.success}
              />
              <Stat
                label="Cancelled / no-show"
                value={
                  list.filter(
                    a => a.status === 'cancelled' || a.status === 'no_show',
                  ).length
                }
                icon={XCircle}
                color={C.danger}
              />
            </StatGrid>
          );
        }}
        renderItem={a => (
          <Item>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 16, fontWeight: '800', color: C.black }}
                >
                  {personName(a.patientId) || '—'}
                </Text>
                <Text style={{ fontSize: 12, color: C.muted }}>
                  Dr. {String(personName(a.doctorId)).replace(/^Dr\.?\s+/i, '')}{' '}
                  · {label(a.type)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Pill text={a.status} />
                {a.paymentStatus === 'paid' ? <Pill text="paid" /> : null}
              </View>
            </View>
            <Text style={{ marginTop: 6, fontWeight: '800', color: C.primary }}>
              {fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}
              {a.tokenNo ? `  ·  Token ${a.tokenNo}` : ''}
            </Text>
            {a.reason ? (
              <Text style={{ fontSize: 12, color: C.black, marginTop: 2 }}>
                Reason: {a.reason}
              </Text>
            ) : null}
            {a.fee ? (
              <Text style={{ fontSize: 12, color: C.muted }}>
                Fee {money(a.fee)}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 10,
              }}
            >
              {a.status === 'scheduled' && !a.checkedInAt && (
                <Chip
                  text="Check in"
                  icon={Play}
                  color={C.success}
                  onPress={() =>
                    api.appointments.checkIn(a._id).then(reload).catch(fail)
                  }
                />
              )}
              <Chip
                text={a.status === 'completed' ? 'Prescription' : 'Consult'}
                icon={Stethoscope}
                color={C.primary}
                onPress={() =>
                  navigation.navigate('Consultation', { appointmentId: a._id })
                }
              />
              {a.type === 'video' && a.status === 'scheduled' && (
                <Chip
                  text="Join"
                  icon={Video}
                  color={C.purple}
                  onPress={() =>
                    api.appointments
                      .videoLink(a._id)
                      .then((r: any) => Linking.openURL(r.url))
                      .catch(fail)
                  }
                />
              )}
              {canVitals && a.status === 'scheduled' && (
                <Chip
                  text="Vitals"
                  icon={Activity}
                  onPress={() =>
                    navigation.navigate('Consultation', {
                      appointmentId: a._id,
                    })
                  }
                />
              )}
              {a.status !== 'cancelled' && canBill && (
                <Chip
                  text="Bill"
                  icon={Receipt}
                  onPress={() =>
                    api.invoices
                      .fromAppointment(a._id)
                      .then(i =>
                        Alert.alert(
                          'Invoice created',
                          `${i.number} — see Invoices`,
                        ),
                      )
                      .catch(fail)
                  }
                />
              )}
              {a.status !== 'cancelled' && (
                <Chip
                  text="Receipt"
                  icon={Download}
                  onPress={() => shareReceipt(a, tenant).catch(() => {})}
                />
              )}
              {a.status === 'scheduled' && (
                <Chip
                  text="No-show"
                  icon={UserX}
                  color={C.secondary}
                  onPress={() => setStatus(a._id, 'no_show')}
                />
              )}
              {a.status === 'scheduled' && (
                <Chip
                  text="Cancel"
                  icon={XCircle}
                  color={C.danger}
                  onPress={() =>
                    confirm(
                      'Cancel appointment',
                      'Cancel this appointment?',
                      () => setStatus(a._id, 'cancelled'),
                      'Cancel it',
                    )
                  }
                />
              )}
              {isAdmin && (
                <Chip
                  text="Delete"
                  icon={Trash2}
                  color={C.danger}
                  onPress={() =>
                    confirm(
                      'Delete',
                      'Delete this appointment?',
                      () =>
                        api.appointments.remove(a._id).then(reload).catch(fail),
                      'Delete',
                    )
                  }
                />
              )}
            </View>
            <Text style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
              {receiptNumber(a)}
            </Text>
          </Item>
        )}
      />
      <BookModal
        visible={book}
        presetPatient={route?.params?.patientId}
        onClose={() => {
          setBook(false);
          navigation.setParams?.({ patientId: undefined });
        }}
        onDone={() => {
          setBook(false);
          navigation.setParams?.({ patientId: undefined });
          reload();
        }}
      />
    </>
  );
}
