import React, { useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ban, Building2, Pencil, Phone, Plus, ShieldAlert, Trash2, Truck, UserCheck } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { Field, FormModal, Values } from '../form';
import { confirm, fail } from '../hooks';
import ListPage from '../ListPage';
import { C, Chip, fmtDate, HeaderBtn, Item, label, money, Pill, Row, Stat, StatGrid } from '../ui';

const opts = (a: string[]) => a.map(v => ({ value: v, label: label(v) }));

const FIELDS: Field[] = [
  { key: 'businessName', label: 'Business name', required: true, section: 'Business' },
  { key: 'vendorType', label: 'Type', type: 'select', options: opts(['manufacturer', 'distributor', 'wholesaler', 'retailer', 'other']), half: true },
  { key: 'status', label: 'Status', type: 'select', options: opts(['active', 'inactive', 'blocked']), half: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: true, half: true },
  { key: 'email', label: 'Email', type: 'email', half: true },
  { key: 'contactName', label: 'Contact person', half: true, section: 'Contact' },
  { key: 'contactPhone', label: 'Contact phone', type: 'phone', half: true },
  { key: 'city', label: 'City', half: true },
  { key: 'state', label: 'State', half: true },
  { key: 'gstin', label: 'GSTIN', section: 'Compliance', validate: v => (v && !/^[0-9A-Z]{15}$/i.test(v) ? 'GSTIN is 15 characters' : undefined) },
  { key: 'drugLicenseNumber', label: 'Drug licence no.', half: true },
  { key: 'drugLicenseExpiry', label: 'Licence expiry', type: 'date', half: true },
  { key: 'paymentTerms', label: 'Payment terms', type: 'select', options: opts(['immediate', '7_days', '15_days', '30_days', '45_days', '60_days', 'custom']), half: true, section: 'Accounts' },
  { key: 'creditLimit', label: 'Credit limit (₹)', type: 'number', half: true },
  { key: 'notes', label: 'Notes', type: 'multiline' },
];

const toForm = (v: any): Values => ({
  businessName: v.businessName, vendorType: v.vendorType, status: v.status, phone: v.phone, email: v.email ?? '',
  contactName: v.contactPerson?.name ?? '', contactPhone: v.contactPerson?.phone ?? '', city: v.address?.city ?? '', state: v.address?.state ?? '',
  gstin: v.gstin ?? '', drugLicenseNumber: v.drugLicenseNumber ?? '', drugLicenseExpiry: v.drugLicenseExpiry ? String(v.drugLicenseExpiry).slice(0, 10) : '',
  paymentTerms: v.paymentTerms, creditLimit: String(v.creditLimit ?? 0), notes: v.notes ?? '',
});

const toPayload = (v: Values, old?: any) => ({
  businessName: v.businessName.trim(), vendorType: v.vendorType, status: v.status, phone: String(v.phone).replace(/\D/g, '').slice(-10), email: v.email,
  contactPerson: { ...(old?.contactPerson ?? {}), name: v.contactName, phone: v.contactPhone },
  address: { ...(old?.address ?? {}), city: v.city, state: v.state, country: 'India' },
  gstin: (v.gstin || '').toUpperCase(), drugLicenseNumber: v.drugLicenseNumber, drugLicenseExpiry: v.drugLicenseExpiry || null,
  paymentTerms: v.paymentTerms, creditLimit: Number(v.creditLimit) || 0, notes: v.notes,
});

export default function VendorsScreen({ navigation }: any) {
  const { user } = useAuth();
  const canDelete = ['super_admin', 'tenant_owner', 'hospital_admin'].includes(user?.role ?? '');
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState<any>(null);
  React.useEffect(() => { api.vendors.stats().then(setStats).catch(() => {}); }, [tick]);
  const reload = () => setTick(t => t + 1);

  return (
    <>
      <ListPage<any>
        title="Vendors"
        subtitle="Medicine suppliers"
        onBack={navigation.goBack}
        right={<HeaderBtn text="Add" icon={Plus} onPress={() => setEdit('new')} />}
        load={() => api.vendors.list()}
        reloadKey={tick}
        searchOn={v => [v.businessName, v.vendorId, v.phone, v.gstin, v.contactPerson?.name]}
        searchPlaceholder="Name, phone, GSTIN or ID…"
        filters={[{ key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }, { key: 'blocked', label: 'Blocked' }]}
        filterFn={(v, k) => v.status === k}
        emptyIcon={Truck}
        emptyText="No vendors yet."
        header={() => (
          <StatGrid>
            <Stat label="Vendors" value={stats?.total ?? '…'} icon={Building2} color={C.primary} />
            <Stat label="Active" value={stats?.active ?? '…'} icon={UserCheck} color={C.success} />
            <Stat label="Licence due" value={stats?.licenceDue ?? '…'} icon={ShieldAlert} color={C.secondary} />
            <Stat label="Blocked" value={stats?.blocked ?? '…'} icon={Ban} color={C.danger} />
          </StatGrid>
        )}
        renderItem={v => (
          <Item onPress={() => setEdit(v)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.black }}>{v.businessName}</Text>
                <Text style={{ fontSize: 12, color: C.muted }}>{v.vendorId} · {label(v.vendorType)}</Text>
              </View>
              <Pill text={v.status} />
            </View>
            <View style={{ marginTop: 8 }}>
              <Row k="Contact" v={v.contactPerson?.name || '—'} />
              <Row k="GSTIN" v={v.gstin || '—'} />
              <Row k="Licence" v={v.drugLicenseNumber ? `${v.drugLicenseNumber}${v.drugLicenseExpiry ? ` · exp ${fmtDate(v.drugLicenseExpiry)}` : ''}` : '—'} />
              <Row k="Terms" v={`${label(v.paymentTerms)} · limit ${money(v.creditLimit)}`} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${v.phone}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderColor: C.primary, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Phone size={13} color={C.primary} /><Text style={{ fontSize: 11, fontWeight: '800', color: C.primary }}>{v.phone}</Text>
              </TouchableOpacity>
              <Chip text="Edit" icon={Pencil} onPress={() => setEdit(v)} />
              {canDelete && <Chip text="Delete" icon={Trash2} color={C.danger} onPress={() => confirm('Delete vendor', `Delete ${v.businessName}?`, () => api.vendors.remove(v._id).then(reload).catch(fail), 'Delete')} />}
            </View>
          </Item>
        )}
      />
      <FormModal
        visible={!!edit}
        title={edit === 'new' ? 'Add vendor' : 'Edit vendor'}
        fields={FIELDS}
        initial={edit && edit !== 'new' ? toForm(edit) : { vendorType: 'distributor', status: 'active', paymentTerms: 'immediate', creditLimit: '0' }}
        submitLabel={edit === 'new' ? 'Add vendor' : 'Save changes'}
        onClose={() => setEdit(null)}
        onSubmit={async v => {
          if (edit === 'new') await api.vendors.create(toPayload(v));
          else await api.vendors.update(edit._id, toPayload(v, edit));
          setEdit(null);
          reload();
        }}
      />
    </>
  );
}
