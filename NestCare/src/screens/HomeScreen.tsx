import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarPlus,
  FileText,
  FlaskConical,
  Activity,
  PhoneCall,
  Bell,
  Lightbulb,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { appointmentsAPI } from '../services/api';
import Card from '../components/Card';
import Badge from '../components/Badge';
import { nbShadow } from '../theme';

const HEALTH_TIPS = [
  'Drink at least 8 glasses of water today to stay hydrated.',
  'A brisk 20-minute walk can boost your mood and heart health.',
  'Aim for 7-8 hours of sleep for better immunity and focus.',
  'Include more fiber-rich vegetables in your meals this week.',
];

const statusTone: Record<string, any> = {
  scheduled: 'primary',
  completed: 'success',
  cancelled: 'destructive',
  no_show: 'warning',
};

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [tip] = useState(
    HEALTH_TIPS[Math.floor(Math.random() * HEALTH_TIPS.length)],
  );

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await appointmentsAPI.getAll();
      setAppointments(res.data || []);
    } catch {
      /* leave list empty on failure */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const upcoming = appointments
    .filter(
      a =>
        a.status === 'scheduled' &&
        new Date(a.scheduledAt).getTime() >= Date.now() - 86400000,
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )[0];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  const quickActions = [
    {
      label: 'Book Appointment',
      icon: CalendarPlus,
      color: colors.primary,
      onPress: () => navigation.navigate('BookAppointment'),
    },
    {
      label: 'Prescriptions',
      icon: FileText,
      color: colors.secondary,
      onPress: () => navigation.navigate('Prescriptions'),
    },
    {
      label: 'Lab Reports',
      icon: FlaskConical,
      color: colors.teal,
      onPress: () => navigation.navigate('LabResults'),
    },
    {
      label: 'Vitals',
      icon: Activity,
      color: colors.purple,
      onPress: () => navigation.navigate('Vitals'),
    },
    {
      label: 'Emergency',
      icon: PhoneCall,
      color: colors.destructive,
      onPress: () => navigation.navigate('Emergency'),
    },
  ];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingTop: insets.top + 10,
          },
        ]}
      >
        <View style={styles.headerInfo}>
          <Text style={[styles.greeting, { color: colors.mutedText }]}>
            {greeting},
          </Text>
          <Text style={[styles.name, { color: colors.text }]}>
            {(user?.name || 'Patient').toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.bellBtn,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Bell size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            UPCOMING APPOINTMENT
          </Text>
          {upcoming ? (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('AppointmentDetail', {
                  appointmentId: upcoming._id,
                })
              }
            >
              <Card style={styles.apptCard}>
                <View style={styles.apptRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.apptDoctor, { color: colors.text }]}>
                      {upcoming.doctorId?.name || 'Doctor'}
                    </Text>
                    <Text
                      style={[styles.apptSpec, { color: colors.mutedText }]}
                    >
                      {(upcoming.doctorId?.professionalDetails
                        ?.specializations || [])[0] || 'General'}
                    </Text>
                    <Text style={[styles.apptTime, { color: colors.primary }]}>
                      {new Date(upcoming.scheduledAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Badge
                    label={upcoming.status}
                    tone={statusTone[upcoming.status] || 'muted'}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          ) : (
            <Card>
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                No upcoming appointments. Book one to get started.
              </Text>
            </Card>
          )}

          <Text
            style={[
              styles.sectionLabel,
              { color: colors.mutedText, marginTop: 20 },
            ]}
          >
            QUICK ACTIONS
          </Text>
          <View style={styles.actionsGrid}>
            {quickActions.map(a => {
              const Icon = a.icon;
              return (
                <TouchableOpacity
                  key={a.label}
                  style={styles.actionItem}
                  onPress={a.onPress}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      { backgroundColor: a.color, borderColor: colors.border },
                      nbShadow,
                    ]}
                  >
                    <Icon size={22} color={colors.white} />
                  </View>
                  <Text
                    style={[styles.actionLabel, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {a.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text
            style={[
              styles.sectionLabel,
              { color: colors.mutedText, marginTop: 20 },
            ]}
          >
            HEALTH TIP
          </Text>
          <Card style={styles.tipCard}>
            <View
              style={[
                styles.tipIcon,
                { backgroundColor: colors.warning, borderColor: colors.border },
              ]}
            >
              <Lightbulb size={18} color={colors.white} />
            </View>
            <Text style={[styles.tipText, { color: colors.text }]}>{tip}</Text>
          </Card>

          <TouchableOpacity
            style={styles.viewAllRow}
            onPress={() => navigation.navigate('Doctors')}
          >
            <Text style={[styles.viewAllText, { color: colors.primary }]}>
              Browse all doctors
            </Text>
            <ChevronRight size={16} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 2,
  },
  headerInfo: { flex: 1 },
  greeting: { fontSize: 13, fontWeight: '600' },
  name: { fontSize: 20, fontWeight: '900', letterSpacing: 0.3, marginTop: 2 },
  bellBtn: {
    width: 42,
    height: 42,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  apptCard: { marginBottom: 4 },
  apptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  apptDoctor: { fontSize: 16, fontWeight: '900' },
  apptSpec: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  apptTime: { fontSize: 13, fontWeight: '800', marginTop: 8 },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  actionItem: { width: '30%', alignItems: 'center' },
  actionIcon: {
    width: 58,
    height: 58,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipIcon: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 20,
    paddingVertical: 10,
  },
  viewAllText: { fontSize: 13, fontWeight: '800' },
});
