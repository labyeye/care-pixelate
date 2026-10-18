import React, { useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import {
  Archive,
  CalendarPlus,
  Droplet,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react-native';
import { api } from '../api';
import { FormModal, Field, Values } from '../form';
import { confirm, fail } from '../hooks';
import ListPage from '../ListPage';
import {
  ALLERGIES,
  CONDITIONS,
  FAMILY_HISTORY,
  PAST_MEDICAL,
  RELATIONSHIPS,
  SURGERIES,
} from '../presets';
import { C, Chip, fmtDate, HeaderBtn, Item, Pill, Stat, StatGrid } from '../ui';

const opts = (a: readonly string[]) => a.map(v => ({ value: v, label: v }));
const GENDERS = opts(['male', 'female', 'other', 'undisclosed']);
const BLOOD = opts([
  'unknown',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
]);
const MARITAL = opts([
  'single',
  'married',
  'divorced',
  'widowed',
  'other',
  'undisclosed',
]);
const STATUS = opts(['active', 'inactive', 'archived']);

const FIELDS: Field[] = [
  {
    key: 'firstName',
    label: 'First name',
    required: true,
    half: true,
    section: 'Personal',
  },
  { key: 'lastName', label: 'Last name', required: true, half: true },
  { key: 'middleName', label: 'Middle name' },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    type: 'date',
    required: true,
    half: true,
    validate: v =>
      new Date(v) > new Date() ? "Can't be in the future" : undefined,
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: GENDERS,
    required: true,
    half: true,
  },
  {
    key: 'bloodGroup',
    label: 'Blood group',
    type: 'select',
    options: BLOOD,
    half: true,
  },
  {
    key: 'maritalStatus',
    label: 'Marital status',
    type: 'select',
    options: MARITAL,
    half: true,
  },
  { key: 'patientStatus', label: 'Status', type: 'select', options: STATUS },
  {
    key: 'phone',
    label: 'Mobile',
    type: 'phone',
    required: true,
    half: true,
    section: 'Contact',
    validate: v =>
      !/^\d{10}$/.test(String(v).replace(/\D/g, '').slice(-10))
        ? 'Enter a 10-digit number'
        : undefined,
  },
  { key: 'alternatePhone', label: 'Alternate', type: 'phone', half: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'street', label: 'Street / area', section: 'Address' },
  { key: 'city', label: 'City', half: true },
  { key: 'state', label: 'State', half: true },
  {
    key: 'pincode',
    label: 'Pincode',
    half: true,
    validate: v => (v && !/^\d{6}$/.test(v) ? 'Enter 6 digits' : undefined),
  },
  {
    key: 'emergencyName',
    label: 'Name',
    half: true,
    section: 'Emergency contact',
  },
  { key: 'emergencyPhone', label: 'Phone', type: 'phone', half: true },
  {
    key: 'emergencyRelationship',
    label: 'Relationship',
    type: 'select',
    options: opts(RELATIONSHIPS),
  },
  {
    key: 'allergies',
    label: 'Allergies',
    type: 'tags',
    suggestions: ALLERGIES,
    section: 'Medical history',
    placeholder: 'Type to search allergies',
  },
  {
    key: 'chronicConditions',
    label: 'Chronic conditions',
    type: 'tags',
    suggestions: CONDITIONS,
  },
  {
    key: 'pastMedicalHistory',
    label: 'Past illnesses',
    type: 'tags',
    suggestions: PAST_MEDICAL,
  },
  {
    key: 'pastSurgicalHistory',
    label: 'Past surgeries',
    type: 'tags',
    suggestions: SURGERIES,
  },
  {
    key: 'familyMedicalHistory',
    label: 'Family history',
    type: 'tags',
    suggestions: FAMILY_HISTORY,
  },
  { key: 'notes', label: 'Notes', type: 'multiline' },
];

const toForm = (p: any): Values => ({
  firstName: p.firstName,
  middleName: p.middleName,
  lastName: p.lastName,
  dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : '',
  gender: p.gender,
  bloodGroup: p.bloodGroup ?? 'unknown',
  maritalStatus: p.maritalStatus ?? 'undisclosed',
  patientStatus: p.patientStatus ?? 'active',
  phone: String(p.contact?.phone ?? '')
    .replace(/\D/g, '')
    .slice(-10),
  alternatePhone: p.contact?.alternatePhone ?? '',
  email: p.contact?.email ?? '',
  street: p.address?.street ?? '',
  city: p.address?.city ?? '',
  state: p.address?.state ?? '',
  pincode: p.address?.pincode ?? '',
  emergencyName: p.emergencyContact?.name ?? '',
  emergencyPhone: p.emergencyContact?.phone ?? '',
  emergencyRelationship: p.emergencyContact?.relationship ?? '',
  allergies: p.medicalSummary?.allergies ?? [],
  chronicConditions: p.medicalSummary?.chronicConditions ?? [],
  pastMedicalHistory: p.medicalSummary?.pastMedicalHistory ?? [],
  pastSurgicalHistory: p.medicalSummary?.pastSurgicalHistory ?? [],
  familyMedicalHistory: p.medicalSummary?.familyMedicalHistory ?? [],
  notes: p.medicalSummary?.notes ?? '',
});

const toPayload = (v: Values, existing?: any) => ({
  firstName: v.firstName.trim(),
  middleName: (v.middleName || '').trim(),
  lastName: v.lastName.trim(),
  dateOfBirth: v.dateOfBirth,
  gender: v.gender,
  bloodGroup: v.bloodGroup || 'unknown',
  maritalStatus: v.maritalStatus || 'undisclosed',
  patientStatus: v.patientStatus || 'active',
  contact: {
    phone: String(v.phone).replace(/\D/g, '').slice(-10),
    alternatePhone: v.alternatePhone,
    email: (v.email || '').trim(),
  },
  address: {
    street: v.street,
    city: v.city,
    state: v.state,
    pincode: v.pincode,
    country: 'India',
  },
  emergencyContact: {
    name: v.emergencyName,
    relationship: v.emergencyRelationship,
    phone: v.emergencyPhone,
  },
  medicalSummary: {
    ...(existing?.medicalSummary ?? {}),
    allergies: v.allergies,
    chronicConditions: v.chronicConditions,
    pastMedicalHistory: v.pastMedicalHistory,
    pastSurgicalHistory: v.pastSurgicalHistory,
    familyMedicalHistory: v.familyMedicalHistory,
    notes: v.notes,
  },
});

const ageOf = (dob?: string) =>
  dob
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000),
      )
    : null;

export default function PatientsScreen({ navigation }: any) {
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const [tick, setTick] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  React.useEffect(() => {
    api
      .summary()
      .then(setSummary)
      .catch(() => {});
  }, [tick]);
  const reload = () => setTick(t => t + 1);

  return (
    <>
      <ListPage<any>
        title="Patients"
        right={
          <HeaderBtn text="Add" icon={Plus} onPress={() => setEdit('new')} />
        }
        load={() => api.patients.list()}
        reloadKey={tick}
        searchOn={p => [
          p.name,
          p.patientId,
          p.contact?.phone,
          p.contact?.email,
        ]}
        searchPlaceholder="Name, patient ID, phone or email…"
        filters={[
          { key: 'active', label: 'Active' },
          { key: 'inactive', label: 'Inactive' },
          { key: 'archived', label: 'Archived' },
          { key: 'male', label: 'Male' },
          { key: 'female', label: 'Female' },
        ]}
        filterFn={(p, k) => p.patientStatus === k || p.gender === k}
        emptyIcon={Users}
        emptyText="No patients yet. Add your first one."
        header={() => (
          <StatGrid>
            <Stat
              label="Total"
              value={summary?.patients.total ?? '…'}
              icon={Users}
              color={C.primary}
            />
            <Stat
              label="Active"
              value={summary?.patients.active ?? '…'}
              icon={UserCheck}
              color={C.success}
            />
            <Stat
              label="New this month"
              value={summary?.patients.newThisMonth ?? '…'}
              icon={CalendarPlus}
              color={C.secondary}
            />
            <Stat
              label="Archived"
              value={summary?.patients.archived ?? '…'}
              icon={Archive}
              color={C.muted}
            />
          </StatGrid>
        )}
        renderItem={p => {
          const age = ageOf(p.dateOfBirth);
          return (
            <Item onPress={() => setEdit(p)}>
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
                    {p.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>
                    {p.patientId || '—'} · {age !== null ? `${age} y` : '—'} ·{' '}
                    {p.gender}
                  </Text>
                </View>
                <Pill text={p.patientStatus} />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 14,
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                <Text
                  style={{ fontSize: 12, color: C.black, fontWeight: '600' }}
                >
                  DOB {fmtDate(p.dateOfBirth)}
                </Text>
                {p.bloodGroup && p.bloodGroup !== 'unknown' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Droplet size={13} color={C.danger} fill={C.danger} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '800',
                        color: C.danger,
                      }}
                    >
                      {p.bloodGroup}
                    </Text>
                  </View>
                ) : null}
                {p.contact?.phone ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`tel:${p.contact.phone}`)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Phone size={13} color={C.primary} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: C.primary,
                      }}
                    >
                      {p.contact.phone}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Chip text="Edit" icon={Pencil} onPress={() => setEdit(p)} />
                <Chip
                  text="Book"
                  icon={CalendarPlus}
                  color={C.primary}
                  onPress={() =>
                    navigation.navigate('Appointments', { patientId: p._id })
                  }
                />
                <Chip
                  text="Delete"
                  icon={Trash2}
                  color={C.danger}
                  onPress={() =>
                    confirm(
                      'Delete patient',
                      `Delete ${p.name}? This cannot be undone.`,
                      () => api.patients.remove(p._id).then(reload).catch(fail),
                      'Delete',
                    )
                  }
                />
              </View>
            </Item>
          );
        }}
      />
      <FormModal
        visible={!!edit}
        title={edit === 'new' ? 'Add patient' : 'Edit patient'}
        fields={FIELDS}
        initial={
          edit && edit !== 'new'
            ? toForm(edit)
            : {
                gender: 'male',
                bloodGroup: 'unknown',
                maritalStatus: 'undisclosed',
                patientStatus: 'active',
              }
        }
        submitLabel={edit === 'new' ? 'Add patient' : 'Save changes'}
        onClose={() => setEdit(null)}
        onSubmit={async v => {
          if (edit === 'new') await api.patients.create(toPayload(v));
          else await api.patients.update(edit._id, toPayload(v, edit));
          setEdit(null);
          reload();
        }}
      />
    </>
  );
}
