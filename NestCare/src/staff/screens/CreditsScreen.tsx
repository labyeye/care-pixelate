import React, { useCallback, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Coins, ExternalLink } from 'lucide-react-native';
import { api } from '../api';
import { Btn, C, Card, Empty, Screen } from '../ui';

// Top-ups are web-only: the app does not sell anything, it just shows the balance.
// TODO: confirm this is the clinic web app's real address.
const WEB_CREDITS_URL = 'https://nestdoc.pixelatenest.com/credits';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'debit', label: 'Charged' },
  { key: 'skipped', label: 'Not sent' },
  { key: 'refund', label: 'Refunds' },
  { key: 'topup', label: 'Top-ups' },
];

const EVENT_LABEL: Record<string, string> = {
  appointment_confirmed: 'Appointment confirmed',
  appointment_reminder: 'Appointment reminder',
  appointment_cancelled: 'Appointment cancelled',
  followup_reminder: 'Follow-up reminder',
  payment_receipt: 'Payment receipt',
  invoice_due: 'Invoice due',
  prescription_ready: 'Prescription ready',
  lab_report_ready: 'Lab report ready',
  video_consult_link: 'Video consult link',
  birthday_wish: 'Birthday wish',
};

const REASON: Record<string, string> = {
  low_balance: 'Not sent: no credits',
  daily_cap: 'Not sent: daily limit reached',
  send_failed: 'Refunded: could not send',
  delivery_failed: 'Refunded: not delivered',
};

const fmt = (n = 0) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function CreditsScreen({ navigation }: any) {
  const [credits, setCredits] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: number, f: string) => {
    try {
      const [bal, led] = await Promise.all([
        p === 1 ? api.credits.balance() : Promise.resolve(null),
        api.credits.ledger(p, f),
      ]);
      if (bal) setCredits(bal);
      setRows(prev => (p === 1 ? led.data : [...prev, ...led.data]));
      setTotal(led.total ?? 0);
      setPage(p);
    } catch {
      // keep what is on screen
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(1, filter);
    }, [load, filter]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1, filter);
    setRefreshing(false);
  };

  return (
    <Screen
      title="WhatsApp Credits"
      onBack={() => navigation.goBack()}
      loading={loading && !credits}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
      >
        {credits && !credits.metered ? (
          <Card>
            <Text style={st.bold}>Credits are not enabled</Text>
            <Text style={st.muted}>
              WhatsApp messages to patients are included in your plan.
            </Text>
          </Card>
        ) : (
          <>
            <Card style={credits?.zero ? { backgroundColor: '#FEF2F2' } : undefined}>
              <Text style={st.label}>AVAILABLE CREDITS</Text>
              <Text style={[st.big, credits?.zero && { color: C.danger }]}>
                {fmt(credits?.total)}
              </Text>
              {!!credits?.bonus && (
                <Text style={st.bonus}>
                  includes {fmt(credits.bonus)} bonus
                  {credits.bonusExpiresAt
                    ? ` · till ${new Date(credits.bonusExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                    : ''}
                </Text>
              )}
              {credits?.zero ? (
                <Text style={[st.warn, { color: C.danger }]}>
                  Patient WhatsApp messages are paused. Login OTPs still work.
                </Text>
              ) : credits?.low ? (
                <Text style={[st.warn, { color: C.secondary }]}>
                  Running low. Top up so reminders don't stop.
                </Text>
              ) : null}
              <Text style={st.muted}>
                {credits?.rates?.message ?? 0.2} credit per message,{' '}
                {credits?.rates?.birthday ?? 1} per birthday wish. OTPs are free.
              </Text>
              <View style={{ marginTop: 10 }}>
                <Btn
                  text="Add credits on web"
                  icon={ExternalLink}
                  onPress={() => Linking.openURL(WEB_CREDITS_URL)}
                />
              </View>
            </Card>

            <Text style={st.section}>Usage</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {FILTERS.map(f => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[st.chip, filter === f.key && { backgroundColor: C.black }]}
                >
                  <Text
                    style={[st.chipText, filter === f.key && { color: C.white }]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {rows.length === 0 ? (
              <Empty icon={Coins} text="Nothing here yet" />
            ) : (
              <View style={st.list}>
                {rows.map(r => (
                  <View key={r._id} style={st.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.rowTitle}>
                        {r.type === 'topup'
                          ? 'Top-up'
                          : r.type === 'bonus'
                            ? 'Bonus credits'
                            : EVENT_LABEL[r.event] || r.event || r.type}
                      </Text>
                      <Text style={st.rowSub}>
                        {new Date(r.createdAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {r.phone ? ` · ${r.phone}` : ''}
                      </Text>
                      {!!(REASON[r.note] || (r.type !== 'debit' && r.note)) && (
                        <Text style={st.rowSub}>{REASON[r.note] || r.note}</Text>
                      )}
                    </View>
                    <Text
                      style={[
                        st.amount,
                        r.credits > 0 && { color: C.success },
                        r.credits === 0 && { color: '#94a3b8' },
                      ]}
                    >
                      {r.credits > 0 ? '+' : ''}
                      {fmt(r.credits)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {rows.length < total && (
              <Btn
                text="Load more"
                kind="secondary"
                onPress={() => load(page + 1, filter)}
              />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '500', color: '#64748b', letterSpacing: 1 },
  big: { fontSize: 44, fontWeight: '500', color: C.black },
  bold: { fontSize: 15, fontWeight: '500', color: C.black },
  muted: { fontSize: 12, color: '#475569', marginTop: 6 },
  warn: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  bonus: { fontSize: 12, fontWeight: '500', color: C.success, marginTop: 4 },
  section: { fontSize: 16, fontWeight: '500', color: C.black },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: C.black,
    backgroundColor: C.white,
  },
  chipText: { fontSize: 12, fontWeight: '500', color: C.black },
  list: { borderWidth: 2, borderColor: C.black, backgroundColor: C.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  rowTitle: { fontSize: 13, fontWeight: '500', color: C.black },
  rowSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '500', color: C.black },
});
