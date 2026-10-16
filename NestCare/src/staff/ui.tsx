// NestCare staff app UI kit — same look as NestHR / NestLeads / NestSports mobile:
// white cards, 2px black border, 8px radius, heavy right/bottom edge, uppercase bold labels.
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  ViewStyle,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Search, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

export const C = {
  primary: '#024BAB',
  secondary: '#FA731C',
  success: '#00C48C',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#A855F7',
  black: '#000000',
  ink: '#0A0A0A',
  white: '#FFFFFF',
  bg: '#FFFFFF',
  soft: '#F8FAFF',
  muted: '#6B7280',
  line: '#E5E7EB',
};

export const chunky: ViewStyle = {
  borderWidth: 2,
  borderRadius: 8,
  borderRightWidth: 5,
  borderBottomWidth: 5,
  borderColor: C.black,
  borderRightColor: C.ink,
  borderBottomColor: C.ink,
};

export const money = (n?: number | null) => `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDateTime = (d?: string | Date | null) => (d ? `${fmtDate(d)} · ${fmtTime(d)}` : '—');
export const personName = (v: unknown): string => (v && typeof v === 'object' ? (v as any).name || '' : '') as string;
export const label = (s?: string) => (s ?? '').replace(/_/g, ' ');
export const ymd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Screen frame: title bar (optional back + right action) over a body. */
export function Screen({
  title,
  subtitle,
  onBack,
  right,
  children,
  loading,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={s.back} hitSlop={8}>
            <ArrowLeft size={20} color={C.black} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function HeaderBtn({ text, onPress, icon: Icon, color = C.primary }: { text: string; onPress: () => void; icon?: LucideIcon; color?: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[s.hbtn, { backgroundColor: color }]}>
      {Icon ? <Icon size={14} color={C.white} /> : null}
      <Text style={s.hbtnText}>{text}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const Body: any = onPress ? TouchableOpacity : View;
  return (
    <Body onPress={onPress} activeOpacity={0.85} style={[s.card, style]}>
      {children}
    </Body>
  );
}

export function Btn({
  text,
  onPress,
  icon: Icon,
  kind = 'primary',
  disabled,
  loading,
  style,
}: {
  text: string;
  onPress: () => void;
  icon?: LucideIcon;
  kind?: 'primary' | 'secondary' | 'danger' | 'orange';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.primary : kind === 'orange' ? C.secondary : kind === 'danger' ? '#FEF2F2' : C.white;
  const fg = kind === 'primary' || kind === 'orange' ? C.white : kind === 'danger' ? C.danger : C.black;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[s.btn, kind === 'danger' && { borderColor: C.danger, borderRightColor: C.danger, borderBottomColor: C.danger }, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : Icon ? <Icon size={15} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{text}</Text>
    </TouchableOpacity>
  );
}

const TONE: Record<string, [string, string]> = {
  success: ['#DCFCE7', C.success], danger: ['#FEF2F2', C.danger], warning: ['#FFF7ED', C.warning],
  primary: ['#EEF4FF', C.primary], purple: ['#F5F0FF', C.purple], gray: ['#F3F4F6', '#9CA3AF'],
};
const WORD_TONE: Record<string, string> = {
  active: 'success', completed: 'success', resulted: 'success', paid: 'success', verified: 'success', signed: 'success', approved: 'success',
  scheduled: 'primary', collected: 'primary', partial: 'primary', in_clinic: 'primary',
  pending: 'warning', ordered: 'warning', unpaid: 'warning', draft: 'warning', low: 'warning', walk_in: 'warning', trialing: 'warning',
  no_show: 'danger', rejected: 'danger', suspended: 'danger', denied: 'danger', failed: 'danger', expired: 'danger', blocked: 'danger', high: 'danger',
  inactive: 'gray', cancelled: 'gray', void: 'gray', archived: 'gray',
  video: 'purple', upi: 'purple', cash: 'success', card: 'primary', bank: 'warning', insurance: 'gray',
};
export function Pill({ text, tone, label: custom }: { text?: string | number | null; tone?: keyof typeof TONE; label?: string }) {
  const raw = String(text ?? '');
  const key = raw.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const [bg, border] = TONE[tone ?? WORD_TONE[key] ?? 'gray'];
  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[s.pillText, { color: border === '#9CA3AF' ? '#4B5563' : border }]}>{custom ?? label(raw)}</Text>
    </View>
  );
}

/** Horizontal filter pills: white with black border, selected one filled blue. */
export function Pills({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillsBar} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
      {options.map(o => {
        const on = value === o.key;
        return (
          <TouchableOpacity key={o.key || 'all'} onPress={() => onChange(on && o.key ? '' : o.key)} activeOpacity={0.8} style={[s.pillBtn, on && { backgroundColor: C.primary }]}>
            <Text style={[s.pillBtnText, on && { color: C.white }]}>{label(o.label)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={s.search}>
      <Search size={16} color={C.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder ?? 'Search…'} placeholderTextColor="#9CA3AF" style={s.searchInput} />
      {value ? (
        <TouchableOpacity onPress={() => onChange('')} hitSlop={8}><X size={16} color={C.muted} /></TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Summary tile: icon chip + uppercase label + big number. Pass onPress to make it a filter. */
export function Stat({
  label: l,
  value,
  sub,
  icon: Icon,
  color = C.primary,
  onPress,
  active,
  width = '48%',
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: LucideIcon;
  color?: string;
  onPress?: () => void;
  active?: boolean;
  width?: ViewStyle['width'];
}) {
  const Body: any = onPress ? TouchableOpacity : View;
  return (
    <Body onPress={onPress} activeOpacity={0.85} style={[s.stat, { width }, active && { backgroundColor: `${color}14` }]}>
      <View style={[s.statIcon, { backgroundColor: `${color}1A`, borderColor: color }]}>
        <Icon size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.statLabel} numberOfLines={1}>{l}</Text>
        <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {sub ? <Text style={s.statSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </Body>
  );
}

export const StatGrid = ({ children }: { children: React.ReactNode }) => <View style={s.grid}>{children}</View>;

export function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={[s.card, { marginBottom: 12 }]}>
      <View style={s.secHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.secTitle}>{title}</Text>
          {sub ? <Text style={s.sub}>{sub}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ k, v, bold }: { k: string; v?: React.ReactNode; bold?: boolean }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvK}>{k}</Text>
      {typeof v === 'string' || typeof v === 'number' || v == null ? (
        <Text style={[s.kvV, bold && { fontWeight: '800' }]}>{v === '' || v == null ? '—' : v}</Text>
      ) : (
        <View style={{ flexShrink: 1 }}>{v}</View>
      )}
    </View>
  );
}

export function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <View style={s.empty}>
      <Icon size={36} color="#D1D5DB" />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export function ScrollBody({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <ScrollView
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderBottomWidth: 2, borderBottomColor: C.black },
  back: { width: 36, height: 36, borderWidth: 2, borderRadius: 8, borderColor: C.black, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.black },
  sub: { fontSize: 12, fontWeight: '500', color: C.muted, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hbtn: { flexDirection: 'row', alignItems: 'center', gap: 5, ...chunky, paddingHorizontal: 12, paddingVertical: 7 },
  hbtnText: { color: C.white, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  card: { ...chunky, backgroundColor: C.white, padding: 14, marginBottom: 12 },
  btn: { ...chunky, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  pill: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  pillsBar: { flexGrow: 0, flexShrink: 0, backgroundColor: C.white, borderBottomWidth: 2, borderBottomColor: C.black },
  pillBtn: { paddingHorizontal: 14, paddingVertical: 7, borderWidth: 2, borderColor: C.black, borderRadius: 8, backgroundColor: C.white },
  pillBtnText: { fontSize: 12, fontWeight: '700', color: C.black, textTransform: 'uppercase', letterSpacing: 0.4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 4, ...chunky, borderRightWidth: 3, borderBottomWidth: 3, paddingHorizontal: 10, backgroundColor: C.white },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14, fontWeight: '500', color: C.black },
  stat: { ...chunky, backgroundColor: C.white, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  statIcon: { width: 36, height: 36, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 10, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 20, fontWeight: '800', color: C.black },
  statSub: { fontSize: 10, color: C.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  secHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  secTitle: { fontSize: 15, fontWeight: '800', color: C.black },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.line },
  kvK: { fontSize: 12, color: C.muted, fontWeight: '600' },
  kvV: { fontSize: 13, color: C.black, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  empty: { alignItems: 'center', gap: 10, padding: 36 },
  emptyText: { fontSize: 14, fontWeight: '700', color: C.black, textAlign: 'center' },
});

/** List row card: full-width with side margins, tappable. */
export function Item({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Card onPress={onPress} style={{ marginHorizontal: 12, marginTop: 12, marginBottom: 0, ...style }}>
      {children}
    </Card>
  );
}

/** Tiny round-cornered action chip used on list rows (Edit / Delete / Receipt …). */
export function Chip({ text, icon: Icon, onPress, color = C.black }: { text: string; icon?: LucideIcon; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderColor: color, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.white }}>
      {Icon ? <Icon size={13} color={color} /> : null}
      <Text style={{ fontSize: 11, fontWeight: '800', color, textTransform: 'uppercase' }}>{text}</Text>
    </TouchableOpacity>
  );
}
