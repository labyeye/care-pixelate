import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FileText,
  FlaskConical,
  ScanLine,
  FolderOpen,
  Download,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Card from '../components/Card';
import { meAPI, API_BASE } from '../services/api';
import storage from '../utils/storage';
import { Linking } from 'react-native';

const CATEGORIES = [
  {
    key: 'prescriptions',
    label: 'Prescriptions',
    icon: FileText,
    types: ['prescription'],
  },
  {
    key: 'lab',
    label: 'Lab Reports',
    icon: FlaskConical,
    types: ['lab_report'],
  },
  { key: 'imaging', label: 'Imaging', icon: ScanLine, types: ['scan'] },
  {
    key: 'documents',
    label: 'Documents',
    icon: FolderOpen,
    types: ['bill', 'discharge', 'other'],
  },
];

export default function MedicalRecordsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [active, setActive] = useState('prescriptions');

  const category = CATEGORIES.find(c => c.key === active)!;
  const [records, setRecords] = useState<any[]>([]);
  const [rx, setRx] = useState<any[]>([]);

  useEffect(() => {
    meAPI
      .records()
      .then(r => setRecords(r.data || []))
      .catch(() => {});
    meAPI
      .prescriptions()
      .then(r => setRx(r.data || []))
      .catch(() => {});
  }, []);

  // Signed clinic prescriptions are always listed under Prescriptions, alongside uploaded files.
  const items: { id: string; name: string; date: string; fileId?: string }[] = [
    ...(active === 'prescriptions'
      ? rx.map(c => ({
          id: c._id,
          name: `${c.prescription?.items?.[0]?.drug || 'Prescription'} — ${c.doctorId?.name || 'Doctor'}`,
          date: new Date(c.signedAt || c.createdAt).toLocaleDateString('en-IN'),
        }))
      : []),
    ...records
      .filter(r => category.types.includes(r.type))
      .map(r => ({
        id: r._id,
        name: r.title,
        date: new Date(r.recordDate).toLocaleDateString('en-IN'),
        fileId: r._id,
      })),
  ];

  // ponytail: file bytes are served by GET /me/records/:id/file; in-app viewing needs a file-system/viewer
  // library (not installed), so for now the app lists records and the web portal opens them.
  const openFile = () =>
    Alert.alert(
      'Record',
      'Viewing uploaded files in the app is coming soon. Your record is stored safely.',
    );

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.background, paddingTop: insets.top + 10 },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        Medical Records
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsRow}
      >
        {CATEGORIES.map(c => {
          const Icon = c.icon;
          const isActive = active === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setActive(c.key)}
              style={[
                styles.tab,
                { borderColor: colors.border },
                isActive && { backgroundColor: colors.primary },
              ]}
            >
              <Icon size={14} color={isActive ? colors.white : colors.text} />
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? colors.white : colors.text },
                ]}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        {items.length === 0 && (
          <Text style={{ color: colors.mutedText, fontWeight: '600' }}>
            Nothing here yet.
          </Text>
        )}
        {items.map(item => (
          <Card key={item.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: colors.text }]}>
                {item.name}
              </Text>
              <Text style={[styles.itemDate, { color: colors.mutedText }]}>
                {item.date}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: colors.border }]}
              onPress={() =>
                item.fileId
                  ? openFile()
                  : Alert.alert('Prescription', 'Open it from Prescriptions.')
              }
            >
              <Download size={16} color={colors.primary} />
            </TouchableOpacity>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: {
    fontSize: 22,
    fontWeight: '900',
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  tabsRow: { paddingLeft: 16, marginBottom: 14, flexGrow: 0 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  tabText: { fontSize: 12, fontWeight: '800' },
  list: { paddingHorizontal: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  itemName: { fontSize: 13, fontWeight: '800' },
  itemDate: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  iconBtn: {
    width: 36,
    height: 36,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
