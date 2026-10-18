import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, FileCheck2 } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';
import { nbShadow } from '../theme';

// Mock data — no insurance/claims backend model exists yet.
const POLICY = {
  provider: 'Star Health Insurance',
  policyNumber: 'SHI-2026-889231',
  coverage: '₹5,00,000',
  expiry: '31 Mar 2027',
};

const CLAIMS = [
  {
    id: '1',
    title: 'Lab Test Reimbursement',
    amount: '₹1,200',
    status: 'approved',
    date: '10 Jun 2026',
  },
  {
    id: '2',
    title: 'OPD Consultation',
    amount: '₹800',
    status: 'pending',
    date: '02 Jul 2026',
  },
  {
    id: '3',
    title: 'Pharmacy Bill',
    amount: '₹450',
    status: 'rejected',
    date: '18 May 2026',
  },
];

const statusTone: Record<string, any> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
};

export default function InsuranceScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Insurance" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View
          style={[
            styles.policyCard,
            { borderColor: colors.border, backgroundColor: colors.primary },
            nbShadow,
          ]}
        >
          <View style={styles.policyHeader}>
            <ShieldCheck size={22} color={colors.white} />
            <Text style={styles.policyProvider}>{POLICY.provider}</Text>
          </View>
          <Text style={styles.policyNumber}>{POLICY.policyNumber}</Text>
          <View style={styles.policyRow}>
            <View>
              <Text style={styles.policyLabel}>Coverage</Text>
              <Text style={styles.policyValue}>{POLICY.coverage}</Text>
            </View>
            <View>
              <Text style={styles.policyLabel}>Expires</Text>
              <Text style={styles.policyValue}>{POLICY.expiry}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
          CLAIMS HISTORY
        </Text>
        {CLAIMS.map(c => (
          <Card key={c.id} style={styles.claimCard}>
            <View
              style={[
                styles.claimIcon,
                { borderColor: colors.border, backgroundColor: colors.muted },
              ]}
            >
              <FileCheck2 size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.claimTitle, { color: colors.text }]}>
                {c.title}
              </Text>
              <Text style={[styles.claimDate, { color: colors.mutedText }]}>
                {c.date}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={[styles.claimAmount, { color: colors.text }]}>
                {c.amount}
              </Text>
              <Badge label={c.status} tone={statusTone[c.status]} />
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16 },
  policyCard: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 18,
    marginBottom: 22,
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  policyProvider: { fontSize: 16, fontWeight: '900', color: '#fff' },
  policyNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    opacity: 0.9,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  policyRow: { flexDirection: 'row', gap: 32 },
  policyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    opacity: 0.8,
    textTransform: 'uppercase',
  },
  policyValue: { fontSize: 16, fontWeight: '900', color: '#fff', marginTop: 3 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  claimCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  claimIcon: {
    width: 38,
    height: 38,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimTitle: { fontSize: 13, fontWeight: '800' },
  claimDate: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  claimAmount: { fontSize: 14, fontWeight: '900' },
});
