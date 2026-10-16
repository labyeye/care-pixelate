import React, { useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheck, ClipboardList, FlaskConical, Plus, TestTube, TriangleAlert, X, XCircle } from 'lucide-react-native';
import { api } from '../api';
import { Field, FormModal } from '../form';
import { confirm, fail, useLoad } from '../hooks';
import { findCatalogTest, LAB_CATALOG } from '../labCatalog';
import ListPage from '../ListPage';
import { Btn, C, Chip, fmtDateTime, HeaderBtn, Item, label, personName, Pill, Row, Stat, StatGrid } from '../ui';

const ALL_TESTS = Object.values(LAB_CATALOG).flatMap(c => c.map(t => t.name));
const FLAG: Record<string, string> = { high: C.danger, low: C.warning };

function OrderModal({ order, onClose, onChanged }: { order: any | null; onClose: () => void; onChanged: () => void }) {
  const [results, setResults] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { setResults({}); setNote(''); }, [order?._id]);
  if (!order) return null;
  const open = order.status === 'ordered' || order.status === 'collected';
  const act = async (fn: () => Promise<any>, close = false) => {
    setBusy(true);
    try { await fn(); onChanged(); if (close) onClose(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, padding: 14, borderBottomWidth: 2, borderBottomColor: C.black, gap: 10 }}>
          <Text style={{ flex: 1, color: C.white, fontSize: 18, fontWeight: '800' }}>{order.number}</Text>
          <Pill text={order.status} />
          <TouchableOpacity onPress={onClose}><X size={24} color={C.white} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Row k="Patient" v={personName(order.patientId)} bold />
          <Row k="Ordered by" v={personName(order.doctorId) ? `Dr. ${personName(order.doctorId)}` : '—'} />
          <Row k="Performed by" v={personName(order.assignedTo) || 'Unassigned'} />
          <Row k="Collected" v={order.collectedAt ? `${fmtDateTime(order.collectedAt)} · ${personName(order.collectedBy)}` : '—'} />
          <Row k="Resulted" v={order.resultedAt ? `${fmtDateTime(order.resultedAt)} · ${personName(order.resultedBy)}` : '—'} />

          <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>Tests</Text>
          {order.tests.map((t: any, i: number) => (
            <View key={i} style={{ borderWidth: 2, borderColor: C.black, borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <Text style={{ fontWeight: '800', color: C.black }}>{t.name}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>
                {t.unit ? `Unit ${t.unit}` : ''}{t.refLow != null || t.refHigh != null ? `  ·  Ref ${t.refLow ?? ''}–${t.refHigh ?? ''}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <TextInput
                  editable={open}
                  value={results[i] ?? t.result ?? ''}
                  onChangeText={v => setResults(r => ({ ...r, [i]: v }))}
                  placeholder="Result"
                  placeholderTextColor="#9CA3AF"
                  style={{ flex: 1, borderWidth: 2, borderColor: C.black, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.black, backgroundColor: open ? C.white : '#F3F4F6' }}
                />
                {t.flag ? <Text style={{ fontWeight: '800', textTransform: 'uppercase', color: FLAG[t.flag] ?? C.success }}>{t.flag}</Text> : null}
              </View>
            </View>
          ))}

          {open && (
            <>
              <Text style={{ fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 8, marginBottom: 5 }}>Note for this step</Text>
              <TextInput value={note} onChangeText={setNote} placeholder="e.g. Venous blood, EDTA tube" placeholderTextColor="#9CA3AF" style={{ borderWidth: 2, borderColor: C.black, borderRadius: 8, padding: 10, color: C.black }} />
            </>
          )}

          <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>Progress</Text>
          {(order.stages ?? []).map((st: any, i: number) => (
            <Text key={i} style={{ fontSize: 12, color: C.black, marginBottom: 3 }}>
              • <Text style={{ fontWeight: '800' }}>{label(st.status)}</Text> — {fmtDateTime(st.at)}{st.byName ? ` · ${st.byName}` : ''}{st.note ? ` (${st.note})` : ''}
            </Text>
          ))}
        </ScrollView>
        {open && (
          <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 2, borderTopColor: C.black, backgroundColor: C.soft }}>
            <Btn text="Cancel order" kind="danger" onPress={() => confirm('Cancel order', 'Cancel this lab order?', () => act(() => api.lab.update(order._id, { status: 'cancelled', note: note || undefined }), true), 'Cancel it')} style={{ flex: 1 }} />
            {order.status === 'ordered' && <Btn text="Collected" kind="secondary" loading={busy} onPress={() => act(() => api.lab.update(order._id, { status: 'collected', note: note || undefined }), true)} style={{ flex: 1 }} />}
            <Btn text="Save results" loading={busy} onPress={() => act(async () => {
              await api.lab.update(order._id, { tests: order.tests.map((t: any, i: number) => ({ ...t, result: results[i] ?? t.result })), note: note || undefined });
              Alert.alert('Results saved');
            }, true)} style={{ flex: 1.2 }} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default function LabOrdersScreen({ navigation }: any) {
  const [create, setCreate] = useState(false);
  const [view, setView] = useState<any | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);
  const patients = useLoad(() => api.patients.list(), []);
  const doctors = useLoad(() => api.doctors.list(), []);
  const techs = useLoad(() => api.lab.technicians().catch(() => []), []);

  const fields: Field[] = [
    { key: 'patientId', label: 'Patient', type: 'select', required: true, options: (patients.data ?? []).map((p: any) => ({ value: p._id, label: `${p.name} (${p.patientId})` })) },
    { key: 'doctorId', label: 'Ordering doctor', type: 'select', options: [{ value: '', label: '—' }, ...(doctors.data ?? []).map((d: any) => ({ value: d._id, label: `Dr. ${d.name}` }))] },
    { key: 'assignedTo', label: 'Assign to (performs the test)', type: 'select', options: [{ value: '', label: 'Unassigned' }, ...(techs.data ?? []).map((u: any) => ({ value: u._id, label: `${u.name} — ${label(u.role)}` }))] },
    { key: 'tests', label: 'Tests', type: 'tags', required: true, suggestions: ALL_TESTS, placeholder: 'Search: Hemoglobin, Ultrasound, X-Ray…', hint: 'Units and reference ranges fill in automatically for known tests.' },
  ];

  return (
    <>
      <ListPage<any>
        title="Lab Orders"
        onBack={navigation.goBack}
        right={<HeaderBtn text="New" icon={Plus} onPress={() => setCreate(true)} />}
        load={() => api.lab.list({ limit: 200 })}
        reloadKey={tick}
        searchOn={o => [o.number, personName(o.patientId), ...o.tests.map((t: any) => t.name)]}
        searchPlaceholder="Order no., patient or test…"
        filters={[{ key: 'ordered', label: 'Awaiting' }, { key: 'collected', label: 'Collected' }, { key: 'resulted', label: 'Resulted' }, { key: 'abnormal', label: 'Abnormal' }, { key: 'cancelled', label: 'Cancelled' }]}
        filterFn={(o, k) => (k === 'abnormal' ? o.status === 'resulted' && o.tests.some((t: any) => t.flag === 'high' || t.flag === 'low') : o.status === k)}
        emptyIcon={FlaskConical}
        emptyText="No lab orders yet."
        header={list => (
          <StatGrid>
            <Stat label="Awaiting sample" value={list.filter(o => o.status === 'ordered').length} icon={ClipboardList} color={C.secondary} />
            <Stat label="Collected" value={list.filter(o => o.status === 'collected').length} icon={TestTube} color={C.primary} />
            <Stat label="Resulted" value={list.filter(o => o.status === 'resulted').length} icon={CircleCheck} color={C.success} />
            <Stat label="Abnormal" value={list.filter(o => o.status === 'resulted' && o.tests.some((t: any) => t.flag === 'high' || t.flag === 'low')).length} icon={TriangleAlert} color={C.danger} />
          </StatGrid>
        )}
        renderItem={o => (
          <Item onPress={() => setView(o)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.black }}>{o.number}</Text>
                <Text style={{ fontSize: 13, color: C.black, fontWeight: '600' }}>{personName(o.patientId)}</Text>
              </View>
              <Pill text={o.status} />
            </View>
            <Text style={{ fontSize: 12, color: C.primary, fontWeight: '700', marginTop: 6 }} numberOfLines={2}>{o.tests.map((t: any) => t.name).join(', ')}</Text>
            <Text style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{personName(o.assignedTo) || 'Unassigned'} · {fmtDateTime(o.createdAt)}</Text>
            {o.status === 'cancelled' ? null : <View style={{ flexDirection: 'row', marginTop: 8 }}><Chip text={o.status === 'resulted' ? 'View results' : 'Open'} icon={o.status === 'resulted' ? CircleCheck : XCircle} color={C.primary} onPress={() => setView(o)} /></View>}
          </Item>
        )}
      />
      <FormModal
        visible={create}
        title="New lab order"
        fields={fields}
        initial={{ tests: [] }}
        submitLabel="Place order"
        onClose={() => setCreate(false)}
        onSubmit={async v => {
          await api.lab.create({
            patientId: v.patientId,
            doctorId: v.doctorId || undefined,
            assignedTo: v.assignedTo || undefined,
            tests: (v.tests as string[]).map(name => {
              const c = findCatalogTest(name);
              return { name, unit: c?.unit ?? '', refLow: c?.low != null ? String(c.low) : '', refHigh: c?.high != null ? String(c.high) : '' };
            }),
          });
          setCreate(false);
          reload();
        }}
      />
      <OrderModal order={view} onClose={() => setView(null)} onChanged={reload} />
    </>
  );
}
