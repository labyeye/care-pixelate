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
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartPulse, Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';

export default function LoginScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandStrip}>
          <View
            style={[
              styles.logoBox,
              { borderColor: colors.border, backgroundColor: colors.primary },
            ]}
          >
            <HeartPulse size={26} color={colors.white} />
          </View>
          <View>
            <Text style={[styles.brandName, { color: colors.text }]}>
              NestCare
            </Text>
            <Text style={[styles.brandSub, { color: colors.mutedText }]}>
              Patient app
            </Text>
          </View>
        </View>

        <Text style={[styles.heading, { color: colors.text }]}>
          Welcome back
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedText }]}>
          Sign in to your account
        </Text>

        {!!error && (
          <View style={[styles.errorBox, { borderColor: colors.destructive }]}>
            <AlertCircle size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {error}
            </Text>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Email</Text>
          <View
            style={[
              styles.inputBorder,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedText}
              value={email}
              onChangeText={v => {
                setEmail(v);
                setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Password</Text>
          <View
            style={[
              styles.inputBorder,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <TextInput
              style={[styles.input, { flex: 1, color: colors.text }]}
              placeholder="Your password"
              placeholderTextColor={colors.mutedText}
              value={password}
              onChangeText={v => {
                setPassword(v);
                setError('');
              }}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPw(v => !v)}
            >
              {showPw ? (
                <EyeOff size={18} color={colors.mutedText} />
              ) : (
                <Eye size={18} color={colors.mutedText} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          style={styles.forgotLink}
        >
          <Text style={[styles.forgotText, { color: colors.primary }]}>
            Forgot password?
          </Text>
        </TouchableOpacity>

        <Button
          title="Sign In"
          onPress={handleSubmit}
          loading={loading}
          style={styles.submitBtn}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedText }]}>
            Don't have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={[styles.footerLink, { color: colors.primary }]}>
              Register
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('OTP')}
          style={styles.otpLink}
        >
          <Text style={[styles.footerLink, { color: colors.secondary }]}>
            Sign in with OTP instead
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: 24 },
  brandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  logoBox: {
    width: 48,
    height: 48,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 18, fontWeight: '900' },
  brandSub: { fontSize: 12, fontWeight: '600' },
  heading: { fontSize: 26, fontWeight: '900' },
  subheading: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 20,
  },
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
  inputBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  input: { flex: 1, height: 46, fontSize: 14, fontWeight: '600' },
  eyeBtn: { padding: 6 },
  forgotLink: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotText: { fontSize: 12, fontWeight: '700' },
  submitBtn: { marginBottom: 20 },
  footerRow: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: 13, fontWeight: '500' },
  footerLink: { fontSize: 13, fontWeight: '800' },
  otpLink: { alignItems: 'center', marginTop: 16 },
});
