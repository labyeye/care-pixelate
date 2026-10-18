import React from 'react';
import { Text, View } from 'react-native';
import { FileText, Stethoscope } from 'lucide-react-native';
import { api } from '../api';
import ListPage from '../ListPage';
import { C, fmtDate, Item, personName, Pill } from '../ui';

export default function ConsultationsScreen({ navigation }: any) {
  return (
    <ListPage<any>
      title="Consultations"
      onBack={navigation.goBack}
      load={() => api.consultations.list({ limit: 100 })}
      searchOn={c => [
        personName(c.patientId),
        personName(c.doctorId),
        ...(c.diagnosis ?? []),
        c.complaints,
      ]}
      searchPlaceholder="Patient, doctor or diagnosis…"
      filters={[
        { key: 'signed', label: 'Signed' },
        { key: 'draft', label: 'Drafts' },
      ]}
      filterFn={(c, k) => c.status === k}
      emptyIcon={Stethoscope}
      emptyText="No consultations yet."
      renderItem={c => {
        const appt =
          typeof c.appointmentId === 'string'
            ? c.appointmentId
            : c.appointmentId?._id;
        return (
          <Item
            onPress={() =>
              appt &&
              navigation.navigate('Consultation', { appointmentId: appt })
            }
          >
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
                  {personName(c.patientId) || '—'}
                </Text>
                <Text style={{ fontSize: 12, color: C.muted }}>
                  Dr. {String(personName(c.doctorId)).replace(/^Dr\.?\s+/i, '')}{' '}
                  · {fmtDate(c.signedAt ?? c.createdAt)}
                </Text>
              </View>
              <Pill text={c.status} />
            </View>
            {c.diagnosis?.length ? (
              <Text
                style={{ marginTop: 6, fontWeight: '700', color: C.primary }}
              >
                {c.diagnosis.join(', ')}
              </Text>
            ) : null}
            {c.complaints ? (
              <Text
                style={{ fontSize: 12, color: C.black, marginTop: 2 }}
                numberOfLines={2}
              >
                {c.complaints}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                marginTop: 6,
              }}
            >
              <FileText size={13} color={C.muted} />
              <Text style={{ fontSize: 11, color: C.muted }}>
                {c.prescription?.items?.length ?? 0} medicine(s)
              </Text>
            </View>
          </Item>
        );
      }}
    />
  );
}
