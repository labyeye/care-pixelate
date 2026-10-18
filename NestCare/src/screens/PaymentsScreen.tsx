import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Receipt } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { meAPI } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';

const statusTone: Record<string, any> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'warning',
};
const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

// Read-only: the clinic records payments at the desk; patients see invoices, balance and receipts.
export default function PaymentsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    meAPI
      .invoices()
      .then(r => setInvoices(r.data || []))
      .catch((e: any) => setError(e.message || 'Could not load invoices'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Payments" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={item => item._id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ListEmptyComponent={
            <Text
              style={{
                color: error ? colors.destructive : colors.mutedText,
                fontWeight: '600',
              }}
            >
              {error || 'No invoices yet.'}
            </Text>
          }
          renderItem={({ item }) => {
            const due = Math.round((item.total - item.paid) * 100) / 100;
            return (
              <Card style={styles.card}>
                <View
                  style={[
                    styles.icon,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.muted,
                    },
                  ]}
                >
                  <Receipt size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.title, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {item.items?.[0]?.description || item.number}
                    {item.items?.length > 1 ? ` +${item.items.length - 1}` : ''}
                  </Text>
                  <Text style={[styles.date, { color: colors.mutedText }]}>
                    {item.number} ·{' '}
                    {new Date(item.createdAt).toLocaleDateString('en-IN')}
                  </Text>
                  {due > 0 && (
                    <Text style={[styles.date, { color: colors.destructive }]}>
                      Due {inr(due)}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[styles.amount, { color: colors.text }]}>
                    {inr(item.total)}
                  </Text>
                  <Badge label={item.status} tone={statusTone[item.status]} />
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  icon: {
    width: 38,
    height: 38,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '800' },
  date: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '900' },
});
