import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import Card from '../components/Card';

// Mock conversation list — no messaging backend exists yet.
export const MOCK_CONVERSATIONS = [
  {
    id: '1',
    name: 'Dr. Rao',
    role: 'Cardiologist',
    lastMessage: 'Please continue the current dosage for a week.',
    time: '2:40 PM',
    unread: 2,
  },
  {
    id: '2',
    name: 'Dr. Iyer',
    role: 'Endocrinologist',
    lastMessage: 'Your reports look good overall.',
    time: 'Yesterday',
    unread: 0,
  },
  {
    id: '3',
    name: 'City Hospital Front Desk',
    role: 'Clinic',
    lastMessage: 'Your appointment has been rescheduled.',
    time: 'Mon',
    unread: 1,
  },
];

export default function MessagesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Messages" onBack={() => navigation.goBack()} />
      <FlatList
        data={MOCK_CONVERSATIONS}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
        ]}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('Chat', {
                conversationId: item.id,
                name: item.name,
              })
            }
          >
            <Card style={styles.card}>
              <View
                style={[
                  styles.avatar,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.primary,
                  },
                ]}
              >
                <User size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.row}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.time, { color: colors.mutedText }]}>
                    {item.time}
                  </Text>
                </View>
                <Text style={[styles.role, { color: colors.primary }]}>
                  {item.role}
                </Text>
                <Text
                  style={[styles.lastMessage, { color: colors.mutedText }]}
                  numberOfLines={1}
                >
                  {item.lastMessage}
                </Text>
              </View>
              {item.unread > 0 && (
                <View
                  style={[
                    styles.unreadBadge,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.secondary,
                    },
                  ]}
                >
                  <Text style={styles.unreadText}>{item.unread}</Text>
                </View>
              )}
            </Card>
          </TouchableOpacity>
        )}
      />
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
  avatar: {
    width: 46,
    height: 46,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 14, fontWeight: '900' },
  time: { fontSize: 10, fontWeight: '600' },
  role: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  lastMessage: { fontSize: 12, fontWeight: '500', marginTop: 3 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: { fontSize: 10, fontWeight: '900', color: '#fff' },
});
