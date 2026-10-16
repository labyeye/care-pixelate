import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Info } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import Button from '../components/Button';

const LENGTH = 6;

// UI-only placeholder: no phone-auth/OTP endpoint exists on the backend yet.
// This screen mocks verification locally to demonstrate the intended flow
// for a future phone-auth milestone.
export default function OTPScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const inputs = useRef<Array<TextInput | null>>([]);
  const [loading, setLoading] = useState(false);

  const handleChange = (value: string, index: number) => {
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
    if (value && index < LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleVerify = () => {
    const code = digits.join('');
    if (code.length !== LENGTH) {
      Alert.alert('Incomplete code', 'Please enter all 6 digits.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        'Mock verification',
        'This is a UI-only placeholder — there is no real OTP backend yet. Please sign in with email and password instead.',
        [{ text: 'OK', onPress: () => navigation.replace('Login') }],
      );
    }, 900);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Verify OTP" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View style={[styles.noteBox, { borderColor: colors.warning, backgroundColor: colors.muted }]}>
          <Info size={16} color={colors.warning} />
          <Text style={[styles.noteText, { color: colors.text }]}>
            UI-only placeholder. No phone-auth/OTP endpoint exists on the backend yet.
          </Text>
        </View>

        <Text style={[styles.heading, { color: colors.text }]}>Enter the 6-digit code</Text>
        <Text style={[styles.subheading, { color: colors.mutedText }]}>
          Sent to your registered mobile number
        </Text>

        <View style={styles.otpRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={ref => {
                inputs.current[i] = ref;
              }}
              value={d}
              onChangeText={v => handleChange(v, i)}
              keyboardType="number-pad"
              maxLength={1}
              style={[styles.otpBox, { borderColor: colors.border, color: colors.text }]}
            />
          ))}
        </View>

        <Button title="Verify" onPress={handleVerify} loading={loading} style={styles.verifyBtn} />

        <Text style={[styles.resend, { color: colors.primary }]} onPress={() => Alert.alert('Mock', 'Code resent (mock).')}>
          Resend code
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20 },
  noteBox: { flexDirection: 'row', gap: 10, borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 22 },
  noteText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  heading: { fontSize: 20, fontWeight: '900' },
  subheading: { fontSize: 13, fontWeight: '500', marginTop: 4, marginBottom: 24 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  otpBox: {
    width: 46,
    height: 54,
    borderWidth: 2,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
  },
  verifyBtn: { marginBottom: 18 },
  resend: { textAlign: 'center', fontSize: 13, fontWeight: '800' },
});
