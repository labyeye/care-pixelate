import React from 'react';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarClock,
  FlaskConical,
  Pill,
  MessageCircle,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import Card from '../components/Card';

// Mock data — no notifications backend model exists yet.
const SECTIONS = [
  {
    title: 'Today',
    data: [
      {
        id: '1',
        icon: CalendarClock,
        text: 'Appointment with Dr. Rao at 4:00 PM',
        time: '2h ago',
      },
      {
        id: '2',
        icon: Pill,
        text: 'Time to take your Amoxicillin dose',
        time: '5h ago',
      },
    ],
  },
  {
    title: 'Yesterday',
    data: [
      {
        id: '3',
        icon: FlaskConical,
        text: 'Your Lipid Profile report is ready',
        time: '1d ago',
      },
      {
        id: '4',
        icon: MessageCircle,
        text: 'New message from Dr. Iyer',
        time: '1d ago',
      },
    ],
  },
  {
    title: 'Earlier',
    data: [
      {
        id: '5',
        icon: CalendarClock,
        text: 'Appointment confirmed for 12 Jul',
        time: '3d ago',
      },
    ],
  },
];

export default function NotificationsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Notifications" onBack={() => navigation.goBack()} />
      <SectionList
        sections={SECTIONS}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
        ]}
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              styles.sectionLabel,
              { color: colors.mutedText, backgroundColor: colors.background },
            ]}
          >
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => {
          const Icon = item.icon;
          return (
            <Card style={styles.card}>
              <View
                style={[
                  styles.icon,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.primary,
                  },
                ]}
              >
                <Icon size={16} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { color: colors.text }]}>
                  {item.text}
                </Text>
                <Text style={[styles.time, { color: colors.mutedText }]}>
                  {item.time}
                </Text>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { padding: 16, gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  icon: {
    width: 36,
    height: 36,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  time: { fontSize: 11, fontWeight: '600', marginTop: 3 },
});
