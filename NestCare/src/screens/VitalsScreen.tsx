import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartPulse, Activity, Weight, Droplets, Thermometer, TrendingUp, TrendingDown, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { meAPI } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';

// `type` is the backend Vital.type enum.
const KINDS = [
  { type: 'bp', label: 'Blood Pressure', icon: HeartPulse, unit: 'mmHg', color: 'destructive' },
  { type: 'pulse', label: 'Heart Rate', icon: Activity, unit: 'bpm', color: 'primary' },
  { type: 'weight', label: 'Weight', icon: Weight, unit: 'kg', color: 'secondary' },
  { type: 'sugar', label: 'Blood Sugar', icon: Droplets, unit: 'mg/dL', color: 'teal' },
  { type: 'temp', label: 'Temperature', icon: Thermometer, unit: '°F', color: 'purple' },
] as const;

type Kind = (typeof KINDS)[number];

const show = (r?: any) => (r ? (r.value2 != null ? `${r.value}/${r.value2}` : String(r.value)) : '—');

export default function VitalsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [readings, setReadings] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Kind | null>(null);
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await meAPI.vitals();
      setReadings(r.data || []); // newest first
    } catch (e: any) {
      Alert.alert('Vitals', e.message || 'Could not load readings');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openLog = (k: Kind) => {
    setSelected(k);
    setNewValue('');
    setModalOpen(true);
  };

  const saveLog = async () => {
    if (!selected) return;
    const [a, b] = newValue.split('/').map(s => parseFloat(s.trim()));
    if (!Number.isFinite(a) || (selected.type === 'bp' && !Number.isFinite(b))) {
      Alert.alert('Invalid reading', selected.type === 'bp' ? 'Enter as 120/80' : 'Enter a number');
      return;
    }
    setSaving(true);
    try {
      await meAPI.addVital({ type: selected.type, value: a, ...(selected.type === 'bp' ? { value2: b } : {}), unit: selected.unit });
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
      <Header title="Vitals" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}>
        {KINDS.map(k => {
          const Icon = k.icon;
          const of = readings.filter(r => r.type === k.type);
          const [latest, prev] = of;
          const up = !prev || latest.value >= prev.value;
          const TrendIcon = up ? TrendingUp : TrendingDown;
          const iconColor = (colors as any)[k.color] || colors.primary;
          return (
            <TouchableOpacity key={k.type} style={styles.cardWrap} onPress={() => openLog(k)}>
              <Card style={styles.card}>
                <View style={[styles.icon, { borderColor: colors.border, backgroundColor: iconColor }]}>
                  <Icon size={20} color={colors.white} />
                </View>
                <Text style={[styles.label, { color: colors.mutedText }]}>{k.label}</Text>
                <View style={styles.valueRow}>
                  <Text style={[styles.value, { color: colors.text }]}>{show(latest)}</Text>
                  {!!latest && !!prev && <TrendIcon size={14} color={up ? colors.success : colors.destructive} />}
                </View>
                <Text style={[styles.unit, { color: colors.mutedText }]}>
                  {k.unit}
                  {latest ? ` · ${new Date(latest.measuredAt).toLocaleDateString('en-IN')}` : ' · tap to log'}
                </Text>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Log {selected?.label}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={newValue}
              onChangeText={setNewValue}
              placeholder={selected?.type === 'bp' ? 'e.g. 120/80' : `Enter value (${selected?.unit})`}
              placeholderTextColor={colors.mutedText}
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              keyboardType="numbers-and-punctuation"
            />
            <Button title="Save Reading" onPress={saveLog} loading={saving} style={styles.saveBtn} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  grid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cardWrap: { width: '47%' },
  card: { alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  label: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  value: { fontSize: 20, fontWeight: '900' },
  unit: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopWidth: 3, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  input: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 12, height: 46, fontSize: 13, fontWeight: '600', marginBottom: 14 },
  saveBtn: {},
});
