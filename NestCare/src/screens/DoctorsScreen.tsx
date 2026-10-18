import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Stethoscope, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { doctorsAPI } from '../services/api';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';

export default function DoctorsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await doctorsAPI.getAll();
      setDoctors(res.data || []);
    } catch {
      /* keep list empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = doctors.filter(d => {
    const q = query.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      (d.professionalDetails?.specializations || []).some((x: string) =>
        x.toLowerCase().includes(q),
      )
    );
  });

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.background, paddingTop: insets.top + 10 },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Doctors</Text>
      <View
        style={[
          styles.searchBox,
          { borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <Search size={16} color={colors.mutedText} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name or specialization"
          placeholderTextColor={colors.mutedText}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item._id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ListEmptyComponent={
            <EmptyState
              icon={Stethoscope}
              title="No doctors found"
              subtitle="Try a different search term."
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('DoctorDetail', { doctorId: item._id })
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
                  <Text style={styles.avatarText}>
                    {(item.name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.spec, { color: colors.mutedText }]}>
                    {(item?.professionalDetails?.specializations || [])[0] ||
                      'General Physician'}
                  </Text>
                  {!!item.professionalDetails?.experienceYears && (
                    <Text style={[styles.dept, { color: colors.primary }]}>
                      {item.professionalDetails.experienceYears} yrs experience
                    </Text>
                  )}
                </View>
                <ChevronRight size={18} color={colors.mutedText} />
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
  title: {
    fontSize: 22,
    fontWeight: '900',
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  searchInput: { flex: 1, height: 42, fontSize: 13, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  avatar: {
    width: 46,
    height: 46,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
  name: { fontSize: 15, fontWeight: '900' },
  spec: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  dept: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
