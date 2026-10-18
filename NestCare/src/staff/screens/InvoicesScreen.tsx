import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Plus,
  Receipt,
  Share2,
  Wallet,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { SelectInput } from '../form';
import { confirm, fail, useDebounced, useLoad } from '../hooks';
import ListPage from '../ListPage';
import {
  Btn,
  C,
  Chip,
  fmtDate,
  HeaderBtn,
  Item,
  money,
  personName,
  Pill,
  Row,
  Stat,
  StatGrid,
} from '../ui';

const MODES = ['cash', 'upi', 'card', 'bank', 'insurance', 'other'];
const MODE_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
  insurance: 'Insurance',
  other: 'Other',
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const modesOf = (i: any) =>
  [...new Set((i.payments ?? []).map((p: any) => p.mode))] as string[];
const overdue = (i: any) =>
  !!i.dueDate &&
  (i.status === 'unpaid' || i.status === 'partial') &&
  new Date(i.dueDate).getTime() < Date.now() - 86_400_000;

type Line = {
  description: string;
  qty: string;
  rate: string;
  gstRate: string;
  discountPercent: string;
  hsnCode?: string;
  unit?: string;
  medicineId?: string;
};
const blankLine = (): Line => ({
  description: '',
  qty: '1',
  rate: '',
  gstRate: '0',
  discountPercent: '0',
});
const lineAmt = (l: Line) =>
  r2(
    (Number(l.qty) || 0) *
      (Number(l.rate) || 0) *
      (1 - (Number(l.discountPercent) || 0) / 100),
  );

const lbl = {
  fontSize: 11,
  fontWeight: '800' as const,
  color: C.black,
  textTransform: 'uppercase' as const,
  marginBottom: 5,
};
const input = {
  borderWidth: 2,
  borderColor: C.black,
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 8,
  fontSize: 14,
  color: C.black,
  backgroundColor: C.white,
};

function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: Line;
  onChange: (p: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const dq = useDebounced(
    line.description.replace(/^(Medicine|Lab|Service):\s*/i, ''),
    250,
  );
  const [focus, setFocus] = useState(false);
  const cat = useLoad(
    () =>
      focus && dq.trim().length >= 2
        ? api.invoices.catalog(dq).catch(() => [])
        : Promise.resolve([]),
    [dq, focus],
  );
  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: C.black,
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        backgroundColor: C.soft,
      }}
    >
      <TextInput
        value={line.description}
        onChangeText={v => onChange({ description: v, medicineId: undefined })}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 200)}
        placeholder="Medicine, test or service…"
        placeholderTextColor="#9CA3AF"
        style={input}
      />
      {focus && (cat.data ?? []).length > 0 && (
        <View style={{ marginTop: 6, gap: 4 }}>
          {(cat.data ?? []).slice(0, 5).map((it: any, i: number) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                onChange({
                  description: it.description,
                  rate: String(it.rate),
                  gstRate: String(it.gstRate),
                  hsnCode: it.hsnCode,
                  unit: it.unit,
                  medicineId: it.medicineId,
                });
                setFocus(false);
              }}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderWidth: 1.5,
                borderColor: C.black,
                borderRadius: 8,
                padding: 7,
                backgroundColor: C.white,
              }}
            >
              <Text
                style={{ flex: 1, fontWeight: '700', fontSize: 12 }}
                numberOfLines={1}
              >
                {it.label}
              </Text>
              <Text style={{ fontWeight: '800', fontSize: 12 }}>
                ₹{it.rate}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={lbl}>Qty</Text>
          <TextInput
            value={line.qty}
            onChangeText={v => onChange({ qty: v })}
            keyboardType="decimal-pad"
            style={input}
          />
        </View>
        <View style={{ flex: 1.3 }}>
          <Text style={lbl}>Rate ₹</Text>
          <TextInput
            value={line.rate}
            onChangeText={v => onChange({ rate: v })}
            keyboardType="decimal-pad"
            style={input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={lbl}>Disc %</Text>
          <TextInput
            value={line.discountPercent}
            onChangeText={v => onChange({ discountPercent: v })}
            keyboardType="decimal-pad"
            style={input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={lbl}>GST %</Text>
          <TextInput
            value={line.gstRate}
            onChangeText={v => onChange({ gstRate: v })}
            keyboardType="decimal-pad"
            style={input}
          />
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <TouchableOpacity onPress={onRemove}>
          <Text style={{ color: C.danger, fontWeight: '800', fontSize: 12 }}>
            REMOVE
          </Text>
        </TouchableOpacity>
        <Text style={{ fontWeight: '800', color: C.black }}>
          {money(lineAmt(line))}
        </Text>
      </View>
    </View>
  );
}

function CreateModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [adv, setAdv] = useState({ amount: '', mode: 'cash', reference: '' });
  const [busy, setBusy] = useState(false);
  const patients = useLoad(
    () => (visible ? api.patients.list() : Promise.resolve([])),
    [visible],
  );
  const doctors = useLoad(
    () => (visible ? api.doctors.list() : Promise.resolve([])),
    [visible],
  );

  useEffect(() => {
    if (visible) {
      setPatientId('');
      setDoctorId('');
      setDueDate('');
      setNotes('');
      setDiscount('0');
      setLines([blankLine()]);
      setAdv({ amount: '', mode: 'cash', reference: '' });
    }
  }, [visible]);

  const taxable = r2(lines.reduce((s, l) => s + lineAmt(l), 0));
  const gst = r2(
    lines.reduce(
      (s, l) => s + (lineAmt(l) * (Number(l.gstRate) || 0)) / 100,
      0,
    ),
  );
  const flat = Math.min(Number(discount) || 0, taxable);
  const grand = r2(taxable - flat + gst);
  const received = Number(adv.amount) || 0;
  const setLine = (i: number, p: Partial<Line>) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...p } : l)));

  const submit = async () => {
    const items = lines.filter(l => l.description.trim());
    if (!patientId) return Alert.alert('Choose a patient');
    if (
      !items.length ||
      items.some(l => !(Number(l.rate) >= 0) || l.rate === '')
    )
      return Alert.alert('Add at least one item with a rate');
    setBusy(true);
    try {
      await api.invoices.create({
        patientId,
        doctorId: doctorId || undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        discount: Number(discount) || 0,
        rememberPrices: true,
        initialPayment:
          received > 0
            ? {
                amount: received,
                mode: adv.mode,
                reference: adv.reference.trim() || undefined,
              }
            : undefined,
        items: items.map(l => ({
          description: l.description,
          qty: Number(l.qty) || 1,
          rate: Number(l.rate) || 0,
          gstRate: Number(l.gstRate) || 0,
          discountPercent: Number(l.discountPercent) || 0,
          hsnCode: l.hsnCode || undefined,
          unit: l.unit || undefined,
          medicineId: l.medicineId,
        })),
      });
      onDone();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
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
            New invoice
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={C.white} />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={lbl}>Patient *</Text>
            <SelectInput
              value={patientId}
              options={(patients.data ?? []).map((p: any) => ({
                value: p._id,
                label: `${p.name} (${p.patientId})`,
              }))}
              onChange={setPatientId}
              placeholder="Select patient"
            />
          </View>
          <View>
            <Text style={lbl}>Doctor</Text>
            <SelectInput
              value={doctorId}
              options={[
                { value: '', label: 'Not specified' },
                ...(doctors.data ?? []).map((d: any) => ({
                  value: d._id,
                  label: `Dr. ${d.name}`,
                })),
              ]}
              onChange={setDoctorId}
            />
          </View>
          <View>
            <Text style={lbl}>Due date</Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              style={input}
            />
          </View>

          <Text style={[lbl, { marginTop: 6 }]}>Items</Text>
          {lines.map((l, i) => (
            <LineEditor
              key={i}
              line={l}
              onChange={p => setLine(i, p)}
              onRemove={() =>
                setLines(ls =>
                  ls.length > 1
                    ? ls.filter((_, idx) => idx !== i)
                    : [blankLine()],
                )
              }
            />
          ))}
          <Btn
            text="Add line"
            kind="secondary"
            icon={Plus}
            onPress={() => setLines(ls => [...ls, blankLine()])}
          />

          <View>
            <Text style={lbl}>Notes (printed on invoice)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              maxLength={500}
              style={input}
            />
          </View>

          <View
            style={{
              borderWidth: 2,
              borderColor: C.black,
              borderRadius: 8,
              padding: 12,
              backgroundColor: C.soft,
            }}
          >
            <Row k="Subtotal" v={money(taxable)} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600' }}>
                Extra discount ₹
              </Text>
              <TextInput
                value={discount}
                onChangeText={setDiscount}
                keyboardType="decimal-pad"
                style={[
                  input,
                  { width: 90, textAlign: 'right', paddingVertical: 4 },
                ]}
              />
            </View>
            <Row k="GST" v={money(gst)} />
            <Row k="Total" v={money(grand)} bold />
          </View>

          <Text style={lbl}>Payment received now</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={adv.amount}
              onChangeText={v => setAdv({ ...adv, amount: v })}
              keyboardType="decimal-pad"
              placeholder="₹ 0"
              placeholderTextColor="#9CA3AF"
              style={[input, { flex: 1 }]}
            />
            <Chip
              text="Full"
              onPress={() => setAdv({ ...adv, amount: String(grand) })}
            />
          </View>
          <View>
            <Text style={lbl}>Payment method</Text>
            <SelectInput
              value={adv.mode}
              options={MODES.map(m => ({ value: m, label: MODE_LABEL[m] }))}
              onChange={m => setAdv({ ...adv, mode: m })}
            />
          </View>
          <View>
            <Text style={lbl}>Reference / txn id</Text>
            <TextInput
              value={adv.reference}
              onChangeText={v => setAdv({ ...adv, reference: v })}
              placeholder="UPI / txn id"
              placeholderTextColor="#9CA3AF"
              style={input}
            />
          </View>
          <Text
            style={{
              fontWeight: '800',
              color: grand - received > 0.005 ? C.danger : C.success,
            }}
          >
            Balance due {money(Math.max(0, r2(grand - received)))}
          </Text>
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
            text="Create invoice"
            onPress={submit}
            loading={busy}
            style={{ flex: 1.4 }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function DetailModal({
  id,
  onClose,
  onChanged,
  canVoid,
  tenant,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
  canVoid: boolean;
  tenant: any;
}) {
  const [inv, setInv] = useState<any>(null);
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () =>
    id ? api.invoices.one(id).then(setInv).catch(fail) : undefined;
  useEffect(() => {
    setInv(null);
    setAmt('');
    setRef('');
    load(); /* eslint-disable-next-line */
  }, [id]);
  if (!id) return null;
  const due = inv ? r2(inv.total - inv.paid) : 0;
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const text = () =>
    inv
      ? [
          `${tenant?.name ?? 'Clinic'} — INVOICE ${inv.number}`,
          `Patient: ${personName(inv.patientId)}`,
          `Date: ${fmtDate(inv.createdAt)}`,
          '',
          ...inv.items.map(
            (it: any, n: number) =>
              `${n + 1}. ${it.description} × ${it.qty} @ ${money(it.rate)} = ${money(it.amount)}`,
          ),
          '',
          `Subtotal ${money(inv.subtotal)}${inv.discount ? `  Discount -${money(inv.discount)}` : ''}${inv.gst ? `  GST ${money(inv.gst)}` : ''}`,
          `TOTAL ${money(inv.total)}  Paid ${money(inv.paid)}  Due ${money(Math.max(0, due))}`,
        ].join('\n')
      : '';
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: C.primary,
            padding: 14,
            borderBottomWidth: 2,
            borderBottomColor: C.black,
          }}
        >
          <Text
            style={{ flex: 1, color: C.white, fontSize: 18, fontWeight: '800' }}
          >
            {inv?.number ?? '…'}
          </Text>
          {inv && <Pill text={inv.status} />}
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={C.white} />
          </TouchableOpacity>
        </View>
        {inv && (
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <Row k="Patient" v={personName(inv.patientId)} bold />
            <Row
              k="Doctor"
              v={
                personName(inv.doctorId)
                  ? `Dr. ${personName(inv.doctorId)}`
                  : '—'
              }
            />
            <Row k="Date" v={fmtDate(inv.createdAt)} />
            <Row k="Due date" v={inv.dueDate ? fmtDate(inv.dueDate) : '—'} />
            <Row k="Billed by" v={personName(inv.createdBy) || '—'} />

            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: C.muted,
                textTransform: 'uppercase',
                marginTop: 16,
                marginBottom: 6,
              }}
            >
              Items
            </Text>
            {inv.items.map((it: any, i: number) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: C.line,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.black }}>
                    {it.description}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>
                    {it.qty} × {money(it.rate)}
                    {it.gstRate ? ` · GST ${it.gstRate}%` : ''}
                  </Text>
                </View>
                <Text style={{ fontWeight: '800' }}>{money(it.amount)}</Text>
              </View>
            ))}
            <View style={{ marginTop: 10 }}>
              <Row k="Subtotal" v={money(inv.subtotal)} />
              {inv.discount > 0 && (
                <Row k="Discount" v={`− ${money(inv.discount)}`} />
              )}
              {inv.gst > 0 && <Row k="GST" v={money(inv.gst)} />}
              <Row k="Total" v={money(inv.total)} bold />
              <Row k="Paid" v={money(inv.paid)} />
              {due > 0 && inv.status !== 'void' && (
                <Row
                  k="Due"
                  v={
                    <Text style={{ color: C.danger, fontWeight: '800' }}>
                      {money(due)}
                    </Text>
                  }
                />
              )}
            </View>

            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: C.muted,
                textTransform: 'uppercase',
                marginTop: 16,
                marginBottom: 6,
              }}
            >
              Payments
            </Text>
            {inv.payments.length === 0 ? (
              <Text style={{ color: C.muted }}>No payment recorded yet.</Text>
            ) : (
              inv.payments.map((p: any, i: number) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: C.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      <Pill
                        text={p.mode}
                        label={MODE_LABEL[p.mode] ?? p.mode}
                      />
                    </View>
                    <Text
                      style={{ fontSize: 11, color: C.muted, marginTop: 2 }}
                    >
                      {fmtDate(p.receivedAt)} ·{' '}
                      {personName(p.receivedBy) || '—'}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800' }}>{money(p.amount)}</Text>
                </View>
              ))
            )}

            {due > 0 && inv.status !== 'void' && (
              <View
                style={{
                  marginTop: 16,
                  borderWidth: 2,
                  borderColor: C.black,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: C.soft,
                  gap: 10,
                }}
              >
                <Text style={lbl}>Receive payment</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={amt}
                    onChangeText={setAmt}
                    keyboardType="decimal-pad"
                    placeholder={`Up to ${due}`}
                    placeholderTextColor="#9CA3AF"
                    style={[input, { flex: 1 }]}
                  />
                  <Chip text="Full" onPress={() => setAmt(String(due))} />
                </View>
                <SelectInput
                  value={mode}
                  options={MODES.map(m => ({ value: m, label: MODE_LABEL[m] }))}
                  onChange={setMode}
                />
                <TextInput
                  value={ref}
                  onChangeText={setRef}
                  placeholder="Reference / txn id"
                  placeholderTextColor="#9CA3AF"
                  style={input}
                />
                <Btn
                  text="Record payment"
                  loading={busy}
                  disabled={!amt}
                  onPress={() =>
                    act(async () => {
                      await api.invoices.pay(inv._id, {
                        amount: Number(amt),
                        mode,
                        reference: ref.trim() || undefined,
                      });
                      setAmt('');
                      setRef('');
                    })
                  }
                />
              </View>
            )}
          </ScrollView>
        )}
        {inv && (
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
            {canVoid && inv.status !== 'void' && inv.paid === 0 && (
              <Btn
                text="Void"
                kind="danger"
                onPress={() =>
                  confirm(
                    'Void invoice',
                    'Void this invoice?',
                    () => act(() => api.invoices.void(inv._id)),
                    'Void',
                  )
                }
                style={{ flex: 1 }}
              />
            )}
            <Btn
              text="Share"
              kind="secondary"
              icon={Share2}
              onPress={() => Share.share({ message: text() })}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default function InvoicesScreen({ navigation }: any) {
  const { user, tenant } = useAuth();
  const canVoid = ['super_admin', 'tenant_owner', 'hospital_admin'].includes(
    user?.role ?? '',
  );
  const [create, setCreate] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [sm, setSm] = useState<any>(null);
  useEffect(() => {
    api
      .summary()
      .then(s => setSm(s.invoices))
      .catch(() => {});
  }, [tick]);
  const reload = () => setTick(t => t + 1);

  return (
    <>
      <ListPage<any>
        title="Invoices"
        onBack={navigation.canGoBack?.() ? navigation.goBack : undefined}
        right={
          <HeaderBtn text="New" icon={Plus} onPress={() => setCreate(true)} />
        }
        load={() => api.invoices.list({ limit: 200 })}
        reloadKey={tick}
        searchOn={i => [
          i.number,
          personName(i.patientId),
          i.patientId?.patientId,
        ]}
        searchPlaceholder="Invoice no. or patient…"
        filters={[
          { key: 'unpaid', label: 'Unpaid' },
          { key: 'partial', label: 'Partial' },
          { key: 'paid', label: 'Paid' },
          { key: 'overdue', label: 'Overdue' },
          { key: 'void', label: 'Void' },
          ...MODES.slice(0, 4).map(m => ({
            key: `m:${m}`,
            label: MODE_LABEL[m],
          })),
        ]}
        filterFn={(i, k) =>
          k.startsWith('m:')
            ? modesOf(i).includes(k.slice(2))
            : k === 'overdue'
              ? overdue(i)
              : i.status === k
        }
        emptyIcon={Receipt}
        emptyText="No invoices yet."
        header={() => (
          <StatGrid>
            <Stat
              label="Invoices"
              value={sm?.count ?? '…'}
              sub={sm ? `${money(sm.billed)} billed` : undefined}
              icon={Receipt}
              color={C.primary}
            />
            <Stat
              label="Collected"
              value={money(sm?.collected)}
              sub={sm ? `${sm.paid} paid` : undefined}
              icon={CheckCircle2}
              color={C.success}
            />
            <Stat
              label="Outstanding"
              value={money(sm?.outstanding)}
              sub={sm ? `${sm.unpaid + sm.partial} open` : undefined}
              icon={Wallet}
              color={C.danger}
            />
            <Stat
              label="Unpaid"
              value={sm?.unpaid ?? '…'}
              icon={AlertCircle}
              color={C.secondary}
            />
          </StatGrid>
        )}
        renderItem={i => {
          const bal = r2(i.total - i.paid);
          return (
            <Item onPress={() => setViewId(i._id)}>
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
                    {i.number}
                  </Text>
                  <Text
                    style={{ fontSize: 13, color: C.black, fontWeight: '600' }}
                  >
                    {personName(i.patientId)}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>
                    {personName(i.doctorId)
                      ? `Dr. ${personName(i.doctorId)} · `
                      : ''}
                    {fmtDate(i.createdAt)} · {i.items.length} item(s)
                  </Text>
                </View>
                <Pill text={i.status} />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: 8,
                }}
              >
                <Text style={{ fontSize: 12, color: C.black }}>
                  Total{' '}
                  <Text style={{ fontWeight: '800' }}>{money(i.total)}</Text>
                </Text>
                <Text style={{ fontSize: 12, color: C.black }}>
                  Paid{' '}
                  <Text style={{ fontWeight: '800' }}>{money(i.paid)}</Text>
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color:
                      i.status !== 'void' && bal > 0.005 ? C.danger : C.muted,
                    fontWeight: '800',
                  }}
                >
                  {i.status === 'void' ? '—' : `Bal ${money(Math.max(0, bal))}`}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 8,
                  alignItems: 'center',
                }}
              >
                {modesOf(i).map(m => (
                  <Pill key={m} text={m} label={MODE_LABEL[m] ?? m} />
                ))}
                {i.dueDate ? (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: overdue(i) ? C.danger : C.muted,
                    }}
                  >
                    Due {fmtDate(i.dueDate)}
                    {overdue(i) ? ' · overdue' : ''}
                  </Text>
                ) : null}
                <View style={{ marginLeft: 'auto' }}>
                  <Chip
                    text="View"
                    icon={Eye}
                    onPress={() => setViewId(i._id)}
                  />
                </View>
              </View>
            </Item>
          );
        }}
      />
      <CreateModal
        visible={create}
        onClose={() => setCreate(false)}
        onDone={() => {
          setCreate(false);
          reload();
        }}
      />
      <DetailModal
        id={viewId}
        onClose={() => setViewId(null)}
        onChanged={reload}
        canVoid={canVoid}
        tenant={tenant}
      />
    </>
  );
}
