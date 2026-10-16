// Config-driven form modal. One field list -> labelled inputs, validation, select pickers, chips and a submit button.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { Btn, C, chunky } from './ui';

export type Option = { value: string; label: string };
export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'multiline' | 'select' | 'date' | 'switch' | 'tags' | 'password' | 'email' | 'phone';
  options?: Option[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** Typeahead suggestions for text / tags fields. */
  suggestions?: string[];
  half?: boolean;
  section?: string; // renders a heading above this field
  show?: (v: Values) => boolean;
  validate?: (v: any, all: Values) => string | undefined;
};
export type Values = Record<string, any>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Suggestions({ text, items, onPick, exclude = [] }: { text: string; items: string[]; onPick: (v: string) => void; exclude?: string[] }) {
  const t = text.trim().toLowerCase();
  const taken = new Set(exclude.map(x => x.toLowerCase()));
  const rank = (p: string) => (p.toLowerCase().startsWith(t) ? 0 : p.toLowerCase().includes(' ' + t) ? 1 : 2);
  const list = useMemo(
    () => (t ? items.filter(p => p.toLowerCase().includes(t) && !taken.has(p.toLowerCase()) && p.toLowerCase() !== t).sort((a, b) => rank(a) - rank(b)).slice(0, 8) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, items, exclude.join('|')],
  );
  if (!list.length) return null;
  return (
    <View style={f.sugWrap}>
      {list.map(p => (
        <TouchableOpacity key={p} style={f.sug} onPress={() => onPick(p)}>
          <Text style={f.sugText}>{p}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Picker field: tap to open a searchable list. */
export function SelectInput({ value, options, onChange, placeholder }: { value: string; options: Option[]; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [qs, setQs] = useState('');
  const current = options.find(o => o.value === value);
  const shown = options.filter(o => o.label.toLowerCase().includes(qs.toLowerCase()));
  return (
    <>
      <TouchableOpacity style={[f.input, f.selectBox]} onPress={() => { setQs(''); setOpen(true); }} activeOpacity={0.85}>
        <Text style={[f.selectText, !current && { color: '#9CA3AF' }]} numberOfLines={1}>{current?.label ?? placeholder ?? 'Select…'}</Text>
        <ChevronDown size={16} color={C.muted} />
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={f.backdrop}>
          <SafeAreaView edges={['bottom']} style={f.sheet}>
            <View style={f.sheetHead}>
              <TextInput value={qs} onChangeText={setQs} placeholder="Search…" placeholderTextColor="#9CA3AF" style={f.sheetSearch} />
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}><X size={22} color={C.black} /></TouchableOpacity>
            </View>
            <FlatList
              data={shown}
              keyExtractor={o => o.value || 'none'}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={f.none}>No matches</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={f.opt} onPress={() => { onChange(item.value); setOpen(false); }}>
                  <Text style={[f.optText, item.value === value && { color: C.primary }]}>{item.label}</Text>
                  {item.value === value ? <Check size={16} color={C.primary} /> : null}
                </TouchableOpacity>
              )}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

export function TagsInput({ values, onChange, suggestions = [], placeholder }: { values: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '').trim();
    if (v && !values.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText('');
  };
  return (
    <View>
      <View style={[f.input, { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }]}>
        {values.map(v => (
          <TouchableOpacity key={v} style={f.chip} onPress={() => onChange(values.filter(x => x !== v))}>
            <Text style={f.chipText}>{v}</Text>
            <X size={12} color={C.black} />
          </TouchableOpacity>
        ))}
        <TextInput
          value={text}
          onChangeText={t => (t.endsWith(',') ? add(t) : setText(t))}
          onSubmitEditing={() => add(text)}
          onBlur={() => add(text)}
          placeholder={values.length ? '' : placeholder ?? 'Type and press enter'}
          placeholderTextColor="#9CA3AF"
          style={{ minWidth: 100, flexGrow: 1, paddingVertical: 2, fontSize: 14, color: C.black }}
          returnKeyType="done"
          blurOnSubmit={false}
        />
      </View>
      <Suggestions text={text} items={suggestions} exclude={values} onPick={add} />
    </View>
  );
}

function FieldView({ fld, values, set, error }: { fld: Field; values: Values; set: (k: string, v: any) => void; error?: string }) {
  const v = values[fld.key];
  const type = fld.type ?? 'text';
  let input: React.ReactNode;
  if (type === 'select') input = <SelectInput value={v ?? ''} options={fld.options ?? []} onChange={x => set(fld.key, x)} placeholder={fld.placeholder} />;
  else if (type === 'switch') input = <Switch value={!!v} onValueChange={x => set(fld.key, x)} trackColor={{ true: C.primary }} />;
  else if (type === 'tags') input = <TagsInput values={v ?? []} onChange={x => set(fld.key, x)} suggestions={fld.suggestions} placeholder={fld.placeholder} />;
  else
    input = (
      <View>
        <TextInput
          value={v == null ? '' : String(v)}
          onChangeText={x => set(fld.key, x)}
          placeholder={fld.placeholder ?? (type === 'date' ? 'YYYY-MM-DD' : undefined)}
          placeholderTextColor="#9CA3AF"
          multiline={type === 'multiline'}
          secureTextEntry={type === 'password'}
          keyboardType={type === 'number' ? 'decimal-pad' : type === 'email' ? 'email-address' : type === 'phone' ? 'phone-pad' : type === 'date' ? 'numbers-and-punctuation' : 'default'}
          autoCapitalize={type === 'email' || type === 'password' ? 'none' : 'sentences'}
          style={[f.input, type === 'multiline' && { minHeight: 70, textAlignVertical: 'top' }]}
        />
        {fld.suggestions ? <Suggestions text={String(v ?? '')} items={fld.suggestions} onPick={x => set(fld.key, x)} /> : null}
      </View>
    );
  return (
    <View style={[f.field, fld.half && { width: '48%' }]}>
      <View style={type === 'switch' ? { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } : undefined}>
        <Text style={f.label}>{fld.label}{fld.required ? <Text style={{ color: C.danger }}> *</Text> : null}</Text>
        {type === 'switch' ? input : null}
      </View>
      {type !== 'switch' ? input : null}
      {fld.hint && !error ? <Text style={f.hint}>{fld.hint}</Text> : null}
      {error ? <Text style={f.err}>{error}</Text> : null}
    </View>
  );
}

export function FormModal({
  visible,
  title,
  fields,
  initial,
  submitLabel = 'Save',
  onClose,
  onSubmit,
  footer,
}: {
  visible: boolean;
  title: string;
  fields: Field[];
  initial?: Values;
  submitLabel?: string;
  onClose: () => void;
  /** Throw to keep the modal open and show the message. */
  onSubmit: (values: Values) => Promise<void> | void;
  footer?: React.ReactNode;
}) {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      const base: Values = {};
      fields.forEach(x => {
        base[x.key] = x.type === 'switch' ? false : x.type === 'tags' ? [] : '';
      });
      setValues({ ...base, ...(initial ?? {}) });
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const set = (k: string, v: any) => {
    setValues(p => ({ ...p, [k]: v }));
    setErrors(p => (p[k] ? { ...p, [k]: '' } : p));
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    for (const x of fields) {
      if (x.show && !x.show(values)) continue;
      const v = values[x.key];
      const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
      if (x.required && empty && x.type !== 'switch') e[x.key] = `${x.label} is required`;
      else if (!empty && x.type === 'date' && !DATE_RE.test(String(v))) e[x.key] = 'Use YYYY-MM-DD';
      else if (!empty && x.type === 'email' && !EMAIL_RE.test(String(v).trim())) e[x.key] = 'Enter a valid email';
      else if (!empty && x.type === 'number' && !Number.isFinite(Number(v))) e[x.key] = 'Enter a number';
      else if (x.validate) {
        const m = x.validate(v, values);
        if (m) e[x.key] = m;
      }
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const visibleFields = fields.filter(x => !x.show || x.show(values));
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        <View style={f.head}>
          <Text style={f.headTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><X size={24} color={C.white} /></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {visibleFields.map(x => (
                <React.Fragment key={x.key}>
                  {x.section ? <Text style={f.section}>{x.section}</Text> : null}
                  <FieldView fld={x} values={values} set={set} error={errors[x.key]} />
                </React.Fragment>
              ))}
            </View>
            {footer}
          </ScrollView>
          <View style={f.bar}>
            <Btn text="Cancel" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Btn text={submitLabel} onPress={submit} loading={busy} style={{ flex: 1.4 }} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const f = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: C.black },
  headTitle: { flex: 1, color: C.white, fontSize: 18, fontWeight: '800' },
  field: { width: '100%', marginBottom: 14 },
  section: { width: '100%', fontSize: 11, fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6, marginBottom: 10, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: C.black },
  label: { fontSize: 11, fontWeight: '800', color: C.black, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  input: { ...chunky, borderRightWidth: 3, borderBottomWidth: 3, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '500', color: C.black },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectText: { flex: 1, fontSize: 14, fontWeight: '500', color: C.black },
  hint: { fontSize: 11, color: C.muted, marginTop: 4 },
  err: { fontSize: 11, color: C.danger, fontWeight: '700', marginTop: 4 },
  bar: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 2, borderTopColor: C.black, backgroundColor: C.soft },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', backgroundColor: C.white, borderTopWidth: 2, borderColor: C.black },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 2, borderBottomColor: C.black },
  sheetSearch: { flex: 1, borderWidth: 2, borderColor: C.black, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.black },
  opt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  optText: { fontSize: 15, fontWeight: '600', color: C.black, flex: 1 },
  none: { textAlign: 'center', padding: 24, color: C.muted },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderColor: C.black, borderRadius: 8, backgroundColor: '#F0F6FF', paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700', color: C.black },
  sugWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  sug: { borderWidth: 1.5, borderColor: C.black, borderRadius: 8, backgroundColor: C.soft, paddingHorizontal: 9, paddingVertical: 5 },
  sugText: { fontSize: 12, fontWeight: '600', color: C.black },
});

/** Plain text box with typeahead chips underneath. For multi-phrase fields (complaints, advice) the last comma-separated phrase is matched. */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  multiline,
  phrases,
  editable = true,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  multiline?: boolean;
  /** Treat comma / new line as phrase separators (picking replaces only the current phrase). */
  phrases?: boolean;
  editable?: boolean;
  style?: object;
}) {
  const cut = phrases ? Math.max(value.lastIndexOf(','), value.lastIndexOf('\n')) : -1;
  const current = value.slice(cut + 1).trim();
  const done = phrases ? value.split(/[,\n]/).map(x => x.trim()).filter(Boolean) : [];
  const pick = (o: string) => {
    if (!phrases) return onChange(o);
    const head = value.slice(0, cut + 1);
    onChange(`${head}${head && !head.endsWith('\n') ? ' ' : ''}${o}, `);
  };
  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
        style={[f.input, multiline && { minHeight: 70, textAlignVertical: 'top' }, !editable && { backgroundColor: '#F3F4F6' }, style]}
      />
      {editable ? <Suggestions text={current} items={suggestions} exclude={done.filter(x => x.toLowerCase() !== current.toLowerCase())} onPick={pick} /> : null}
    </View>
  );
}
