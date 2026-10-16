import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { User } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { meAPI } from '../services/api';
import Header from '../components/Header';
import Button from '../components/Button';

// The call itself runs in the Jitsi room the server hands out (opens in the Jitsi app / browser).
// The server enforces the join window (15 min before until 30 min after the slot).
export default function VideoCallScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { appointmentId, doctorName } = route.params || {};
  const [state, setState] = useState<'loading' | 'ready' | 'blocked'>('loading');
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!appointmentId) {
      setState('blocked');
      setMessage('Open a video appointment to join its call.');
      return;
    }
    meAPI
      .videoLink(appointmentId)
      .then(r => {
        setUrl(r.data.url);
        setState('ready');
      })
      .catch((e: any) => {
        setMessage(e.message || 'Could not open the call.');
        setState('blocked');
      });
  }, [appointmentId]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Header title="Video Consult" onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.primary }]}>
          <User size={40} color={colors.white} />
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{doctorName || 'Your doctor'}</Text>

        {state === 'loading' && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        {state === 'blocked' && <Text style={[styles.msg, { color: colors.mutedText }]}>{message}</Text>}
        {state === 'ready' && (
          <Button title="Join call" onPress={() => Linking.openURL(url)} style={styles.btn} />
        )}
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.primary }]}>Back to appointment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  avatar: { width: 96, height: 96, borderWidth: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '900' },
  msg: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  btn: { marginTop: 16, alignSelf: 'stretch' },
  back: { fontSize: 13, fontWeight: '800', marginTop: 16 },
});
