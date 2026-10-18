import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  AlertTriangle,
  Boxes,
  Clock,
  Package,
  PackagePlus,
  Pencil,
  Pill as PillIcon,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { Field, FormModal, Values } from '../form';
import { confirm, fail } from '../hooks';
import ListPage from '../ListPage';
import {
  C,
  Chip,
  fmtDate,
  HeaderBtn,
  Item,
  money,
  Pill,
  Stat,
  StatGrid,
} from '../ui';

const opts = (a: string[]) => a.map(v => ({ value: v, label: v }));
const FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'injection',
  'cream',
  'ointment',
  'drops',
  'inhaler',
  'powder',
  'gel',
  'lotion',
  'other',
];
const UNITS = [
  'tablet',
  'capsule',
  'ml',
  'bottle',
  'vial',
  'tube',
  'strip',
  'piece',
  'pack',
  'other',
];
const CATEGORIES = [
  'Analgesic / Antipyretic',
  'Antibiotic',
  'Antiviral',
  'Antifungal',
  'Antihistamine / Allergy',
  'Antacid / GI',
  'Antidiabetic',
  'Antihypertensive',
  'Cardiac',
  'Cholesterol',
  'Respiratory',
  'Vitamin / Supplement',
  'Steroid',
  'Dermatological',
  'Eye / Ear',
  'Neurological',
  'Psychiatric',
  'Hormonal',
  'IV Fluid',
  'Vaccine',
  'Surgical / Consumable',
  'Other',
];
const SCHEDULES = [
  'OTC',
  'Schedule H',
  'Schedule H1',
  'Schedule X',
  'Schedule G',
  'Narcotic (NDPS)',
];

const FIELDS: Field[] = [
  { key: 'name', label: 'Medicine name', required: true, section: 'Basic' },
  { key: 'genericName', label: 'Generic name', half: true },
  { key: 'brandName', label: 'Brand', half: true },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'category', label: 'Category', suggestions: CATEGORIES },
  {
    key: 'dosageForm',
    label: 'Dosage form',
    type: 'select',
    options: opts(FORMS),
    required: true,
    half: true,
  },
  { key: 'strength', label: 'Strength', half: true, placeholder: '500 mg' },
  { key: 'packSize', label: 'Pack size', type: 'number', half: true },
  {
    key: 'unit',
    label: 'Unit',
    type: 'select',
    options: opts(UNITS),
    half: true,
  },
  {
    key: 'activeIngredients',
    label: 'Active ingredients',
    type: 'tags',
    placeholder: 'e.g. Paracetamol 500mg',
  },
  {
    key: 'mrp',
    label: 'MRP (₹)',
    type: 'number',
    required: true,
    half: true,
    section: 'Pricing & stock',
  },
  {
    key: 'sellingPrice',
    label: 'Selling price (₹)',
    type: 'number',
    required: true,
    half: true,
    validate: (v, all) =>
      Number(v) > Number(all.mrp) ? 'Cannot exceed MRP' : undefined,
  },
  { key: 'gstRate', label: 'GST %', type: 'number', half: true },
  { key: 'hsnCode', label: 'HSN', half: true },
  { key: 'barcode', label: 'Barcode', half: true },
  { key: 'sku', label: 'SKU', half: true },
  { key: 'trackInventory', label: 'Track inventory', type: 'switch' },
  {
    key: 'reorderLevel',
    label: 'Reorder level',
    type: 'number',
    show: v => !!v.trackInventory,
  },
  { key: 'isActive', label: 'Active', type: 'switch' },
  {
    key: 'prescriptionRequired',
    label: 'Prescription required (Rx)',
    type: 'switch',
    section: 'Clinical',
  },
  { key: 'scheduleCategory', label: 'Schedule', suggestions: SCHEDULES },
  { key: 'storageInstructions', label: 'Storage' },
  { key: 'warnings', label: 'Warnings', type: 'tags' },
  { key: 'description', label: 'Description', type: 'multiline' },
];

const toForm = (m: any): Values => ({
  name: m.name,
  genericName: m.genericName ?? '',
  brandName: m.brandName ?? '',
  manufacturer: m.manufacturer ?? '',
  category: m.category ?? '',
  dosageForm: m.dosageForm,
  strength: m.strength ?? '',
  packSize: String(m.packSize ?? 1),
  unit: m.unit,
  activeIngredients: (m.activeIngredients ?? []).map((i: any) =>
    i.strength ? `${i.name} ${i.strength}` : i.name,
  ),
  mrp: String(m.mrp),
  sellingPrice: String(m.sellingPrice),
  gstRate: String(m.gstRate ?? 0),
  hsnCode: m.hsnCode ?? '',
  barcode: m.barcode ?? '',
  sku: m.sku ?? '',
  trackInventory: m.trackInventory,
  reorderLevel: String(m.reorderLevel ?? 0),
  isActive: m.isActive,
  prescriptionRequired: m.prescriptionRequired,
  scheduleCategory: m.scheduleCategory ?? '',
  storageInstructions: m.storageInstructions ?? '',
  warnings: m.warnings ?? [],
  description: m.description ?? '',
});

const toPayload = (v: Values) => ({
  ...v,
  packSize: Number(v.packSize) || 1,
  mrp: Number(v.mrp),
  sellingPrice: Number(v.sellingPrice),
  gstRate: Number(v.gstRate) || 0,
  reorderLevel: Number(v.reorderLevel) || 0,
  activeIngredients: (v.activeIngredients as string[]).map(c => {
    const m = c.match(/^(.*?)\s+(\d[\d.,]*\s?\w+(\/\w+)?)$/);
    return m
      ? { name: m[1].trim(), strength: m[2].trim() }
      : { name: c.trim(), strength: '' };
  }),
});

const STOCK_FIELDS: Field[] = [
  {
    key: 'type',
    label: 'Action',
    type: 'select',
    required: true,
    options: [
      { value: 'in', label: 'Stock in' },
      { value: 'out', label: 'Stock out' },
      { value: 'set', label: 'Set count' },
    ],
  },
  { key: 'qty', label: 'Quantity', type: 'number', required: true },
  {
    key: 'expiryDate',
    label: 'Batch expiry (optional)',
    type: 'date',
    show: v => v.type === 'in',
  },
];

const expiry = (d?: string) => {
  if (!d) return null;
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? 'expired' : days <= 90 ? 'soon' : 'ok';
};

export default function MedicinesScreen({ navigation }: any) {
  const { user } = useAuth();
  const canManage = [
    'super_admin',
    'tenant_owner',
    'hospital_admin',
    'pharmacist',
  ].includes(user?.role ?? '');
  const canDelete = ['super_admin', 'tenant_owner', 'hospital_admin'].includes(
    user?.role ?? '',
  );
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const [stock, setStock] = useState<any | null>(null);
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState<any>(null);
  React.useEffect(() => {
    api.medicines
      .stats()
      .then(setStats)
      .catch(() => {});
  }, [tick]);
  const reload = () => setTick(t => t + 1);

  return (
    <>
      <ListPage<any>
        title="Medicines"
        subtitle="Catalogue & inventory"
        onBack={navigation.goBack}
        right={
          canManage ? (
            <HeaderBtn text="Add" icon={Plus} onPress={() => setEdit('new')} />
          ) : undefined
        }
        load={() => api.medicines.list()}
        reloadKey={tick}
        searchOn={m => [
          m.name,
          m.genericName,
          m.brandName,
          m.barcode,
          m.sku,
          m.medicineId,
        ]}
        searchPlaceholder="Name, generic, brand, barcode, SKU…"
        filters={[
          { key: 'low', label: 'Low stock' },
          { key: 'out', label: 'Out of stock' },
          { key: 'expiring', label: 'Expiring' },
          { key: 'active', label: 'Active' },
          { key: 'inactive', label: 'Inactive' },
        ]}
        filterFn={(m, k) =>
          k === 'low'
            ? m.trackInventory && m.stockQty > 0 && m.stockQty <= m.reorderLevel
            : k === 'out'
              ? m.trackInventory && m.stockQty === 0
              : k === 'expiring'
                ? m.stockQty > 0 &&
                  !!m.expiryDate &&
                  new Date(m.expiryDate).getTime() <=
                    Date.now() + 90 * 86_400_000
                : k === 'active'
                  ? m.isActive
                  : !m.isActive
        }
        emptyIcon={PillIcon}
        emptyText="No medicines found."
        header={() => (
          <StatGrid>
            <Stat
              label="Total"
              value={stats?.total ?? '…'}
              icon={PillIcon}
              color={C.primary}
            />
            <Stat
              label="Low stock"
              value={stats?.lowStock ?? '…'}
              icon={AlertTriangle}
              color={C.secondary}
            />
            <Stat
              label="Out of stock"
              value={stats?.outOfStock ?? '…'}
              icon={Package}
              color={C.danger}
            />
            <Stat
              label="Expiring ≤ 90d"
              value={stats?.expiringSoon ?? '…'}
              icon={Clock}
              color={C.purple}
            />
            <Stat
              label="Active"
              value={stats?.active ?? '…'}
              icon={Boxes}
              color={C.success}
            />
            <Stat
              label="Stock value"
              value={money(stats?.stockValue)}
              icon={Wallet}
              color={C.primary}
            />
          </StatGrid>
        )}
        renderItem={m => {
          const low = m.trackInventory && m.stockQty <= m.reorderLevel;
          const ex = expiry(m.expiryDate);
          return (
            <Item style={!m.isActive ? { opacity: 0.6 } : undefined}>
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
                    {m.name}{' '}
                    {m.prescriptionRequired ? (
                      <Text style={{ fontSize: 10, color: C.primary }}>Rx</Text>
                    ) : null}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>
                    {[m.genericName, m.manufacturer]
                      .filter(Boolean)
                      .join(' · ') || m.medicineId}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.black,
                      textTransform: 'capitalize',
                    }}
                  >
                    {m.dosageForm}
                    {m.strength ? ` · ${m.strength}` : ''}
                    {m.category ? ` · ${m.category}` : ''}
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 16, fontWeight: '800', color: C.black }}
                >
                  {money(m.sellingPrice)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                {m.trackInventory ? (
                  <Text
                    style={{
                      fontWeight: '800',
                      color: low ? C.danger : C.black,
                    }}
                  >
                    {m.stockQty} {m.unit}
                    {m.stockQty === 0 ? ' · out' : low ? ' · low' : ''}
                  </Text>
                ) : (
                  <Pill text="inactive" label="Not tracked" />
                )}
                {m.expiryDate ? (
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color:
                        ex === 'expired'
                          ? C.danger
                          : ex === 'soon'
                            ? C.warning
                            : C.muted,
                    }}
                  >
                    Exp {fmtDate(m.expiryDate)}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {canManage && m.trackInventory && (
                  <Chip
                    text="Stock"
                    icon={PackagePlus}
                    color={C.success}
                    onPress={() => setStock(m)}
                  />
                )}
                {canManage && (
                  <Chip text="Edit" icon={Pencil} onPress={() => setEdit(m)} />
                )}
                {canDelete && (
                  <Chip
                    text="Delete"
                    icon={Trash2}
                    color={C.danger}
                    onPress={() =>
                      confirm(
                        'Delete medicine',
                        `Delete ${m.name}?`,
                        () =>
                          api.medicines.remove(m._id).then(reload).catch(fail),
                        'Delete',
                      )
                    }
                  />
                )}
              </View>
            </Item>
          );
        }}
      />
      <FormModal
        visible={!!edit}
        title={edit === 'new' ? 'Add medicine' : 'Edit medicine'}
        fields={FIELDS}
        initial={
          edit && edit !== 'new'
            ? toForm(edit)
            : {
                dosageForm: 'tablet',
                unit: 'piece',
                packSize: '1',
                gstRate: '12',
                reorderLevel: '10',
                trackInventory: true,
                isActive: true,
                prescriptionRequired: true,
              }
        }
        submitLabel={edit === 'new' ? 'Add medicine' : 'Save changes'}
        onClose={() => setEdit(null)}
        onSubmit={async v => {
          if (edit === 'new') await api.medicines.create(toPayload(v));
          else await api.medicines.update(edit._id, toPayload(v));
          setEdit(null);
          reload();
        }}
      />
      <FormModal
        visible={!!stock}
        title={`Stock — ${stock?.name ?? ''}`}
        fields={STOCK_FIELDS}
        initial={{ type: 'in', qty: '', expiryDate: '' }}
        submitLabel="Update stock"
        onClose={() => setStock(null)}
        footer={
          <Text style={{ color: C.muted, marginTop: 4 }}>
            On hand now: {stock?.stockQty} {stock?.unit}
          </Text>
        }
        onSubmit={async v => {
          await api.medicines.stock(stock._id, {
            type: v.type,
            qty: Number(v.qty),
            expiryDate:
              v.type === 'in' && v.expiryDate ? v.expiryDate : undefined,
          });
          setStock(null);
          reload();
        }}
      />
    </>
  );
}
