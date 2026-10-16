// Locations, Audit log, Staff and Password reset — the clinic-admin screens.
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ClipboardList, Copy, KeyRound, Mail, MapPin, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { Field, FormModal, Values } from '../form';
import { confirm, fail } from '../hooks';
import ListPage from '../ListPage';
import { DEPARTMENTS, DESIGNATIONS, STAFF_ROLES } from '../presets';
import { Btn, C, Chip, fmtDateTime, HeaderBtn, Item, label, Pill, Stat, StatGrid } from '../ui';

const opts = (a: string[]) => a.map(v => ({ value: v, label: label(v) }));

/* ------------------------------- Locations ------------------------------- */
const LOC_FIELDS: Field[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'code', label: 'Code', required: true, half: true },
  { key: 'phone', label: 'Phone', type: 'phone', half: true },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'City', half: true },
  { key: 'state', label: 'State', half: true },
  { key: 'pincode', label: 'Pincode', half: true },
  { key: 'status', label: 'Status', type: 'select', options: opts(['active', 'inactive']), half: true },
];

export function LocationsScreen({ navigation }: any) {
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);
  return (
    <>
      <ListPage<any>
        title="Locations"
        onBack={navigation.goBack}
        right={<HeaderBtn text="Add" icon={Plus} onPress={() => setEdit('new')} />}
        load={() => api.locations.list()}
        reloadKey={tick}
        searchOn={l => [l.name, l.code, l.address?.city]}
        emptyIcon={MapPin}
        emptyText="No locations yet."
        renderItem={l => (
          <Item onPress={() => setEdit(l)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.black }}>{l.name}</Text>
                <Text style={{ fontSize: 12, color: C.muted }}>{l.code} · {[l.address?.city, l.address?.state].filter(Boolean).join(', ') || '—'}</Text>
              </View>
              <Pill text={l.status} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Chip text="Edit" icon={Pencil} onPress={() => setEdit(l)} />
              <Chip text="Delete" icon={Trash2} color={C.danger} onPress={() => confirm('Delete location', `Delete ${l.name}?`, () => api.locations.remove(l._id).then(reload).catch(fail), 'Delete')} />
            </View>
          </Item>
        )}
      />
      <FormModal
        visible={!!edit}
        title={edit === 'new' ? 'Add location' : 'Edit location'}
        fields={LOC_FIELDS.filter(f => edit === 'new' || f.key !== 'code')}
        initial={edit && edit !== 'new' ? { name: edit.name, phone: edit.phone, street: edit.address?.street, city: edit.address?.city, state: edit.address?.state, pincode: edit.address?.pincode, status: edit.status } : { status: 'active' }}
        onClose={() => setEdit(null)}
        onSubmit={async v => {
          const body = { name: v.name, code: v.code, phone: v.phone, status: v.status, address: { street: v.street, city: v.city, state: v.state, pincode: v.pincode } };
          if (edit === 'new') await api.locations.create(body);
          else await api.locations.update(edit._id, body);
          setEdit(null);
          reload();
        }}
      />
    </>
  );
}

/* -------------------------------- Audit log ------------------------------- */
export function AuditLogScreen({ navigation }: any) {
  return (
    <ListPage<any>
      title="Audit Log"
      subtitle="Who viewed or changed what"
      onBack={navigation.goBack}
      load={() => api.audit({ limit: 150 })}
      searchOn={a => [a.resource, a.action, a.path, a.userId?.name, a.role]}
      searchPlaceholder="User, resource or action…"
      filters={[{ key: 'view', label: 'Views' }, { key: 'create', label: 'Creates' }, { key: 'update', label: 'Updates' }, { key: 'delete', label: 'Deletes' }, { key: 'denied', label: 'Denied' }]}
      filterFn={(a, k) => (k === 'denied' ? a.status >= 400 : a.action === k)}
      emptyIcon={ShieldCheck}
      emptyText="No activity recorded yet."
      renderItem={a => (
        <Item>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.black }}>{a.userId?.name ?? 'Unknown'} <Text style={{ fontWeight: '500', color: C.muted }}>({label(a.role)})</Text></Text>
              <Text style={{ fontSize: 12, color: C.black }}>{label(a.resource)} · {a.method} {a.path}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>{fmtDateTime(a.at)}{a.ip ? ` · ${a.ip}` : ''}</Text>
            </View>
            <View style={{ gap: 4, alignItems: 'flex-end' }}>
              <Pill text={a.status >= 400 ? 'denied' : a.action} />
            </View>
          </View>
        </Item>
      )}
    />
  );
}

/* ---------------------------------- Staff --------------------------------- */
const ROLE_OPTS = STAFF_ROLES.filter(r => r.value !== 'doctor' || true).map(r => ({ value: r.value, label: r.label }));
const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

const STAFF_FIELDS: Field[] = [
  { key: 'firstName', label: 'First name', required: true, half: true, section: 'Personal' },
  { key: 'lastName', label: 'Last name', required: true, half: true },
  { key: 'gender', label: 'Gender', type: 'select', options: opts(['male', 'female', 'other', 'undisclosed']), half: true },
  { key: 'phone', label: 'Mobile', type: 'phone', required: true, half: true, validate: v => (!/^\d{10}$/.test(String(v).replace(/\D/g, '').slice(-10)) ? 'Enter a 10-digit number' : undefined) },
  { key: 'email', label: 'Login email', type: 'email', required: true, section: 'Login & role' },
  { key: 'role', label: 'Role', type: 'select', options: ROLE_OPTS, required: true },
  { key: 'password', label: 'Password', type: 'password', required: true, hint: '8+ characters with upper, lower case and a number.', validate: v => (!PW_RE.test(String(v)) ? 'Needs 8+ chars with upper, lower case and a number' : undefined) },
  { key: 'designation', label: 'Designation', suggestions: DESIGNATIONS, section: 'Employment' },
  { key: 'department', label: 'Department', suggestions: DEPARTMENTS },
  { key: 'joiningDate', label: 'Joining date', type: 'date' },
];

export function StaffScreen({ navigation }: any) {
  const { user } = useAuth();
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);
  const toggle = (u: any) => api.staff.update(u._id, { status: u.status === 'active' ? 'inactive' : 'active' }).then(reload).catch(fail);
  return (
    <>
      <ListPage<any>
        title="Staff"
        onBack={navigation.goBack}
        right={<HeaderBtn text="Add" icon={Plus} onPress={() => setEdit('new')} />}
        load={() => api.staff.list()}
        reloadKey={tick}
        searchOn={u => [u.name, u.email, u.role, u.staffId, u.designation]}
        searchPlaceholder="Name, email or role…"
        filters={[{ key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }, { key: 'doctor', label: 'Doctors' }, { key: 'nurse', label: 'Nurses' }, { key: 'receptionist', label: 'Reception' }]}
        filterFn={(u, k) => u.status === k || u.role === k}
        emptyIcon={ClipboardList}
        emptyText="No staff yet."
        header={list => (
          <StatGrid>
            <Stat label="Staff" value={list.length} icon={ClipboardList} color={C.primary} />
            <Stat label="Active" value={list.filter(u => u.status === 'active').length} icon={UserCheck} color={C.success} />
            <Stat label="Inactive" value={list.filter(u => u.status !== 'active').length} icon={UserX} color={C.muted} />
            <Stat label="Doctors" value={list.filter(u => u.role === 'doctor').length} icon={ShieldCheck} color={C.secondary} />
          </StatGrid>
        )}
        renderItem={u => (
          <Item>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.black }}>{u.name}</Text>
                <Text style={{ fontSize: 12, color: C.muted }}>{u.email}</Text>
                <Text style={{ fontSize: 12, color: C.black, textTransform: 'capitalize' }}>{label(u.role)}{u.designation ? ` · ${u.designation}` : ''}</Text>
              </View>
              <Pill text={u.status} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {u._id !== user?._id && <Chip text={u.status === 'active' ? 'Deactivate' : 'Activate'} icon={u.status === 'active' ? UserX : UserCheck} color={u.status === 'active' ? C.secondary : C.success} onPress={() => toggle(u)} />}
              <Chip text="Reset password" icon={KeyRound} color={C.primary} onPress={() => navigation.navigate('PasswordReset', { userId: u._id })} />
              {u._id !== user?._id && <Chip text="Delete" icon={Trash2} color={C.danger} onPress={() => confirm('Delete account', `Delete ${u.name}'s login?`, () => api.staff.remove(u._id).then(reload).catch(fail), 'Delete')} />}
            </View>
          </Item>
        )}
      />
      <FormModal
        visible={edit === 'new'}
        title="Add staff member"
        fields={STAFF_FIELDS}
        initial={{ gender: 'male', role: 'receptionist' }}
        submitLabel="Create account"
        onClose={() => setEdit(null)}
        onSubmit={async (v: Values) => {
          await api.staff.create({
            firstName: v.firstName.trim(), lastName: v.lastName.trim(), gender: v.gender, email: v.email.trim(), role: v.role, password: v.password,
            contact: { phone: String(v.phone).replace(/\D/g, '').slice(-10) },
            employment: { designation: v.designation, department: v.department, joiningDate: v.joiningDate || null },
          });
          setEdit(null);
          reload();
        }}
      />
    </>
  );
}

/* ----------------------------- Password reset ----------------------------- */
export function PasswordResetScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const [target, setTarget] = useState<any | null>(null);
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const canReset = (u: any) => u._id !== user?._id && (u.role !== 'hospital_admin' || user?.role === 'tenant_owner');

  useEffect(() => { setCopied(false); }, [issued]);

  return (
    <>
      <ListPage<any>
        title="Password Reset"
        subtitle="Doctors & staff"
        onBack={navigation.goBack}
        load={() => api.staff.list()}
        searchOn={u => [u.name, u.email, u.role, u.staffId]}
        searchPlaceholder="Name, email or role…"
        emptyIcon={KeyRound}
        emptyText="No users."
        header={() => <Text style={{ color: C.muted, marginBottom: 4 }}>Sets a temporary password and signs the person out everywhere. They should change it after logging in.</Text>}
        renderItem={u => (
          <Item style={route?.params?.userId === u._id ? { borderColor: C.primary } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.black }}>{u.name}</Text>
                <Text style={{ fontSize: 12, color: C.muted }}>{u.email}</Text>
                <Text style={{ fontSize: 12, color: C.black, textTransform: 'capitalize' }}>{label(u.role)}</Text>
              </View>
              <Pill text={u.status} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Chip text="Email link" icon={Mail} onPress={() => api.forgotPassword(u.email).then(() => Alert.alert('Reset link requested', "If email isn't configured on the server, use a temporary password instead.")).catch(fail)} />
              {canReset(u) && <Chip text="Reset password" icon={KeyRound} color={C.primary} onPress={() => setTarget(u)} />}
            </View>
          </Item>
        )}
      />
      <FormModal
        visible={!!target}
        title={`Reset — ${target?.name ?? ''}`}
        fields={[{ key: 'password', label: 'New password (optional)', type: 'password', hint: 'Leave blank to auto-generate a secure one.', validate: v => (v && !PW_RE.test(String(v)) ? 'Needs 8+ chars with upper, lower case and a number' : undefined) }]}
        initial={{ password: '' }}
        submitLabel="Reset password"
        onClose={() => setTarget(null)}
        onSubmit={async v => {
          const r = await api.staff.resetPassword(target._id, v.password?.trim() || undefined);
          setTarget(null);
          setIssued(r);
        }}
      />
      <Modal visible={!!issued} transparent animationType="fade" onRequestClose={() => setIssued(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <SafeAreaView>
            <View style={{ backgroundColor: C.white, borderWidth: 2, borderColor: C.black, borderRadius: 8, padding: 16, gap: 10 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.black }}>New password for {issued?.name}</Text>
              <View style={{ backgroundColor: C.soft, borderWidth: 2, borderColor: C.black, padding: 10 }}>
                <Text style={{ color: C.black }}>Email: <Text style={{ fontWeight: '800' }}>{issued?.email}</Text></Text>
                <Text style={{ color: C.black, marginTop: 4 }}>Password: <Text selectable style={{ fontWeight: '800', fontSize: 18 }}>{issued?.password}</Text></Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <ShieldAlert size={16} color={C.secondary} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: C.secondary }}>Shown only once. Share it privately and ask them to change it after signing in.</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn text={copied ? 'Shared' : 'Share'} kind="secondary" icon={copied ? Check : Copy} onPress={() => { Share.share({ message: `NestCare login\nEmail: ${issued?.email}\nPassword: ${issued?.password}` }).then(() => setCopied(true)).catch(() => {}); }} style={{ flex: 1 }} />
                <Btn text="Done" onPress={() => setIssued(null)} style={{ flex: 1 }} />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
