import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, Plus } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { appointmentsAPI } from '../services/api';
import Card from '../components/Card';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import { nbShadow } from '../theme';

const statusTone: Record<string, any> = {
  scheduled: 'primary',
  completed: 'success',
  cancelled: 'destructive',
  no_show: 'warning',
};

export default function AppointmentsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await appointmentsAPI.getAll();
      setAppointments(res.data || []);
    } catch {
      /* keep list empty on failure */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchData());
    return unsub;
  }, [navigation, fetchData]);

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.background, paddingTop: insets.top + 10 },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Appointments</Text>
        <TouchableOpacity
          style={[
            styles.addBtn,
            { borderColor: colors.border, backgroundColor: colors.primary },
            nbShadow,
          ]}
          onPress={() => navigation.navigate('BookAppointment')}
        >
          <Plus size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={item => item._id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={CalendarClock}
              title="No appointments yet"
              subtitle="Book your first appointment to see it here."
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('AppointmentDetail', {
                  appointmentId: item._id,
                })
              }
            >
              <Card style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.doctor, { color: colors.text }]}>
                      {item.doctorId?.name || 'Doctor'}
                    </Text>
                    <Text style={[styles.spec, { color: colors.mutedText }]}>
                      {(item.doctorId?.professionalDetails?.specializations ||
                        [])[0] || 'General'}
                    </Text>
                    <Text style={[styles.date, { color: colors.primary }]}>
                      {new Date(item.scheduledAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Badge
                    label={item.status}
                    tone={statusTone[item.status] || 'muted'}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  title: { fontSize: 22, fontWeight: '900' },
  addBtn: {
    width: 42,
    height: 42,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, gap: 12 },
  card: { marginBottom: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  doctor: { fontSize: 15, fontWeight: '900' },
  spec: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  date: { fontSize: 12, fontWeight: '800', marginTop: 8 },
});
