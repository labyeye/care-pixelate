import React, { useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterPatientScreen from '../screens/RegisterPatientScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OTPScreen from '../screens/OTPScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';

import HomeScreen from '../screens/HomeScreen';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import AppointmentDetailScreen from '../screens/AppointmentDetailScreen';
import BookAppointmentScreen from '../screens/BookAppointmentScreen';
import DoctorsScreen from '../screens/DoctorsScreen';
import DoctorDetailScreen from '../screens/DoctorDetailScreen';
import EmergencyScreen from '../screens/EmergencyScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ChatScreen from '../screens/ChatScreen';
import VideoCallScreen from '../screens/VideoCallScreen';
import AIAssistantScreen from '../screens/AIAssistantScreen';

import MedicalRecordsScreen from '../screens/MedicalRecordsScreen';
import HealthTimelineScreen from '../screens/HealthTimelineScreen';
import PrescriptionsScreen from '../screens/PrescriptionsScreen';
import PrescriptionDetailScreen from '../screens/PrescriptionDetailScreen';
import LabResultsScreen from '../screens/LabResultsScreen';
import MedicineReminderScreen from '../screens/MedicineReminderScreen';
import VitalsScreen from '../screens/VitalsScreen';
import InsuranceScreen from '../screens/InsuranceScreen';
import PaymentsScreen from '../screens/PaymentsScreen';

import ProfileScreen from '../screens/ProfileScreen';
import StaffNavigator, { TabBar } from '../staff/StaffNavigator';
import SettingsScreen from '../screens/SettingsScreen';

const RootStack = createNativeStackNavigator();
const HomeStackNav = createNativeStackNavigator();
const AppointmentsStackNav = createNativeStackNavigator();
const RecordsStackNav = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();
const MessagesStackNav = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeHome" component={HomeScreen} />
      <HomeStackNav.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <HomeStackNav.Screen name="Doctors" component={DoctorsScreen} />
      <HomeStackNav.Screen name="DoctorDetail" component={DoctorDetailScreen} />
      <HomeStackNav.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
      <HomeStackNav.Screen name="Prescriptions" component={PrescriptionsScreen} />
      <HomeStackNav.Screen name="LabResults" component={LabResultsScreen} />
      <HomeStackNav.Screen name="Vitals" component={VitalsScreen} />
      <HomeStackNav.Screen name="Emergency" component={EmergencyScreen} />
      <HomeStackNav.Screen name="Notifications" component={NotificationsScreen} />
      <HomeStackNav.Screen name="Messages" component={MessagesScreen} />
      <HomeStackNav.Screen name="Chat" component={ChatScreen} />
      <HomeStackNav.Screen name="VideoCall" component={VideoCallScreen} />
      <HomeStackNav.Screen name="AIAssistant" component={AIAssistantScreen} />
    </HomeStackNav.Navigator>
  );
}

function AppointmentsStack() {
  return (
    <AppointmentsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AppointmentsStackNav.Screen name="AppointmentsList" component={AppointmentsScreen} />
      <AppointmentsStackNav.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
      <AppointmentsStackNav.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <AppointmentsStackNav.Screen name="Doctors" component={DoctorsScreen} />
      <AppointmentsStackNav.Screen name="DoctorDetail" component={DoctorDetailScreen} />
      <AppointmentsStackNav.Screen name="VideoCall" component={VideoCallScreen} />
    </AppointmentsStackNav.Navigator>
  );
}

function RecordsStack() {
  return (
    <RecordsStackNav.Navigator screenOptions={{ headerShown: false }}>
      <RecordsStackNav.Screen name="MedicalRecordsHome" component={MedicalRecordsScreen} />
      <RecordsStackNav.Screen name="HealthTimeline" component={HealthTimelineScreen} />
      <RecordsStackNav.Screen name="Prescriptions" component={PrescriptionsScreen} />
      <RecordsStackNav.Screen name="PrescriptionDetail" component={PrescriptionDetailScreen} />
      <RecordsStackNav.Screen name="LabResults" component={LabResultsScreen} />
      <RecordsStackNav.Screen name="MedicineReminder" component={MedicineReminderScreen} />
      <RecordsStackNav.Screen name="Vitals" component={VitalsScreen} />
      <RecordsStackNav.Screen name="Insurance" component={InsuranceScreen} />
      <RecordsStackNav.Screen name="Payments" component={PaymentsScreen} />
    </RecordsStackNav.Navigator>
  );
}

function ProfileStack() {
  return (
    <ProfileStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStackNav.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStackNav.Screen name="Settings" component={SettingsScreen} />
    </ProfileStackNav.Navigator>
  );
}

function MessagesStack() {
  return (
    <MessagesStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MessagesStackNav.Screen name="MessagesHome" component={MessagesScreen} />
      <MessagesStackNav.Screen name="Chat" component={ChatScreen} />
    </MessagesStackNav.Navigator>
  );
}

// Same bottom bar as NestHR / NestStaff: five tabs with the middle one raised in a notch.
function MainTabs() {
  return (
    <Tab.Navigator tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeStack} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="RecordsTab" component={RecordsStack} options={{ tabBarLabel: 'Records' }} />
      <Tab.Screen name="AppointmentsTab" component={AppointmentsStack} options={{ tabBarLabel: 'Visits' }} />
      <Tab.Screen name="MessagesTab" component={MessagesStack} options={{ tabBarLabel: 'Chat' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// Patients get the patient app; every clinic role gets the staff app (menu filtered by role permissions).
function MainEntry() {
  const { user } = useAuth();
  return user?.role === 'patient' ? <MainTabs /> : <StaffNavigator />;
}

export default function AppNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  // Sign in / register / OTP / logout only change the auth state; this moves the stack to match.
  // (Splash handles the very first screen, so the initial value is not treated as a change.)
  const wasAuthed = useRef(isAuthenticated);
  useEffect(() => {
    if (isLoading || wasAuthed.current === isAuthenticated) return;
    wasAuthed.current = isAuthenticated;
    if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: isAuthenticated ? 'Main' : 'Login' }] });
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return null; // SplashScreen itself also guards on AuthContext.isLoading
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
        <RootStack.Screen name="Splash" component={SplashScreen} />
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen name="Login" component={LoginScreen} />
        <RootStack.Screen name="Register" component={RegisterScreen} />
        <RootStack.Screen name="RegisterPatient" component={RegisterPatientScreen} />
        <RootStack.Screen name="OTP" component={OTPScreen} />
        <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <RootStack.Screen name="Main" component={MainEntry} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
