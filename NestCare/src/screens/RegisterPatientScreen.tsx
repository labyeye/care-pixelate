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
import { AlertCircle } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import Button from '../components/Button';
import Header from '../components/Header';

// Patient self-signup into an existing clinic. The clinic code is the clinic's workspace slug.
export default function RegisterPatientScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { registerPatient } = useAuth();
  const [clinicCode, setClinicCode] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const checkClinic = async () => {
    setClinicName('');
    if (!clinicCode.trim()) return;
    try {
      const r = await authAPI.clinicLookup(clinicCode.trim().toLowerCase());
      setClinicName(r.data.name);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Clinic not found');
    }
  };

  const handleSubmit = async () => {
    if (!clinicCode.trim() || !name.trim() || !email.trim() || !phone.trim() || !password) {
      setError('Please fill in every field.');
      return;
    }
    if (name.trim().split(/s+/).length < 2) {
      setError('Enter your first and last name.');
      return;
    }
    if (!/^d{4}-d{2}-d{2}$/.test(dob) || isNaN(new Date(dob).getTime()) || new Date(dob) > new Date()) {
      setError('Enter your date of birth as YYYY-MM-DD.');
      return;
    }
    if (!gender) {
      setError('Please select your gender.');
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
      await registerPatient({
        clinicCode: clinicCode.trim().toLowerCase(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        dob,
        gender,
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
      <Header title="Join Your Clinic" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {!!error && (
          <View style={[styles.errorBox, { borderColor: colors.destructive }]}>
            <AlertCircle size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        )}

        <Field label="Clinic Code" value={clinicCode} onChangeText={setClinicCode} onBlur={checkClinic} placeholder="sunrise-clinic-a1b2c3" colors={colors} />
        {!!clinicName && <Text style={[styles.ok, { color: colors.success }]}>✓ {clinicName}</Text>}
        <Field label="Your Name" value={name} onChangeText={setName} placeholder="Rahul Sharma" autoCapitalize="words" colors={colors} />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" colors={colors} />
        <Field label="Mobile" value={phone} onChangeText={setPhone} placeholder="98765 43210" keyboardType="phone-pad" colors={colors} />
        <Field label="Date of Birth" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" colors={colors} />
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Gender</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['male', 'female', 'other', 'undisclosed'].map(g => (
              <TouchableOpacity
                key={g}
                onPress={() => setGender(g)}
                style={[styles.chip, { borderColor: colors.border }, gender === g && { backgroundColor: colors.primary }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: gender === g ? colors.white : colors.text }}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Field label="Password" value={password} onChangeText={setPassword} placeholder="Min 8 chars, Aa + number" secureTextEntry colors={colors} />
        <Field label="Confirm Password" value={confirm} onChangeText={setConfirm} placeholder="Re-enter password" secureTextEntry colors={colors} />

        <TouchableOpacity onPress={() => setAccepted(a => !a)} style={styles.consentRow}>
          <View style={[styles.checkbox, { borderColor: colors.border }, accepted && { backgroundColor: colors.primary }]} />
          <Text style={[styles.consentText, { color: colors.text }]}>
            I agree to the Terms of Service and Privacy Policy, and consent to my health data being stored by my clinic.
          </Text>
        </TouchableOpacity>

        <Button title="Create Account" onPress={handleSubmit} loading={loading} style={styles.submitBtn} />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedText }]}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={[styles.footerLink, { color: colors.primary }]}>Sign In</Text>
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
      <View style={[styles.inputBorder, { borderColor: colors.border, backgroundColor: colors.surface }]}>
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
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderRadius: 8, padding: 10, marginBottom: 16 },
  errorText: { fontSize: 12, fontWeight: '700', flex: 1 },
  ok: { fontSize: 12, fontWeight: '800', marginTop: -8, marginBottom: 14 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.3 },
  inputBorder: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 12 },
  input: { height: 46, fontSize: 14, fontWeight: '600' },
  chip: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  checkbox: { width: 20, height: 20, borderWidth: 2 },
  consentText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  submitBtn: { marginTop: 8, marginBottom: 20 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  footerText: { fontSize: 13, fontWeight: '500' },
  footerLink: { fontSize: 13, fontWeight: '800' },
});
