// Clinic-staff app shell: HR-style bottom bar (appointments raised in the centre) + a stack for every other screen.
import React from 'react';
import {
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  useSafeAreaInsets,
  SafeAreaView,
} from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  Activity,
  BarChart3,
  FileHeart,
  MessageSquare,
  User as UserIcon,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  FileBarChart,
  FlaskConical,
  Grid,
  Home,
  KeyRound,
  LucideIcon,
  MapPin,
  Pill,
  Receipt,
  Settings,
  ShieldCheck,
  Stethoscope,
  Truck,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { C, Screen } from './ui';
import DashboardScreen from './screens/DashboardScreen';
import PatientsScreen from './screens/PatientsScreen';
import DoctorsScreen from './screens/DoctorsScreen';
import AppointmentsScreen from './screens/AppointmentsScreen';
import CalendarScreen from './screens/CalendarScreen';
import ConsultationsScreen from './screens/ConsultationsScreen';
import ConsultationScreen from './screens/ConsultationScreen';
import LabOrdersScreen from './screens/LabOrdersScreen';
import MedicinesScreen from './screens/MedicinesScreen';
import VendorsScreen from './screens/VendorsScreen';
import InvoicesScreen from './screens/InvoicesScreen';
import {
  AuditLogScreen,
  LocationsScreen,
  PasswordResetScreen,
  StaffScreen,
} from './screens/AdminScreens';
import {
  AnalyticsScreen,
  BillingScreen,
  ReportsScreen,
  SettingsScreen,
} from './screens/InsightScreens';

/** Every staff screen, the permission key that unlocks it, and where it shows up. */
const MENU: {
  route: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  page: string;
  group: string;
}[] = [
  {
    route: 'Doctors',
    label: 'Doctors',
    desc: 'Profiles, fees & schedules',
    icon: Stethoscope,
    page: 'doctors',
    group: 'Clinical',
  },
  {
    route: 'Calendar',
    label: 'Calendar',
    desc: 'Week view of appointments',
    icon: CalendarRange,
    page: 'calendar',
    group: 'Clinical',
  },
  {
    route: 'Consultations',
    label: 'Consultations',
    desc: 'Visits & prescriptions',
    icon: Activity,
    page: 'consultations',
    group: 'Clinical',
  },
  {
    route: 'LabOrders',
    label: 'Lab Orders',
    desc: 'Tests, samples & results',
    icon: FlaskConical,
    page: 'lab-orders',
    group: 'Clinical',
  },
  {
    route: 'Medicines',
    label: 'Medicines',
    desc: 'Catalogue & stock',
    icon: Pill,
    page: 'medicines',
    group: 'Pharmacy',
  },
  {
    route: 'Vendors',
    label: 'Vendors',
    desc: 'Medicine suppliers',
    icon: Truck,
    page: 'medicines',
    group: 'Pharmacy',
  },
  {
    route: 'Billing',
    label: 'Billing & Plan',
    desc: 'Subscription & usage',
    icon: Wallet,
    page: 'billing',
    group: 'Finance',
  },
  {
    route: 'Analytics',
    label: 'Analytics',
    desc: 'Trends & charts',
    icon: BarChart3,
    page: 'analytics',
    group: 'Insights',
  },
  {
    route: 'Reports',
    label: 'Reports',
    desc: 'Run & share reports',
    icon: FileBarChart,
    page: 'reports',
    group: 'Insights',
  },
  {
    route: 'Staff',
    label: 'Staff',
    desc: 'Accounts & roles',
    icon: ClipboardList,
    page: 'staff',
    group: 'Administration',
  },
  {
    route: 'PasswordReset',
    label: 'Password Reset',
    desc: 'Reset doctor / staff passwords',
    icon: KeyRound,
    page: 'password-reset',
    group: 'Administration',
  },
  {
    route: 'Locations',
    label: 'Locations',
    desc: 'Branches',
    icon: MapPin,
    page: 'locations',
    group: 'Administration',
  },
  {
    route: 'AuditLog',
    label: 'Audit Log',
    desc: 'Who viewed or changed what',
    icon: ShieldCheck,
    page: 'audit-log',
    group: 'Administration',
  },
  {
    route: 'Settings',
    label: 'Settings',
    desc: 'Account & organisation',
    icon: Settings,
    page: 'settings',
    group: 'Administration',
  },
];

function MoreScreen({ navigation }: any) {
  const { user, pages } = useAuth();
  const allowed = (p: string) =>
    !pages || pages.includes(p) || user?.role === 'tenant_owner';
  const items = MENU.filter(m => allowed(m.page));
  const groups = Array.from(new Set(items.map(i => i.group)));
  return (
    <Screen title="More">
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {groups.map(g => (
          <View key={g} style={{ marginBottom: 14 }}>
            <Text style={styles.groupLabel}>{g}</Text>
            {items
              .filter(i => i.group === g)
              .map(i => (
                <TouchableOpacity
                  key={i.route}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate(i.route)}
                  style={styles.menuRow}
                >
                  <View style={styles.menuIcon}>
                    <i.icon size={20} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuTitle}>{i.label}</Text>
                    <Text style={styles.menuDesc}>{i.desc}</Text>
                  </View>
                  <ChevronRight size={18} color={C.muted} />
                </TouchableOpacity>
              ))}
          </View>
        ))}
        {!items.length && (
          <SafeAreaView>
            <Text style={{ textAlign: 'center', color: C.muted }}>
              Nothing else is enabled for your role.
            </Text>
          </SafeAreaView>
        )}
      </ScrollView>
    </Screen>
  );
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
export const TAB_ICONS: Record<string, LucideIcon> = {
  Home,
  Patients: Users,
  Appointments: CalendarDays,
  Invoices: Receipt,
  More: Grid,
  // patient app tabs reuse the same bar
  RecordsTab: FileHeart,
  AppointmentsTab: CalendarDays,
  MessagesTab: MessageSquare,
  ProfileTab: UserIcon,
};

const BAR_ROW = 60,
  FAB = 64,
  NOTCH_W = 60,
  NOTCH_DEPTH = 40;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = React.useState(0);
  const height = BAR_ROW + insets.bottom;
  const centerIndex = Math.floor(state.routes.length / 2);
  const hasCenter = state.routes.length === 5; // middle tab is raised in a notch, like NestHR
  const cx = width / 2;
  const path = hasCenter
    ? `M-2,0 L${cx - NOTCH_W},0 C${cx - NOTCH_W + 22},0 ${cx - 36},${NOTCH_DEPTH} ${cx},${NOTCH_DEPTH} C${cx + 36},${NOTCH_DEPTH} ${cx + NOTCH_W - 22},0 ${cx + NOTCH_W},0 L${width + 2},0 L${width + 2},${height + 2} L-2,${height + 2} Z`
    : `M-2,0 L${width + 2},0 L${width + 2},${height + 2} L-2,${height + 2} Z`;
  return (
    <View
      style={[styles.barWrap, { height }]}
      onLayout={(e: LayoutChangeEvent) =>
        setWidth(Math.floor(e.nativeEvent.layout.width))
      }
    >
      {width > 0 && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path
            d={path}
            fill={C.white}
            stroke={C.black}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </Svg>
      )}
      <View style={[styles.barRow, { paddingBottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const raised = hasCenter && index === centerIndex;
          const color = focused ? C.primary : '#9CA3AF';
          const Icon = TAB_ICONS[route.name] || Home;
          const lbl =
            (descriptors[route.key].options.tabBarLabel as string) ??
            route.name;
          const onPress = () => {
            const ev = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !ev.defaultPrevented)
              navigation.navigate(route.name as never);
          };
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              onPress={onPress}
              activeOpacity={0.8}
              style={styles.tabItem}
            >
              {raised ? (
                <>
                  <View style={styles.fab}>
                    <Icon size={28} color={C.white} />
                  </View>
                  <View style={styles.iconWrap} />
                </>
              ) : (
                <View style={styles.iconWrap}>
                  <Icon size={20} color={color} />
                </View>
              )}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.tabLabel, raised && { marginTop: 5 }, { color }]}
              >
                {lbl}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Tabs() {
  const { user, pages } = useAuth();
  const allowed = (p: string) =>
    !pages || pages.includes(p) || user?.role === 'tenant_owner';
  // Keep the five-tab layout (with the raised centre) whenever the role can open them all.
  const show = {
    Patients: allowed('patients'),
    Appointments: allowed('appointments'),
    Invoices: allowed('invoices'),
  };
  return (
    <Tab.Navigator
      tabBar={p => <TabBar {...p} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      {show.Patients && (
        <Tab.Screen
          name="Patients"
          component={PatientsScreen}
          options={{ tabBarLabel: 'Patients' }}
        />
      )}
      {show.Appointments && (
        <Tab.Screen
          name="Appointments"
          component={AppointmentsScreen}
          options={{ tabBarLabel: 'Visits' }}
        />
      )}
      {show.Invoices && (
        <Tab.Screen
          name="Invoices"
          component={InvoicesScreen}
          options={{ tabBarLabel: 'Billing' }}
        />
      )}
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ tabBarLabel: 'More' }}
      />
    </Tab.Navigator>
  );
}

export default function StaffNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StaffTabs" component={Tabs} />
      <Stack.Screen name="Doctors" component={DoctorsScreen} />
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="Consultations" component={ConsultationsScreen} />
      <Stack.Screen name="Consultation" component={ConsultationScreen} />
      <Stack.Screen name="LabOrders" component={LabOrdersScreen} />
      <Stack.Screen name="Medicines" component={MedicinesScreen} />
      <Stack.Screen name="Vendors" component={VendorsScreen} />
      <Stack.Screen name="Billing" component={BillingScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Staff" component={StaffScreen} />
      <Stack.Screen name="PasswordReset" component={PasswordResetScreen} />
      <Stack.Screen name="Locations" component={LocationsScreen} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  barWrap: { backgroundColor: 'transparent' },
  barRow: { flexDirection: 'row', flex: 1, paddingTop: 4 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    top: -(FAB / 2) - 2,
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    borderWidth: 2,
    borderColor: C.black,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    maxWidth: '100%',
  },
  iconWrap: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderColor: C.black,
    borderRightColor: C.ink,
    borderBottomColor: C.ink,
    backgroundColor: C.white,
    padding: 12,
    marginBottom: 10,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: C.primary,
    backgroundColor: '#EEF4FF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: { fontSize: 15, fontWeight: '800', color: C.black },
  menuDesc: { fontSize: 12, color: C.muted },
});
