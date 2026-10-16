import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlaskConical } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { meAPI } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import Badge from '../components/Badge';

const STATUS_TONE: Record<string, any> = { resulted: 'success', collected: 'primary', ordered: 'warning' };

export default function LabResultsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    meAPI
      .labOrders()
      .then(r => setOrders(r.data || []))
      .catch((e: any) => setError(e.message || 'Could not load lab results'))
      .finally(() => setLoading(false));
  }, []);

  const flagColor = (f: string) => (f === 'high' ? colors.destructive : f === 'low' ? colors.warning : colors.mutedText);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Lab Results" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item._id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ListEmptyComponent={
            <Text style={{ color: error ? colors.destructive : colors.mutedText, fontWeight: '600' }}>
              {error || 'No lab orders yet.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.head}>
                <View style={[styles.icon, { borderColor: colors.border, backgroundColor: colors.teal }]}>
                  <FlaskConical size={18} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.number}</Text>
                  <Text style={[styles.meta, { color: colors.mutedText }]}>
                    {item.doctorId?.name ? `${item.doctorId.name} · ` : ''}
                    {new Date(item.createdAt).toLocaleDateString('en-IN')}
                  </Text>
                </View>
                <Badge label={item.status} tone={STATUS_TONE[item.status] || 'muted'} />
              </View>
              {item.tests.map((t: any, i: number) => (
                <View key={i} style={[styles.testRow, { borderTopColor: colors.muted }]}>
                  <Text style={[styles.testName, { color: colors.text }]}>{t.name}</Text>
                  <Text style={[styles.testVal, { color: item.status === 'resulted' ? flagColor(t.flag) : colors.mutedText }]}>
                    {item.status === 'resulted' ? `${t.result} ${t.unit || ''}`.trim() : 'Pending'}
                    {item.status === 'resulted' && t.flag && t.flag !== 'normal' ? `  (${t.flag})` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { padding: 16, gap: 12 },
  card: { marginBottom: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  icon: { width: 44, height: 44, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '900' },
  meta: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  testRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1 },
  testName: { fontSize: 13, fontWeight: '700', flex: 1 },
  testVal: { fontSize: 13, fontWeight: '800' },
});
