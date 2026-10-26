// Analytics, Reports, Billing (plan) and Settings.
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BarChart3,
  CalendarCheck,
  FileBarChart,
  IndianRupee,
  LogOut,
  Receipt,
  Share2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { AreaChart, Donut, HBars } from '../charts';
import { fail, useLoad } from '../hooks';
import ListPage from '../ListPage';
import {
  Btn,
  C,
  Card,
  Empty,
  fmtDate,
  Item,
  label,
  money,
  Pill,
  Pills,
  Row,
  Screen,
  ScrollBody,
  Section,
  Stat,
  StatGrid,
  ymd,
} from '../ui';

const DAY = 86_400_000;
const STATUS_COLOR: Record<string, string> = {
  scheduled: C.primary,
  completed: C.success,
  cancelled: C.danger,
  no_show: C.secondary,
};

/* -------------------------------- Analytics ------------------------------- */
export function AnalyticsScreen({ navigation }: any) {
  const [range, setRange] = useState('30');
  const to = ymd(new Date());
  const from = ymd(new Date(Date.now() - (Number(range) - 1) * DAY));
  const {
    data: a,
    loading,
    refreshing,
    refresh,
    error,
  } = useLoad(() => api.analytics(from, to), [from, to]);
  const status = Object.entries(a?.appointments.byStatus ?? {}).map(
    ([k, v]) => ({
      label: label(k),
      value: v as number,
      color: STATUS_COLOR[k],
    }),
  );
  const modes = Object.entries(a?.revenue.receivedByMode ?? {}).map(
    ([k, v]) => ({ label: label(k), value: Math.round(v as number) }),
  );
  return (
    <Screen
      title="Analytics"
      onBack={navigation.goBack}
      loading={loading && !a}
    >
      <Pills
        options={[
          { key: '7', label: '7 days' },
          { key: '30', label: '30 days' },
          { key: '90', label: '90 days' },
        ]}
        value={range}
        onChange={k => setRange(k || '30')}
      />
      <ScrollBody refreshing={refreshing} onRefresh={refresh}>
        {error ? (
          <Text style={{ color: C.danger, fontWeight: '700' }}>{error}</Text>
        ) : null}
        {a && (
          <>
            <StatGrid>
              <Stat
                label="Appointments"
                value={a.appointments.total}
                sub={`${a.appointments.noShowRate}% no-show`}
                icon={CalendarCheck}
                color={C.primary}
              />
              <Stat
                label="New patients"
                value={a.newPatients}
                icon={UserPlus}
                color={C.success}
              />
              <Stat
                label="Billed"
                value={money(a.revenue.billed)}
                sub={`${a.revenue.invoices} invoices`}
                icon={Receipt}
                color={C.secondary}
              />
              <Stat
                label="Outstanding"
                value={money(a.revenue.outstanding)}
                icon={Wallet}
                color={C.danger}
              />
            </StatGrid>
            <Section title="Appointments per day">
              {a.appointments.byDay.length ? (
                <AreaChart
                  data={a.appointments.byDay.map((d: any) => ({
                    label: d.date.slice(8),
                    value: d.count,
                  }))}
                />
              ) : (
                <Empty
                  icon={CalendarCheck}
                  text="No appointments in this range"
                />
              )}
            </Section>
            <Section title="Status">
              {status.length ? (
                <Donut data={status} />
              ) : (
                <Empty icon={CalendarCheck} text="No data" />
              )}
            </Section>
            <Section title="Cash received by method">
              {modes.length ? (
                <HBars data={modes} format={money} />
              ) : (
                <Empty icon={IndianRupee} text="No payments in this range" />
              )}
            </Section>
            <Section title="Top doctors" sub="Completed visits">
              {a.topDoctors.length ? (
                <HBars
                  data={a.topDoctors.map((d: any) => ({
                    label: d.name,
                    value: d.completed,
                  }))}
                />
              ) : (
                <Empty icon={BarChart3} text="No completed visits" />
              )}
            </Section>
            <Section title="Lab orders">
              {Object.keys(a.lab).length ? (
                <HBars
                  data={Object.entries(a.lab).map(([k, v]) => ({
                    label: label(k),
                    value: v as number,
                  }))}
                />
              ) : (
                <Empty icon={BarChart3} text="No lab orders" />
              )}
            </Section>
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}

/* --------------------------------- Reports -------------------------------- */
function ReportModal({
  report,
  onClose,
}: {
  report: any | null;
  onClose: () => void;
}) {
  const [range, setRange] = useState('30');
  const from = ymd(new Date(Date.now() - (Number(range) - 1) * DAY));
  const to = ymd(new Date());
  const res = useLoad(
    () =>
      report
        ? api.reports.run(report.id, report.dateRange ? { from, to } : {})
        : Promise.resolve(null),
    [report?.id, range],
  );
  if (!report) return null;
  const d = res.data;
  const csv = () =>
    d
      ? [
          d.columns.map((c: any) => c.label).join(','),
          ...d.rows.map((r: any) =>
            d.columns
              .map(
                (c: any) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`,
              )
              .join(','),
          ),
        ].join('\n')
      : '';
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
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
            numberOfLines={1}
          >
            {report.title}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={C.white} />
          </TouchableOpacity>
        </View>
        {report.dateRange && (
          <Pills
            options={[
              { key: '7', label: '7 days' },
              { key: '30', label: '30 days' },
              { key: '90', label: '90 days' },
            ]}
            value={range}
            onChange={k => setRange(k || '30')}
          />
        )}
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
          {res.loading ? (
            <Text style={{ color: C.muted }}>Running report…</Text>
          ) : res.error ? (
            <Text style={{ color: C.danger, fontWeight: '700' }}>
              {res.error}
            </Text>
          ) : !d?.rows.length ? (
            <Empty icon={FileBarChart} text="No rows for this range" />
          ) : (
            <>
              {d.truncated && (
                <Text
                  style={{
                    color: C.secondary,
                    fontWeight: '700',
                    marginBottom: 8,
                  }}
                >
                  Showing the first rows only. Narrow the date range for the
                  rest.
                </Text>
              )}
              {d.rows.slice(0, 100).map((r: any, i: number) => (
                <Card key={i} style={{ padding: 10 }}>
                  {d.columns.map((c: any) => (
                    <Row key={c.key} k={c.label} v={String(r[c.key] ?? '—')} />
                  ))}
                </Card>
              ))}
              {d.totals && (
                <Card style={{ backgroundColor: C.soft }}>
                  <Text style={{ fontWeight: '800', marginBottom: 6 }}>
                    TOTALS
                  </Text>
                  {Object.entries(d.totals).map(([k, v]) => (
                    <Row key={k} k={label(k)} v={String(v)} bold />
                  ))}
                </Card>
              )}
            </>
          )}
        </ScrollView>
        {d?.rows.length ? (
          <View
            style={{
              padding: 12,
              borderTopWidth: 2,
              borderTopColor: C.black,
              backgroundColor: C.soft,
            }}
          >
            <Btn
              text="Share as CSV text"
              kind="secondary"
              icon={Share2}
              onPress={() =>
                Share.share({ title: report.title, message: csv() })
              }
            />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

export function ReportsScreen({ navigation }: any) {
  const [open, setOpen] = useState<any | null>(null);
  return (
    <>
      <ListPage<any>
        title="Reports"
        onBack={navigation.goBack}
        load={() =>
          api.reports.list().then(l => l.map(r => ({ ...r, _id: r.id })))
        }
        searchOn={r => [r.title, r.category, r.desc]}
        searchPlaceholder="Search reports…"
        emptyIcon={FileBarChart}
        emptyText="No reports available for your role."
        renderItem={r => (
          <Item onPress={() => setOpen(r)}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.black }}>
              {r.title}
            </Text>
            {r.category ? (
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: C.primary,
                  textTransform: 'uppercase',
                }}
              >
                {r.category}
              </Text>
            ) : null}
            {r.desc ? (
              <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {r.desc}
              </Text>
            ) : null}
          </Item>
        )}
      />
      <ReportModal report={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---------------------------------- Billing ------------------------------- */
export function BillingScreen({ navigation }: any) {
  const me = useLoad(() => api.billing.me(), []);
  const plans = useLoad(() => api.billing.plans().catch(() => undefined), []);
  const t = me.data?.tenant;
  const sub = me.data?.subscription;
  return (
    <Screen
      title="Billing & Plan"
      onBack={navigation.goBack}
      loading={me.loading && !me.data}
    >
      <ScrollBody refreshing={me.refreshing} onRefresh={me.refresh}>
        <Card>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: '800',
                color: C.black,
                textTransform: 'capitalize',
              }}
            >
              {t?.plan ?? '—'} plan
            </Text>
            <Pill text={t?.status} />
          </View>
          <Row
            k="Renews / expires"
            v={t?.planExpiresAt ? fmtDate(t.planExpiresAt) : '—'}
          />
          <Row
            k="Doctors"
            v={`${me.data?.usage?.doctors ?? 0}${t?.limits?.doctorLimit ? ` / ${t.limits.doctorLimit}` : ''}`}
          />
          <Row k="Staff limit" v={String(t?.limits?.userLimit ?? '—')} />
          {sub && <Row k="Billing cycle" v={label(sub.billingCycle)} />}
        </Card>
        {plans.data?.plans && (
          <Section title="Available plans">
            {Object.entries(plans.data.plans).map(([k, p]: any) => (
              <View
                key={k}
                style={{
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: C.line,
                }}
              >
                <Text style={{ fontWeight: '800', color: C.black }}>
                  {p.name ?? k}
                </Text>
                <Text style={{ fontSize: 12, color: C.muted }}>
                  {p.priceMonthly != null
                    ? `${money(p.priceMonthly)}/month`
                    : ''}
                  {p.tagline ? ` · ${p.tagline}` : ''}
                </Text>
              </View>
            ))}
          </Section>
        )}
        <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>
          To change or renew your plan, sign in to NestDoc on the web.
        </Text>
      </ScrollBody>
    </Screen>
  );
}

/* --------------------------------- Settings ------------------------------- */
export function SettingsScreen({ navigation }: any) {
  const { user, tenant, logout } = useAuth();
  return (
    <Screen title="Settings" onBack={navigation.goBack}>
      <ScrollBody>
        <Section title="My account">
          <Row k="Name" v={user?.name} bold />
          <Row k="Email" v={user?.email} />
          <Row k="Role" v={label(user?.role)} />
        </Section>
        <Section title="Organisation">
          <Row k="Name" v={tenant?.name} bold />
          <Row k="Type" v={label(tenant?.orgType)} />
          <Row k="Phone" v={tenant?.contact?.phone} />
          <Row k="Email" v={tenant?.contact?.email} />
          <Row
            k="Address"
            v={[
              tenant?.contact?.address,
              tenant?.contact?.city,
              tenant?.contact?.state,
            ]
              .filter(Boolean)
              .join(', ')}
          />
          <Row k="GSTIN" v={tenant?.gstDetails?.gstin} />
          <Row k="Plan" v={label(tenant?.plan)} />
        </Section>
        <Btn
          text="Sign out"
          kind="danger"
          icon={LogOut}
          onPress={() =>
            Alert.alert('Sign out', 'Sign out of NestDoc?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: () => logout().catch(fail),
              },
            ])
          }
        />
      </ScrollBody>
    </Screen>
  );
}
