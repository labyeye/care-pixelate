import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Info, MailCheck } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';
import Button from '../components/Button';

// Mock UI — no /api/auth/forgot-password endpoint exists on the backend yet.
export default function ForgotPasswordScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!email.trim()) {
      Alert.alert('Email required', 'Please enter your account email.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 900);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Forgot Password" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View
          style={[
            styles.noteBox,
            { borderColor: colors.warning, backgroundColor: colors.muted },
          ]}
        >
          <Info size={16} color={colors.warning} />
          <Text style={[styles.noteText, { color: colors.text }]}>
            UI-only mock. No password-reset endpoint exists on the backend yet.
          </Text>
        </View>

        {sent ? (
          <View style={styles.sentBox}>
            <View
              style={[
                styles.sentIcon,
                { borderColor: colors.border, backgroundColor: colors.success },
              ]}
            >
              <MailCheck size={28} color={colors.white} />
            </View>
            <Text style={[styles.heading, { color: colors.text }]}>
              Check your email
            </Text>
            <Text style={[styles.subheading, { color: colors.mutedText }]}>
              If an account exists for {email}, a reset link would be sent
              (mock).
            </Text>
            <Button
              title="Back to Sign In"
              onPress={() => navigation.replace('Login')}
              style={styles.btn}
            />
          </View>
        ) : (
          <>
            <Text style={[styles.heading, { color: colors.text }]}>
              Reset your password
            </Text>
            <Text style={[styles.subheading, { color: colors.mutedText }]}>
              Enter Email address and we'll send you a reset link.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <View
                style={[
                  styles.inputBorder,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedText}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <Button
              title="Send Reset Link"
              onPress={handleSend}
              loading={loading}
              style={styles.btn}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20 },
  noteBox: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 22,
  },
  noteText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  heading: { fontSize: 20, fontWeight: '900' },
  subheading: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 22,
    lineHeight: 18,
  },
  fieldGroup: { marginBottom: 20 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputBorder: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 12 },
  input: { height: 46, fontSize: 14, fontWeight: '600' },
  btn: { marginTop: 4 },
  sentBox: { alignItems: 'center', paddingTop: 20 },
  sentIcon: {
    width: 64,
    height: 64,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
});
