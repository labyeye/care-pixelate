import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  FlaskConical,
  IndianRupee,
  PlayCircle,
  Receipt,
  Stethoscope,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api';
import { AreaChart, BarChart, Donut, HBars } from '../charts';
import { useLoad } from '../hooks';
import {
  C,
  Card,
  Empty,
  fmtTime,
  money,
  personName,
  Pill,
  Screen,
  ScrollBody,
  Section,
  Stat,
  StatGrid,
  ymd,
  label,
} from '../ui';

const DAY = 86_400_000;
const STATUS_COLOR: Record<string, string> = {
  scheduled: C.primary,
  completed: C.success,
  cancelled: C.danger,
  no_show: C.secondary,
};
const MODE_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank',
  insurance: 'Insurance',
  other: 'Other',
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** One row in a "today / recent" list. */
function ListRow({
  top,
  mid,
  sub,
  right,
  onPress,
}: {
  top: string;
  mid?: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const Body: any = onPress ? TouchableOpacity : View;
  return (
    <Body
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '800', color: C.black }}
          numberOfLines={1}
        >
          {top}
        </Text>
        {mid ? (
          <Text
            style={{ fontSize: 12, color: C.black, fontWeight: '500' }}
            numberOfLines={1}
          >
            {mid}
          </Text>
        ) : null}
        {sub ? (
          <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </Body>
  );
}

function ClinicDashboard({ navigation }: any) {
  const { user, tenant } = useAuth();
  const to = ymd(new Date());
  const from = ymd(new Date(Date.now() - 29 * DAY));

  const sm = useLoad(() => api.summary(), []);
  const an = useLoad(
    () => api.analytics(from, to).catch(() => undefined),
    [from, to],
  );
  const appts = useLoad(() => api.appointments.list({ limit: 100 }), []);
  const labs = useLoad(() => api.lab.list({ limit: 6 }).catch(() => []), []);
  const pts = useLoad(
    () => api.patients.list({ limit: 6 }).catch(() => []),
    [],
  );

  const d = sm.data;
  const a = an.data;
  const refreshing = sm.refreshing || an.refreshing;
  const refresh = () => {
    sm.refresh();
    an.refresh();
    appts.refresh();
    labs.refresh();
    pts.refresh();
  };

  const today = (appts.data ?? [])
    .filter(
      (x: any) =>
        new Date(x.scheduledAt).toDateString() === new Date().toDateString(),
    )
    .sort(
      (x: any, y: any) => +new Date(x.scheduledAt) - +new Date(y.scheduledAt),
    );

  const alerts = [
    d &&
      d.lab.ordered > 0 && {
        to: 'LabOrders',
        icon: FlaskConical,
        text: `${d.lab.ordered} lab sample${d.lab.ordered > 1 ? 's' : ''} awaiting`,
      },
    d &&
      d.lab.abnormal > 0 && {
        to: 'LabOrders',
        icon: TriangleAlert,
        text: `${d.lab.abnormal} abnormal result${d.lab.abnormal > 1 ? 's' : ''}`,
      },
    d?.invoices &&
      d.invoices.unpaid + d.invoices.partial > 0 && {
        to: 'Invoices',
        icon: Receipt,
        text: `${d.invoices.unpaid + d.invoices.partial} invoices with dues`,
      },
    d &&
      d.doctors.pendingVerification > 0 && {
        to: 'Doctors',
        icon: Stethoscope,
        text: `${d.doctors.pendingVerification} doctor${d.doctors.pendingVerification > 1 ? 's' : ''} pending verification`,
      },
  ].filter(Boolean) as { to: string; icon: any; text: string }[];

  const trend = (a?.appointments.byDay ?? []).map((x: any) => ({
    label: x.date.slice(8),
    value: x.count,
  }));
  const status = Object.entries(a?.appointments.byStatus ?? {}).map(
    ([k, v]) => ({
      label: label(k),
      value: v as number,
      color: STATUS_COLOR[k],
    }),
  );
  const modes = Object.entries(a?.revenue.receivedByMode ?? {}).map(
    ([k, v]) => ({ label: MODE_LABEL[k] ?? k, value: Math.round(v as number) }),
  );
  const topDocs = (a?.topDoctors ?? []).map((x: any) => ({
    label: x.name,
    value: x.completed,
  }));
  const labData = d
    ? [
        { label: 'Await', value: d.lab.ordered, color: C.secondary },
        { label: 'Collected', value: d.lab.collected, color: C.primary },
        { label: 'Resulted', value: d.lab.resulted, color: C.success },
        { label: 'Abnormal', value: d.lab.abnormal, color: C.danger },
      ]
    : [];

  return (
    <Screen
      title="Dashboard"
      subtitle={tenant?.name}
      loading={sm.loading && !d}
    >
      <ScrollBody refreshing={refreshing} onRefresh={refresh}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: C.black }}>
          {greeting()}, {user?.name?.split(' ')[0]}
        </Text>
        <Text style={{ color: C.muted, marginBottom: 12 }}>
          Here's what's happening today.
        </Text>

        {alerts.length > 0 && (
          <View
            style={{
              borderWidth: 2,
              borderColor: C.secondary,
              backgroundColor: '#FFF7ED',
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              gap: 6,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                color: C.secondary,
                textTransform: 'uppercase',
              }}
            >
              Needs attention
            </Text>
            {alerts.map(x => (
              <TouchableOpacity
                key={x.text}
                onPress={() => navigation.navigate(x.to)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <x.icon size={14} color={C.black} />
                <Text
                  style={{ fontSize: 13, fontWeight: '700', color: C.black }}
                >
                  {x.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <StatGrid>
          <Stat
            label="Patients"
            value={d?.patients.total ?? '…'}
            sub={`${d?.patients.newThisMonth ?? 0} new this month`}
            icon={Users}
            color={C.primary}
            onPress={() => navigation.navigate('Patients')}
          />
          <Stat
            label="Doctors"
            value={d?.doctors.total ?? '…'}
            sub={`${d?.doctors.active ?? 0} active`}
            icon={Stethoscope}
            color={C.secondary}
            onPress={() => navigation.navigate('Doctors')}
          />
          <Stat
            label="Today"
            value={d?.appointments.today ?? '…'}
            sub={`${d?.appointments.upcoming ?? 0} upcoming`}
            icon={CalendarCheck}
            color={C.success}
            onPress={() => navigation.navigate('Appointments')}
          />
          <Stat
            label="Lab pending"
            value={d ? d.lab.ordered + d.lab.collected : '…'}
            sub={`${d?.lab.abnormal ?? 0} abnormal`}
            icon={FlaskConical}
            color={C.purple}
            onPress={() => navigation.navigate('LabOrders')}
          />
          {d?.invoices && (
            <>
              <Stat
                label="Billed"
                value={money(d.invoices.billed)}
                sub={`${d.invoices.count} invoices`}
                icon={Receipt}
                color={C.primary}
                onPress={() => navigation.navigate('Invoices')}
              />
              <Stat
                label="Collected"
                value={money(d.invoices.collected)}
                sub={`${d.invoices.paid} paid`}
                icon={IndianRupee}
                color={C.success}
                onPress={() => navigation.navigate('Invoices')}
              />
              <Stat
                label="Outstanding"
                value={money(d.invoices.outstanding)}
                sub={`${d.invoices.unpaid + d.invoices.partial} with dues`}
                icon={Wallet}
                color={C.danger}
                onPress={() => navigation.navigate('Invoices')}
              />
            </>
          )}
          <Stat
            label="Completed"
            value={d?.appointments.completed ?? '…'}
            sub={`${d?.appointments.noShow ?? 0} no-shows`}
            icon={UserPlus}
            color={C.secondary}
          />
        </StatGrid>

        {a && (
          <>
            <Section
              title="Appointments trend"
              sub="Daily bookings — last 30 days"
            >
              {trend.length ? (
                <AreaChart data={trend} />
              ) : (
                <Empty
                  icon={CalendarCheck}
                  text="No appointments in this period"
                />
              )}
            </Section>
            <Section
              title="Appointment status"
              sub={`${a.appointments.total} in 30 days · ${a.appointments.noShowRate}% no-show`}
            >
              {status.length ? (
                <Donut data={status} />
              ) : (
                <Empty icon={CalendarCheck} text="No data yet" />
              )}
            </Section>
            {d?.invoices && (
              <Section title="Payments received" sub="By method — last 30 days">
                {modes.length ? (
                  <HBars data={modes} format={money} />
                ) : (
                  <Empty icon={IndianRupee} text="No payments in this period" />
                )}
              </Section>
            )}
            <Section title="Top doctors" sub="Completed visits — last 30 days">
              {topDocs.length ? (
                <HBars data={topDocs} />
              ) : (
                <Empty icon={Stethoscope} text="No completed visits yet" />
              )}
            </Section>
          </>
        )}

        <Section title="Lab pipeline" sub="Orders by stage">
          {labData.length ? <BarChart data={labData} /> : null}
        </Section>

        <Section
          title="Today's appointments"
          sub={`${today.length} scheduled`}
          right={
            <TouchableOpacity
              onPress={() => navigation.navigate('Appointments')}
            >
              <Text style={{ fontWeight: '800', color: C.primary }}>
                View all →
              </Text>
            </TouchableOpacity>
          }
        >
          {!today.length ? (
            <Empty icon={Clock} text="No appointments today" />
          ) : (
            today
              .slice(0, 6)
              .map((x: any) => (
                <ListRow
                  key={x._id}
                  top={personName(x.patientId) || '—'}
                  mid={personName(x.doctorId)}
                  sub={fmtTime(x.scheduledAt)}
                  right={<Pill text={x.status} />}
                />
              ))
          )}
        </Section>

        <Section
          title="Recent lab orders"
          right={
            <TouchableOpacity onPress={() => navigation.navigate('LabOrders')}>
              <Text style={{ fontWeight: '800', color: C.primary }}>
                View all →
              </Text>
            </TouchableOpacity>
          }
        >
          {!(labs.data ?? []).length ? (
            <Empty icon={FlaskConical} text="No lab orders yet" />
          ) : (
            (labs.data ?? [])
              .slice(0, 5)
              .map((o: any) => (
                <ListRow
                  key={o._id}
                  top={`${o.number} · ${personName(o.patientId)}`}
                  mid={o.tests.map((t: any) => t.name).join(', ')}
                  right={<Pill text={o.status} />}
                />
              ))
          )}
        </Section>

        <Section
          title="Recently registered patients"
          right={
            <TouchableOpacity onPress={() => navigation.navigate('Patients')}>
              <Text style={{ fontWeight: '800', color: C.primary }}>
                View all →
              </Text>
            </TouchableOpacity>
          }
        >
          {!(pts.data ?? []).length ? (
            <Empty icon={Users} text="No patients yet" />
          ) : (
            (pts.data ?? [])
              .slice(0, 5)
              .map((p: any) => (
                <ListRow
                  key={p._id}
                  top={p.name}
                  mid={`${p.patientId || ''} · ${p.gender || ''}`}
                  sub={p.contact?.phone}
                  right={<Pill text={p.patientStatus} />}
                />
              ))
          )}
        </Section>
      </ScrollBody>
    </Screen>
  );
}

function DoctorDashboard({ navigation }: any) {
  const { user } = useAuth();
  const docs = useLoad(() => api.doctors.list({ limit: 200 }), []);
  const me = (docs.data ?? []).find(
    (d: any) => d.userId && String(d.userId) === String(user?._id),
  );
  const from = ymd(new Date(Date.now() - 29 * DAY));
  const to = ymd(new Date(Date.now() + 7 * DAY));
  const ap = useLoad(
    () => (me ? api.appointments.range(from, to, me._id) : Promise.resolve([])),
    [me?._id],
  );
  const labs = useLoad(
    () =>
      me ? api.lab.list({ limit: 200 }).catch(() => []) : Promise.resolve([]),
    [me?._id],
  );

  const all = ap.data ?? [];
  const now = Date.now();
  const todayS = new Date().toDateString();
  const today = all
    .filter((x: any) => new Date(x.scheduledAt).toDateString() === todayS)
    .sort(
      (x: any, y: any) => +new Date(x.scheduledAt) - +new Date(y.scheduledAt),
    );
  const remaining = today.filter((x: any) => x.status === 'scheduled');
  const next =
    remaining.find((x: any) => +new Date(x.scheduledAt) >= now - 15 * 60_000) ??
    remaining[0];
  const upcoming = all.filter(
    (x: any) =>
      x.status === 'scheduled' &&
      new Date(x.scheduledAt).getTime() > now &&
      new Date(x.scheduledAt).toDateString() !== todayS,
  );
  const past = all.filter((x: any) => new Date(x.scheduledAt).getTime() <= now);
  const last14 = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY);
    return {
      label: String(d.getDate()),
      value: all.filter(
        (x: any) => new Date(x.scheduledAt).toDateString() === d.toDateString(),
      ).length,
    };
  });
  const status = Object.entries(
    past.reduce(
      (m: Record<string, number>, x: any) => (
        (m[x.status] = (m[x.status] ?? 0) + 1),
        m
      ),
      {},
    ),
  ).map(([k, v]) => ({
    label: label(k),
    value: v as number,
    color: STATUS_COLOR[k],
  }));
  const myLabs = (labs.data ?? []).filter(
    (o: any) =>
      (typeof o.doctorId === 'string' ? o.doctorId : o.doctorId?._id) ===
      me?._id,
  );

  return (
    <Screen title="Today's Patients" loading={docs.loading}>
      <ScrollBody
        refreshing={ap.refreshing}
        onRefresh={() => {
          docs.refresh();
          ap.refresh();
          labs.refresh();
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '800', color: C.black }}>
          {greeting()}, Dr.{' '}
          {user?.name?.replace(/^dr\.?\s*/i, '').split(' ')[0]}
        </Text>
        <Text style={{ color: C.muted, marginBottom: 12 }}>
          {me
            ? `${today.length} appointments today · ${remaining.length} still to see.`
            : 'Your schedule at a glance.'}
        </Text>

        {!me ? (
          <Card style={{ borderColor: C.secondary }}>
            <Text style={{ fontWeight: '800', color: C.black }}>
              Your login isn't linked to a doctor profile yet.
            </Text>
            <Text style={{ color: C.muted, marginTop: 4 }}>
              Ask your clinic admin to link this account to your doctor profile
              so your own appointments appear here.
            </Text>
          </Card>
        ) : (
          <>
            <View
              style={{
                backgroundColor: C.primary,
                borderWidth: 2,
                borderColor: C.black,
                borderRadius: 8,
                padding: 14,
                marginBottom: 12,
              }}
            >
              {next ? (
                <>
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: 11,
                      fontWeight: '800',
                      textTransform: 'uppercase',
                    }}
                  >
                    Next patient
                  </Text>
                  <Text
                    style={{ color: C.white, fontSize: 20, fontWeight: '800' }}
                  >
                    {personName(next.patientId)}
                  </Text>
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.85)',
                      marginBottom: 10,
                    }}
                  >
                    {fmtTime(next.scheduledAt)}
                    {next.reason ? ` · ${next.reason}` : ''}
                    {next.type === 'video' ? ' · Video' : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('Consultation', {
                        appointmentId: next._id,
                      })
                    }
                    style={{
                      backgroundColor: C.white,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: C.black,
                      paddingVertical: 10,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <PlayCircle size={18} color={C.primary} />
                    <Text
                      style={{
                        fontWeight: '800',
                        color: C.primary,
                        textTransform: 'uppercase',
                      }}
                    >
                      Start consultation
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <CheckCircle2 size={20} color={C.white} />
                  <Text style={{ color: C.white, fontWeight: '800' }}>
                    No more patients scheduled today.
                  </Text>
                </View>
              )}
            </View>

            <StatGrid>
              <Stat
                label="Today"
                value={today.length}
                sub={`${remaining.length} remaining`}
                icon={CalendarCheck}
                color={C.primary}
              />
              <Stat
                label="Seen today"
                value={
                  today.filter((x: any) => x.status === 'completed').length
                }
                icon={CheckCircle2}
                color={C.success}
              />
              <Stat
                label="Upcoming"
                value={upcoming.length}
                sub="next 7 days"
                icon={Clock}
                color={C.secondary}
              />
              <Stat
                label="Completed"
                value={past.filter((x: any) => x.status === 'completed').length}
                sub="last 30 days"
                icon={Users}
                color={C.purple}
              />
            </StatGrid>

            <Section title="My appointments" sub="Per day — last 14 days">
              <BarChart data={last14} />
            </Section>
            <Section title="Outcome" sub="Last 30 days">
              {status.length ? (
                <Donut data={status} />
              ) : (
                <Empty icon={Users} text="No visits yet" />
              )}
            </Section>

            <Section title="Today's schedule">
              {!today.length ? (
                <Empty icon={Clock} text="Nothing scheduled today" />
              ) : (
                today.map((x: any) => (
                  <ListRow
                    key={x._id}
                    top={personName(x.patientId)}
                    mid={x.reason || '—'}
                    sub={fmtTime(x.scheduledAt)}
                    onPress={() =>
                      navigation.navigate('Consultation', {
                        appointmentId: x._id,
                      })
                    }
                    right={<Pill text={x.status} />}
                  />
                ))
              )}
            </Section>
            <Section title="My lab orders" sub={`${myLabs.length} total`}>
              {!myLabs.length ? (
                <Empty icon={FlaskConical} text="No lab orders from you yet" />
              ) : (
                myLabs
                  .slice(0, 5)
                  .map((o: any) => (
                    <ListRow
                      key={o._id}
                      top={`${o.number} · ${personName(o.patientId)}`}
                      mid={o.tests.map((t: any) => t.name).join(', ')}
                      right={<Pill text={o.status} />}
                    />
                  ))
              )}
            </Section>
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}

export default function DashboardScreen(props: any) {
  const { user } = useAuth();
  return user?.role === 'doctor' ? (
    <DoctorDashboard {...props} />
  ) : (
    <ClinicDashboard {...props} />
  );
}
