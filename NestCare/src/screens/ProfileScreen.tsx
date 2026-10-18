import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info, Settings as SettingsIcon } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import Button from '../components/Button';

const GENDERS = ['male', 'female', 'other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('male');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    // The backend's Patient model (nest-care/backend/models/Patient.js) is a
    // tenant-scoped, staff-facing CRUD resource — there is no dedicated
    // "patient self-service profile" endpoint yet, so this save is a local-only
    // stub rather than a call to the wrong resource.
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      Alert.alert(
        'Saved locally (mock)',
        'There is no patient self-service profile endpoint on the backend yet, so this update was not persisted to the server.',
      );
    }, 600);
  };

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.background, paddingTop: insets.top + 10 },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>My Profile</Text>
        <TouchableOpacity
          style={[styles.settingsBtn, { borderColor: colors.border }]}
          onPress={() => navigation.navigate('Settings')}
        >
          <SettingsIcon size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View
          style={[
            styles.noteBox,
            { borderColor: colors.warning, backgroundColor: colors.muted },
          ]}
        >
          <Info size={16} color={colors.warning} />
          <Text style={[styles.noteText, { color: colors.text }]}>
            No patient-self-service profile endpoint exists on the backend yet —
            the tenant-scoped Patient CRUD is staff-facing only. Saving here is
            a local mock until that gap is closed.
          </Text>
        </View>

        <Field
          label="Full Name"
          value={name}
          onChangeText={setName}
          colors={colors}
        />
        <Field
          label="Date of Birth"
          value={dob}
          onChangeText={setDob}
          placeholder="DD/MM/YYYY"
          colors={colors}
        />

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Gender</Text>
          <View style={styles.chipsRow}>
            {GENDERS.map(g => (
              <TouchableOpacity
                key={g}
                onPress={() => setGender(g)}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  gender === g && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: gender === g ? colors.white : colors.text },
                  ]}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          colors={colors}
        />

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>
            Blood Group
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipsRow}>
              {BLOOD_GROUPS.map(bg => (
                <TouchableOpacity
                  key={bg}
                  onPress={() => setBloodGroup(bg)}
                  style={[
                    styles.chip,
                    { borderColor: colors.border },
                    bloodGroup === bg && {
                      backgroundColor: colors.destructive,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: bloodGroup === bg ? colors.white : colors.text },
                    ]}
                  >
                    {bg}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <Field
          label="Allergies"
          value={allergies}
          onChangeText={setAllergies}
          placeholder="e.g. Penicillin, Peanuts"
          colors={colors}
        />

        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
          EMERGENCY CONTACT
        </Text>
        <Field
          label="Contact Name"
          value={emergencyName}
          onChangeText={setEmergencyName}
          colors={colors}
        />
        <Field
          label="Contact Phone"
          value={emergencyPhone}
          onChangeText={setEmergencyPhone}
          keyboardType="phone-pad"
          colors={colors}
        />

        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
    </View>
  );
}

function Field({ label, colors, ...props }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.inputBorder,
          { borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholderTextColor={colors.mutedText}
          {...props}
        />
      </View>
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
    marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: '900' },
  settingsBtn: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 16 },
  noteBox: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
  },
  noteText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputBorder: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 12 },
  input: { height: 44, fontSize: 13, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 4,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 12,
  },
  saveBtn: { marginTop: 8 },
});
