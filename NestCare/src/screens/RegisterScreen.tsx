import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { AlertCircle, Info } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';
import Header from '../components/Header';

// Matches backend Tenant.orgType enum — see nest-care/backend/models/Tenant.js
const ORG_TYPES = [
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'individual_doctor', label: 'Individual Doctor' },
  { value: 'multi_speciality_hospital', label: 'Multi-Speciality Hospital' },
  { value: 'diagnostic_center', label: 'Diagnostic Center' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'medical_college', label: 'Medical College' },
  { value: 'corporate_healthcare', label: 'Corporate Healthcare' },
  { value: 'ngo_healthcare', label: 'NGO Healthcare' },
  { value: 'telemedicine_company', label: 'Telemedicine Company' },
];

export default function RegisterScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { register } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState(ORG_TYPES[1].value);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [doctorCount, setDoctorCount] = useState('1');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (
      !orgName.trim() ||
      !ownerName.trim() ||
      !email.trim() ||
      !password.trim() ||
      !phone.trim() ||
      !city.trim() ||
      !stateName.trim()
    ) {
      setError('Please fill in every field.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!accepted) {
      setError('Please accept the Terms and Privacy Policy.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register({
        orgName: orgName.trim(),
        orgType,
        ownerName: ownerName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        city: city.trim(),
        state: stateName.trim(),
        doctorCount: Math.max(1, parseInt(doctorCount, 10) || 1),
        password,
        acceptTerms: true,
      });
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Create Account" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.noteBox,
            { borderColor: colors.primary, backgroundColor: colors.muted },
          ]}
        >
          <Info size={16} color={colors.primary} />
          <Text style={[styles.noteText, { color: colors.text }]}>
            The NestDoc backend currently only supports registering a new
            organisation (tenant) and its owner account. Self-service signup for
            a patient joining an existing clinic/hospital is not yet a backend
            capability — that will need a dedicated patient-invite or
            self-registration endpoint in a future milestone.
          </Text>
        </View>

        {!!error && (
          <View style={[styles.errorBox, { borderColor: colors.destructive }]}>
            <AlertCircle size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {error}
            </Text>
          </View>
        )}

        <Field
          label="Organisation Name"
          value={orgName}
          onChangeText={setOrgName}
          placeholder="Sunrise Clinic"
          colors={colors}
        />

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>
            Organisation Type
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
          >
            {ORG_TYPES.map(t => (
              <TouchableOpacity
                key={t.value}
                onPress={() => setOrgType(t.value)}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  orgType === t.value && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: orgType === t.value ? colors.white : colors.text },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <Field
          label="Owner Name"
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="Dr. Jane Doe"
          colors={colors}
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          colors={colors}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Min 8 chars, Aa + number"
          secureTextEntry
          colors={colors}
        />
        <Field
          label="Confirm Password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Re-enter password"
          secureTextEntry
          colors={colors}
        />
        <Field
          label="Mobile (WhatsApp)"
          value={phone}
          onChangeText={setPhone}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          colors={colors}
        />
        <Field
          label="City"
          value={city}
          onChangeText={setCity}
          placeholder="Pune"
          autoCapitalize="words"
          colors={colors}
        />
        <Field
          label="State"
          value={stateName}
          onChangeText={setStateName}
          placeholder="Maharashtra"
          autoCapitalize="words"
          colors={colors}
        />
        <Field
          label="Number of Doctors"
          value={doctorCount}
          onChangeText={setDoctorCount}
          keyboardType="number-pad"
          colors={colors}
        />
        <TouchableOpacity
          onPress={() => setAccepted(a => !a)}
          style={styles.consentRow}
        >
          <View
            style={[
              styles.checkbox,
              { borderColor: colors.border },
              accepted && { backgroundColor: colors.primary },
            ]}
          />
          <Text style={[styles.noteText, { color: colors.text }]}>
            I agree to the Terms of Service and Privacy Policy, and consent to
            my data being processed to run my workspace.
          </Text>
        </TouchableOpacity>

        <Button
          title="Create Account"
          onPress={handleSubmit}
          loading={loading}
          style={styles.submitBtn}
        />

        <View style={styles.footerRow}>
          <TouchableOpacity
            onPress={() => navigation.navigate('RegisterPatient')}
          >
            <Text style={[styles.footerLink, { color: colors.secondary }]}>
              Joining a clinic as a patient?
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedText }]}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={[styles.footerLink, { color: colors.primary }]}>
              Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
          autoCapitalize="none"
          {...props}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 20 },
  noteBox: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
  },
  noteText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  errorText: { fontSize: 12, fontWeight: '700', flex: 1 },
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  inputBorder: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 12 },
  input: { height: 46, fontSize: 14, fontWeight: '600' },
  chipsRow: { flexDirection: 'row' },
  chip: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  checkbox: { width: 20, height: 20, borderWidth: 2 },
  submitBtn: { marginTop: 8, marginBottom: 20 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  footerText: { fontSize: 13, fontWeight: '500' },
  footerLink: { fontSize: 13, fontWeight: '800' },
});
