import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Pencil,
  Plus,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { Field, FormModal, Values } from '../form';
import { confirm, fail } from '../hooks';
import ListPage from '../ListPage';
import { DEGREES, LANGUAGES, SPECIALIZATIONS } from '../presets';
import {
  C,
  Chip,
  HeaderBtn,
  Item,
  money,
  Pill,
  Row,
  Stat,
  StatGrid,
} from '../ui';

const opts = (a: readonly string[]) => a.map(v => ({ value: v, label: v }));
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MODES = ['in_person', 'video'];

const FIELDS: Field[] = [
  {
    key: 'firstName',
    label: 'First name',
    required: true,
    half: true,
    section: 'Personal',
  },
  { key: 'lastName', label: 'Last name', required: true, half: true },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: opts(['male', 'female', 'other', 'undisclosed']),
    half: true,
  },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date', half: true },
  {
    key: 'phone',
    label: 'Mobile',
    type: 'phone',
    required: true,
    half: true,
    validate: v =>
      !/^\d{10}$/.test(String(v).replace(/\D/g, '').slice(-10))
        ? 'Enter a 10-digit number'
        : undefined,
  },
  { key: 'email', label: 'Email', type: 'email', required: true, half: true },
  {
    key: 'registrationNumber',
    label: 'Registration no.',
    required: true,
    half: true,
    section: 'Professional',
  },
  {
    key: 'registrationCouncil',
    label: 'Council',
    required: true,
    half: true,
    placeholder: 'e.g. Maharashtra Medical Council',
  },
  {
    key: 'degrees',
    label: 'Qualifications',
    type: 'tags',
    suggestions: DEGREES,
  },
  {
    key: 'specializations',
    label: 'Specialisations',
    type: 'tags',
    suggestions: SPECIALIZATIONS,
  },
  {
    key: 'experienceYears',
    label: 'Experience (years)',
    type: 'number',
    half: true,
  },
  {
    key: 'languages',
    label: 'Languages',
    type: 'tags',
    suggestions: LANGUAGES,
  },
  {
    key: 'consultationFee',
    label: 'Consultation fee (₹)',
    type: 'number',
    half: true,
    section: 'Consultation',
  },
  {
    key: 'followUpFee',
    label: 'Follow-up fee (₹)',
    type: 'number',
    half: true,
  },
  {
    key: 'duration',
    label: 'Slot length (min)',
    type: 'number',
    half: true,
    validate: v =>
      !(Number(v) >= 5 && Number(v) <= 240) ? 'Enter 5–240' : undefined,
  },
  {
    key: 'modes',
    label: 'Modes',
    type: 'tags',
    suggestions: MODES,
    hint: 'in_person and/or video',
  },
  {
    key: 'days',
    label: 'Working days',
    type: 'tags',
    suggestions: DAYS,
    hint: 'mon, tue, wed …',
  },
  { key: 'startTime', label: 'From', half: true, placeholder: '09:00' },
  {
    key: 'endTime',
    label: 'To',
    half: true,
    placeholder: '17:00',
    validate: (v, all) =>
      all.days?.length && v <= all.startTime
        ? 'Must be after start'
        : undefined,
  },
  {
    key: 'acceptingAppointments',
    label: 'Accepting appointments',
    type: 'switch',
  },
  {
    key: 'verificationStatus',
    label: 'Verification',
    type: 'select',
    options: opts(['pending', 'verified', 'rejected']),
    half: true,
  },
  {
    key: 'accountStatus',
    label: 'Account',
    type: 'select',
    options: opts(['active', 'inactive', 'suspended']),
    half: true,
  },
];

const toForm = (d: any): Values => ({
  firstName: d.firstName,
  lastName: d.lastName,
  gender: d.gender ?? 'male',
  dateOfBirth: d.dateOfBirth ? String(d.dateOfBirth).slice(0, 10) : '',
  phone: String(d.contact?.phone ?? '')
    .replace(/\D/g, '')
    .slice(-10),
  email: d.contact?.email ?? '',
  registrationNumber: d.professionalDetails?.registrationNumber ?? '',
  registrationCouncil: d.professionalDetails?.registrationCouncil ?? '',
  degrees: (d.professionalDetails?.qualifications ?? []).map(
    (q: any) => q.degree,
  ),
  specializations: d.professionalDetails?.specializations ?? [],
  experienceYears: String(d.professionalDetails?.experienceYears ?? ''),
  languages: d.professionalDetails?.languages ?? [],
  consultationFee: String(d.consultation?.consultationFee ?? ''),
  followUpFee: String(d.consultation?.followUpFee ?? ''),
  duration: String(d.consultation?.appointmentDurationMinutes ?? 15),
  modes: d.consultation?.consultationModes ?? ['in_person'],
  days: (d.availability ?? []).map((a: any) => a.day),
  startTime: d.availability?.[0]?.startTime ?? '09:00',
  endTime: d.availability?.[0]?.endTime ?? '17:00',
  acceptingAppointments: d.consultation?.acceptingAppointments !== false,
  verificationStatus: d.verificationStatus ?? 'pending',
  accountStatus: d.accountStatus ?? 'active',
});

const toPayload = (v: Values, old?: any) => ({
  firstName: v.firstName.trim(),
  lastName: v.lastName.trim(),
  gender: v.gender,
  dateOfBirth: v.dateOfBirth || null,
  contact: {
    phone: String(v.phone).replace(/\D/g, '').slice(-10),
    email: v.email.trim(),
  },
  professionalDetails: {
    ...(old?.professionalDetails ?? {}),
    registrationNumber: v.registrationNumber.trim(),
    registrationCouncil: v.registrationCouncil.trim(),
    qualifications: v.degrees.map((degree: string) => ({
      degree,
      institution: '',
      year: null,
    })),
    specializations: v.specializations,
    experienceYears: Number(v.experienceYears) || 0,
    languages: v.languages,
  },
  consultation: {
    consultationFee: Number(v.consultationFee) || 0,
    followUpFee: Number(v.followUpFee) || 0,
    appointmentDurationMinutes: Number(v.duration) || 15,
    consultationModes: (v.modes.length ? v.modes : ['in_person']).filter(
      (m: string) => MODES.includes(m),
    ),
    acceptingAppointments: v.acceptingAppointments,
  },
  availability: v.days
    .filter((d: string) => DAYS.includes(d))
    .map((day: string) => ({
      day,
      startTime: v.startTime,
      endTime: v.endTime,
    })),
  verificationStatus: v.verificationStatus,
  accountStatus: v.accountStatus,
});

export default function DoctorsScreen({ navigation }: any) {
  const { user } = useAuth();
  const canDelete = ['super_admin', 'tenant_owner', 'hospital_admin'].includes(
    user?.role ?? '',
  );
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);

  return (
    <>
      <ListPage<any>
        title="Doctors"
        onBack={navigation.goBack}
        right={
          <HeaderBtn text="Add" icon={Plus} onPress={() => setEdit('new')} />
        }
        load={() => api.doctors.list()}
        reloadKey={tick}
        searchOn={d => [
          d.name,
          d.doctorId,
          ...(d.professionalDetails?.specializations ?? []),
          d.contact?.phone,
        ]}
        searchPlaceholder="Name, speciality or phone…"
        filters={[
          { key: 'active', label: 'Active' },
          { key: 'verified', label: 'Verified' },
          { key: 'pending', label: 'Pending' },
          { key: 'inactive', label: 'Inactive' },
        ]}
        filterFn={(d, k) => d.accountStatus === k || d.verificationStatus === k}
        emptyIcon={Stethoscope}
        emptyText="No doctors yet."
        header={list => (
          <StatGrid>
            <Stat
              label="Doctors"
              value={list.length}
              icon={Stethoscope}
              color={C.primary}
            />
            <Stat
              label="Active"
              value={list.filter(d => d.accountStatus === 'active').length}
              icon={UserCheck}
              color={C.success}
            />
            <Stat
              label="Verified"
              value={
                list.filter(d => d.verificationStatus === 'verified').length
              }
              icon={ShieldCheck}
              color={C.secondary}
            />
            <Stat
              label="Inactive"
              value={list.filter(d => d.accountStatus !== 'active').length}
              icon={UserX}
              color={C.muted}
            />
          </StatGrid>
        )}
        renderItem={d => (
          <Item onPress={() => setEdit(d)}>
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
                  Dr. {String(d.name).replace(/^Dr\.?\s+/i, '')}
                </Text>
                <Text style={{ fontSize: 12, color: C.muted }}>
                  {d.doctorId} ·{' '}
                  {(d.professionalDetails?.specializations ?? []).join(', ') ||
                    'General'}
                </Text>
              </View>
              <View style={{ gap: 4, alignItems: 'flex-end' }}>
                <Pill text={d.accountStatus} />
                <Pill text={d.verificationStatus} />
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <Row
                k="Fee"
                v={`${money(d.consultation?.consultationFee)} · follow-up ${money(d.consultation?.followUpFee)}`}
              />
              <Row
                k="Experience"
                v={`${d.professionalDetails?.experienceYears ?? 0} yrs`}
              />
              <Row k="Login" v={d.userId ? 'Linked' : 'No login linked'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Chip text="Edit" icon={Pencil} onPress={() => setEdit(d)} />
              {canDelete && (
                <Chip
                  text="Delete"
                  icon={Trash2}
                  color={C.danger}
                  onPress={() =>
                    confirm(
                      'Delete doctor',
                      `Delete Dr. ${d.name}?`,
                      () => api.doctors.remove(d._id).then(reload).catch(fail),
                      'Delete',
                    )
                  }
                />
              )}
            </View>
          </Item>
        )}
      />
      <FormModal
        visible={!!edit}
        title={edit === 'new' ? 'Add doctor' : 'Edit doctor'}
        fields={FIELDS}
        initial={
          edit && edit !== 'new'
            ? toForm(edit)
            : {
                gender: 'male',
                duration: '15',
                modes: ['in_person'],
                days: ['mon', 'tue', 'wed', 'thu', 'fri'],
                startTime: '09:00',
                endTime: '17:00',
                acceptingAppointments: true,
                verificationStatus: 'pending',
                accountStatus: 'active',
              }
        }
        submitLabel={edit === 'new' ? 'Add doctor' : 'Save changes'}
        onClose={() => setEdit(null)}
        onSubmit={async v => {
          if (edit === 'new') await api.doctors.create(toPayload(v));
          else await api.doctors.update(edit._id, toPayload(v, edit));
          setEdit(null);
          reload();
        }}
      />
    </>
  );
}
