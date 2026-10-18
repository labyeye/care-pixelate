import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  TextInput,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Pill, X, Trash2 } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { meAPI } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import { nbShadow } from '../theme';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Stored server-side (times are 24h HH:MM). Push/WhatsApp delivery is a scheduler job on top.
export default function MedicineReminderScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [reminders, setReminders] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [medicine, setMedicine] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await meAPI.reminders();
      setReminders(r.data || []);
    } catch (e: any) {
      Alert.alert('Reminders', e.message || 'Could not load reminders');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (r: any) => {
    setReminders(prev =>
      prev.map(x => (x._id === r._id ? { ...x, active: !x.active } : x)),
    );
    try {
      await meAPI.updateReminder(r._id, { active: !r.active });
    } catch {
      load();
    }
  };

  const remove = (r: any) =>
    Alert.alert('Delete reminder', `Remove the reminder for ${r.drug}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await meAPI.deleteReminder(r._id);
            setReminders(prev => prev.filter(x => x._id !== r._id));
          } catch (e: any) {
            Alert.alert('Could not delete', e.message || 'Please try again.');
          }
        },
      },
    ]);

  const addReminder = async () => {
    const times = time
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    if (
      !medicine.trim() ||
      !times.length ||
      !times.every(t => TIME_RE.test(t))
    ) {
      Alert.alert(
        'Check details',
        'Enter the medicine and 24h times like 08:00, 20:30',
      );
      return;
    }
    setSaving(true);
    try {
      await meAPI.addReminder({ drug: medicine.trim(), times });
      setMedicine('');
      setTime('');
      setModalOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Medicine Reminders" onBack={() => navigation.goBack()} />
      <FlatList
        data={reminders}
        keyExtractor={item => item._id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 90 },
        ]}
        ListEmptyComponent={
          <Text style={{ color: colors.mutedText, fontWeight: '600' }}>
            No reminders yet. Tap + to add one.
          </Text>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View
              style={[
                styles.icon,
                { borderColor: colors.border, backgroundColor: colors.purple },
              ]}
            >
              <Pill size={18} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>
                {item.drug}
              </Text>
              <Text style={[styles.time, { color: colors.mutedText }]}>
                {(item.times || []).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => remove(item)}
              accessibilityLabel={`Delete ${item.drug}`}
              style={{ padding: 6 }}
            >
              <Trash2 size={18} color={colors.destructive} />
            </TouchableOpacity>
            <Switch
              value={item.active}
              onValueChange={() => toggle(item)}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor={colors.white}
            />
          </Card>
        )}
      />

      <TouchableOpacity
        style={[
          styles.fab,
          {
            borderColor: colors.border,
            backgroundColor: colors.primary,
            bottom: insets.bottom + 20,
          },
          nbShadow,
        ]}
        onPress={() => setModalOpen(true)}
      >
        <Plus size={24} color={colors.white} />
      </TouchableOpacity>

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Add Reminder
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="Medicine name"
              placeholderTextColor={colors.mutedText}
              value={medicine}
              onChangeText={setMedicine}
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text },
              ]}
            />
            <TextInput
              placeholder="Times, 24h (e.g. 08:00, 20:30)"
              placeholderTextColor={colors.mutedText}
              value={time}
              onChangeText={setTime}
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text },
              ]}
            />
            <Button
              title="Add Reminder"
              onPress={addReminder}
              loading={saving}
              style={styles.addBtn}
            />
          </View>
        </View>
      </Modal>
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
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14, fontWeight: '900' },
  time: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: { borderTopWidth: 3, padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '900' },
  input: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  addBtn: { marginTop: 4 },
});
