import React, { useEffect, useState } from 'react';
import { Alert, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, Plus, Save, Share2, Trash2 } from 'lucide-react-native';
import { api } from '../api';
import { SuggestInput, TagsInput } from '../form';
import { confirm, fail, useLoad } from '../hooks';
import { ADVICE, COMPLAINTS, DIAGNOSES, DOSAGES, EXAM_FINDINGS, FREQUENCIES, INSTRUCTIONS, MEDICINES } from '../presets';
import { Btn, C, Card, chunky, fmtDate, fmtTime, personName, Pill, Row, Screen, ScrollBody, Section, ymd } from '../ui';

type Item = { drug: string; dose: string; frequency: string; days: string; instructions: string };
const blank: Item = { drug: '', dose: '', frequency: '', days: '', instructions: '' };
const FREQ = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-1', '1-1-1-1', 'SOS', ...FREQUENCIES];
const RANGE: Record<string, [number, number]> = { pulse: [50, 110], tempC: [35.5, 37.8], spo2: [94, 100] };
const num = (v: string) => (v === '' ? undefined : Number(v));
const str = (n?: number | null) => (n == null ? '' : String(n));

const empty = { bp: '', pulse: '', tempC: '', spo2: '', weightKg: '', heightCm: '', complaints: '', diagnosis: [] as string[], notes: '', followUpOn: '', advice: '', items: [{ ...blank }] as Item[] };
type Form = typeof empty;

const toForm = (c: any): Form => ({
  bp: c.vitals?.bp ?? '', pulse: str(c.vitals?.pulse), tempC: str(c.vitals?.tempC), spo2: str(c.vitals?.spo2), weightKg: str(c.vitals?.weightKg), heightCm: str(c.vitals?.heightCm),
  complaints: c.complaints ?? '', diagnosis: c.diagnosis ?? [], notes: c.notes ?? '', followUpOn: c.followUpOn ? String(c.followUpOn).slice(0, 10) : '',
  advice: c.prescription?.advice ?? '',
  items: c.prescription?.items?.length ? c.prescription.items.map((i: any) => ({ ...blank, ...i, days: str(i.days) })) : [{ ...blank }],
});

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 11, fontWeight: '800', color: C.black, textTransform: 'uppercase', marginBottom: 5 }}>{children}</Text>;
}
const box = { ...chunky, borderRightWidth: 3, borderBottomWidth: 3, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.black } as const;

export default function ConsultationScreen({ navigation, route }: any) {
  const appointmentId: string = route.params.appointmentId;
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const appt = useLoad(() => api.appointments.one(appointmentId), [appointmentId]);
  const existing = useLoad(async () => {
    const list = await api.consultations.list({ appointmentId });
    return list[0] ? await api.consultations.one(list[0]._id) : null;
  }, [appointmentId]);
  const inventory = useLoad(() => api.medicines.list({ limit: 200, active: 'true' }).catch(() => []), []);

  const c = existing.data;
  const signed = c?.status === 'signed';
  const a = appt.data;
  const patientId = (typeof a?.patientId === 'object' ? a?.patientId?._id : a?.patientId) as string | undefined;
  const patient = useLoad(() => (patientId ? api.patients.one(patientId) : Promise.resolve(null)), [patientId]);
  const allergies: string[] = patient.data?.medicalSummary?.allergies ?? [];
  const names = Array.from(new Set([...(inventory.data ?? []).map((m: any) => (m.strength && !m.name.toLowerCase().includes(m.strength.toLowerCase()) ? `${m.name} ${m.strength}` : m.name)), ...MEDICINES]));
  const conflict = (drug: string) => (drug.length > 2 ? allergies.find(al => al && drug.toLowerCase().includes(al.toLowerCase())) : undefined);

  useEffect(() => { if (c) setForm(toForm(c)); }, [c]);

  const bmi = (() => {
    const w = Number(form.weightKg), h = Number(form.heightCm) / 100;
    return w > 0 && h > 0 ? Math.round((w / (h * h)) * 10) / 10 : null;
  })();

  const payload = () => ({
    vitals: { bp: form.bp, pulse: num(form.pulse), tempC: num(form.tempC), spo2: num(form.spo2), weightKg: num(form.weightKg), heightCm: num(form.heightCm) },
    complaints: form.complaints, diagnosis: form.diagnosis, notes: form.notes, followUpOn: form.followUpOn || undefined,
    prescription: { items: form.items.filter(i => i.drug.trim()).map(i => ({ ...i, days: num(i.days) })), advice: form.advice },
  });

  const saveOrCreate = () => (c ? api.consultations.update(c._id, payload()) : api.consultations.create({ appointmentId, ...payload() }));
  const run = async (fn: () => Promise<any>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      await existing.reload();
      if (done) Alert.alert(done);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const setItem = (i: number, patch: Partial<Item>) => set('items', form.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const rxText = () =>
    [`Rx — ${personName(a?.patientId)}`, `Dr. ${personName(a?.doctorId)} · ${fmtDate(a?.scheduledAt)}`, '', ...form.items.filter(i => i.drug.trim()).map((i, n) => `${n + 1}. ${i.drug}${i.dose ? ' ' + i.dose : ''}${i.frequency ? ' — ' + i.frequency : ''}${i.days ? ' × ' + i.days + ' days' : ''}${i.instructions ? ' (' + i.instructions + ')' : ''}`), form.advice ? `\nAdvice: ${form.advice}` : '', form.followUpOn ? `Follow-up: ${form.followUpOn}` : ''].filter(Boolean).join('\n');

  const addDays = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));
  const ro = signed;

  return (
    <Screen title="Consultation" subtitle={a ? `${personName(a.patientId)} · ${fmtDate(a.scheduledAt)} ${fmtTime(a.scheduledAt)}` : undefined} onBack={navigation.goBack} loading={appt.loading || existing.loading}>
      <ScrollBody>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {signed ? <Pill text="completed" label="Signed" /> : c ? <Pill text="pending" label="In progress" /> : <Pill text="draft" label="New" />}
          {a?.type ? <Pill text={a.type} /> : null}
        </View>

        {allergies.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8, borderWidth: 2, borderColor: C.danger, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <AlertTriangle size={18} color={C.danger} />
            <Text style={{ flex: 1, color: C.danger, fontWeight: '800' }}>Allergies: {allergies.join(', ')}</Text>
          </View>
        )}

        {patient.data && (
          <Card>
            <Row k="Patient" v={`${patient.data.name} (${patient.data.patientId})`} bold />
            <Row k="Blood group" v={patient.data.bloodGroup && patient.data.bloodGroup !== 'unknown' ? patient.data.bloodGroup : '—'} />
            <Row k="Conditions" v={(patient.data.medicalSummary?.chronicConditions ?? []).join(', ') || '—'} />
          </Card>
        )}

        <Section title="Vitals">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {([['bp', 'BP', '120/80'], ['pulse', 'Pulse', 'bpm'], ['tempC', 'Temp °C', '36.8'], ['spo2', 'SpO₂ %', '98'], ['weightKg', 'Weight kg', ''], ['heightCm', 'Height cm', '']] as const).map(([k, l, ph]) => {
              const r = RANGE[k];
              const bad = r && form[k] !== '' && (Number(form[k]) < r[0] || Number(form[k]) > r[1]);
              return (
                <View key={k} style={{ width: '31%', marginBottom: 10 }}>
                  <Label>{l}</Label>
                  <TextInput editable={!ro} value={form[k]} onChangeText={v => set(k, v)} placeholder={ph} placeholderTextColor="#9CA3AF" keyboardType={k === 'bp' ? 'numbers-and-punctuation' : 'decimal-pad'} style={[box, bad && { borderColor: C.danger, backgroundColor: '#FEF2F2' }]} />
                </View>
              );
            })}
          </View>
          {bmi !== null && <Text style={{ fontWeight: '800', color: C.black }}>BMI {bmi}</Text>}
        </Section>

        <Section title="Consultation">
          <Label>Complaints</Label>
          <SuggestInput phrases multiline editable={!ro} value={form.complaints} onChange={v => set('complaints', v)} suggestions={COMPLAINTS} placeholder="Presenting complaints…" />
          <View style={{ height: 12 }} />
          <Label>Diagnosis</Label>
          {ro ? <Text style={{ color: C.black }}>{form.diagnosis.join(', ') || '—'}</Text> : <TagsInput values={form.diagnosis} onChange={v => set('diagnosis', v)} suggestions={DIAGNOSES} placeholder="Add diagnosis…" />}
          <View style={{ height: 12 }} />
          <Label>Clinical notes</Label>
          <SuggestInput phrases multiline editable={!ro} value={form.notes} onChange={v => set('notes', v)} suggestions={EXAM_FINDINGS} placeholder="Examination findings, notes…" />
        </Section>

        <Section title="Prescription">
          {form.items.map((it, i) => {
            const al = conflict(it.drug);
            return (
              <View key={i} style={{ borderWidth: 2, borderColor: al ? C.danger : C.black, borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: al ? '#FEF2F2' : C.soft }}>
                {al && <Text style={{ color: C.danger, fontWeight: '800', marginBottom: 6 }}>⚠ Patient is allergic to {al}</Text>}
                <Label>Medicine</Label>
                <SuggestInput editable={!ro} value={it.drug} onChange={v => setItem(i, { drug: v })} suggestions={names} placeholder="Medicine" />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1 }}><Label>Dose</Label><SuggestInput editable={!ro} value={it.dose} onChange={v => setItem(i, { dose: v })} suggestions={DOSAGES} placeholder="500 mg" /></View>
                  <View style={{ width: 80 }}><Label>Days</Label><TextInput editable={!ro} value={it.days} onChangeText={v => setItem(i, { days: v })} keyboardType="number-pad" style={box} /></View>
                </View>
                <View style={{ marginTop: 10 }}><Label>Frequency</Label><SuggestInput editable={!ro} value={it.frequency} onChange={v => setItem(i, { frequency: v })} suggestions={FREQ} placeholder="1-0-1" /></View>
                <View style={{ marginTop: 10 }}><Label>Instructions</Label><SuggestInput editable={!ro} value={it.instructions} onChange={v => setItem(i, { instructions: v })} suggestions={INSTRUCTIONS} placeholder="After food" /></View>
                {!ro && form.items.length > 1 && (
                  <TouchableOpacity onPress={() => set('items', form.items.filter((_, idx) => idx !== i))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                    <Trash2 size={14} color={C.danger} /><Text style={{ color: C.danger, fontWeight: '800', fontSize: 12 }}>REMOVE</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          {!ro && <Btn text="Add medicine" kind="secondary" icon={Plus} onPress={() => set('items', [...form.items, { ...blank }])} />}
        </Section>

        <Section title="Advice & follow-up">
          <Label>Advice to patient</Label>
          <SuggestInput phrases multiline editable={!ro} value={form.advice} onChange={v => set('advice', v)} suggestions={ADVICE} placeholder="Advice…" />
          <View style={{ height: 12 }} />
          <Label>Follow-up on</Label>
          <TextInput editable={!ro} value={form.followUpOn} onChangeText={v => set('followUpOn', v)} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" style={box} />
          {!ro && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {[3, 7, 14, 30].map(n => (
                <TouchableOpacity key={n} onPress={() => set('followUpOn', addDays(n))} style={{ borderWidth: 2, borderColor: C.black, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontWeight: '800', fontSize: 12 }}>{n}d</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Section>

        <View style={{ gap: 10 }}>
          <Btn text="Share prescription" kind="secondary" icon={Share2} onPress={() => Share.share({ message: rxText() })} />
          {!ro && (
            <>
              <Btn text="Save draft" kind="secondary" icon={Save} loading={busy} onPress={() => run(saveOrCreate, 'Saved')} />
              <Btn text="Sign & complete" loading={busy} onPress={() => run(async () => api.consultations.sign((await saveOrCreate())._id), 'Consultation signed')} />
              {c && <Btn text="Discard draft" kind="danger" icon={Trash2} onPress={() => confirm('Discard draft', 'Discard this draft?', () => run(async () => { await api.consultations.discard(c._id); setForm(empty); }), 'Discard')} />}
            </>
          )}
        </View>
      </ScrollBody>
    </Screen>
  );
}
