import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { api } from '../api';
import { useLoad } from '../hooks';
import { C, Card, Empty, fmtTime, Pill, Screen, ScrollBody, personName, ymd } from '../ui';

const DAY = 86_400_000;
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
};

export default function CalendarScreen({ navigation }: any) {
  const [week, setWeek] = useState(startOfWeek(new Date()));
  const from = ymd(week);
  const to = ymd(new Date(week.getTime() + 6 * DAY));
  const { data, loading, refreshing, refresh } = useLoad(() => api.appointments.range(from, to), [from, to]);
  const days = [...Array(7)].map((_, i) => new Date(week.getTime() + i * DAY));
  const today = new Date().toDateString();

  return (
    <Screen title="Calendar" subtitle={`${week.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(week.getTime() + 6 * DAY).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`} onBack={navigation.goBack} loading={loading && !data}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
        <TouchableOpacity onPress={() => setWeek(new Date(week.getTime() - 7 * DAY))} style={nav}><ChevronLeft size={18} color={C.black} /></TouchableOpacity>
        <TouchableOpacity onPress={() => setWeek(startOfWeek(new Date()))} style={[nav, { paddingHorizontal: 14 }]}><Text style={{ fontWeight: '800' }}>THIS WEEK</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setWeek(new Date(week.getTime() + 7 * DAY))} style={nav}><ChevronRight size={18} color={C.black} /></TouchableOpacity>
      </View>
      <ScrollBody refreshing={refreshing} onRefresh={refresh}>
        {days.map(d => {
          const list = (data ?? []).filter((a: any) => new Date(a.scheduledAt).toDateString() === d.toDateString()).sort((a: any, b: any) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
          const isToday = d.toDateString() === today;
          return (
            <Card key={d.toISOString()} style={isToday ? { backgroundColor: '#EEF4FF' } : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: list.length ? 8 : 0 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: isToday ? C.primary : C.black }}>{d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}</Text>
                <Text style={{ fontWeight: '800', color: C.muted }}>{list.length}</Text>
              </View>
              {list.map((a: any) => (
                <TouchableOpacity key={a._id} onPress={() => navigation.navigate('Consultation', { appointmentId: a._id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text style={{ width: 62, fontWeight: '800', color: C.primary }}>{fmtTime(a.scheduledAt)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.black }} numberOfLines={1}>{personName(a.patientId)}</Text>
                    <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>Dr. {String(personName(a.doctorId)).replace(/^Dr\.?\s+/i, '')}</Text>
                  </View>
                  <Pill text={a.status} />
                </TouchableOpacity>
              ))}
            </Card>
          );
        })}
        {!(data ?? []).length && <Empty icon={CalendarDays} text="No appointments this week" />}
      </ScrollBody>
    </Screen>
  );
}

const nav = { borderWidth: 2, borderColor: C.black, borderRadius: 8, padding: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white } as const;
