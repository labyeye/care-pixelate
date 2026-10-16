import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pill, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { meAPI } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';

// One card per signed consultation; the detail screen lists every medicine in it.
export default function PrescriptionsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    meAPI
      .prescriptions()
      .then(r => setItems((r.data || []).filter((c: any) => c.prescription?.items?.length)))
      .catch((e: any) => setError(e.message || 'Could not load prescriptions'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={[styles.wrap, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Prescriptions" onBack={() => navigation.goBack()} />
      {!!error && <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>}
      {!error && items.length === 0 && (
        <Text style={[styles.empty, { color: colors.mutedText }]}>No prescriptions yet. They appear here after your doctor signs them.</Text>
      )}
      <FlatList
        data={items}
        keyExtractor={item => item._id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        renderItem={({ item }) => {
          const meds = item.prescription.items;
          return (
            <TouchableOpacity onPress={() => navigation.navigate('PrescriptionDetail', { prescription: item })}>
              <Card style={styles.card}>
                <View style={[styles.icon, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <Pill size={18} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {meds[0].drug}
                    {meds.length > 1 ? ` +${meds.length - 1} more` : ''}
                  </Text>
                  <Text style={[styles.dosage, { color: colors.mutedText }]} numberOfLines={1}>
                    {item.diagnosis?.length ? item.diagnosis.join(', ') : 'Prescription'}
                  </Text>
                  <Text style={[styles.meta, { color: colors.primary }]}>
                    {item.doctorId?.name || 'Doctor'} · {new Date(item.signedAt || item.createdAt).toLocaleDateString('en-IN')}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.mutedText} />
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 20, fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  icon: { width: 44, height: 44, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '900' },
  dosage: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 11, fontWeight: '800', marginTop: 4 },
});
