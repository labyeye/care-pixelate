import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send, Sparkles } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
}

// Mock "AI health assistant" — no real LLM call is made. A couple of canned
// responses are echoed locally to demonstrate the intended UI/flow.
const CANNED_REPLIES = [
  "I'm a demo assistant right now, but here's a general tip: stay hydrated and get consistent sleep — both support recovery and immunity.",
  'For anything urgent, please use the Emergency tab or contact your doctor directly through Messages.',
  "That's a great question for your doctor — you can book a follow-up from the Appointments tab.",
];

export default function AIAssistantScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', text: 'Hi! I am your NestCare AI Assistant (demo). Ask me anything about your health.', fromMe: false },
  ]);
  const [text, setText] = useState('');
  const [replyIndex, setReplyIndex] = useState(0);

  const send = () => {
    if (!text.trim()) return;
    const userMsg: Message = { id: String(Date.now()), text: text.trim(), fromMe: true };
    setMessages(prev => [...prev, userMsg]);
    setText('');
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { id: String(Date.now() + 1), text: CANNED_REPLIES[replyIndex % CANNED_REPLIES.length], fromMe: false },
      ]);
      setReplyIndex(i => i + 1);
    }, 700);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="AI Health Assistant" subtitle="Demo — not real medical advice" onBack={() => navigation.goBack()} />
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              { borderColor: colors.border },
              item.fromMe
                ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                : { alignSelf: 'flex-start', backgroundColor: colors.surface },
            ]}
          >
            {!item.fromMe && (
              <View style={styles.aiTag}>
                <Sparkles size={11} color={colors.secondary} />
                <Text style={[styles.aiTagText, { color: colors.secondary }]}>AI (mock)</Text>
              </View>
            )}
            <Text style={[styles.bubbleText, { color: item.fromMe ? colors.white : colors.text }]}>{item.text}</Text>
          </View>
        )}
      />
      <View style={[styles.inputRow, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <View style={[styles.inputBorder, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Ask the assistant..."
            placeholderTextColor={colors.mutedText}
            value={text}
            onChangeText={setText}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
          onPress={send}
        >
          <Send size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { padding: 16, gap: 10 },
  bubble: { maxWidth: '82%', borderWidth: 2, borderRadius: 8, padding: 10, marginBottom: 4 },
  aiTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  aiTagText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  bubbleText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 2 },
  inputBorder: { flex: 1, borderWidth: 2, borderRadius: 8, paddingHorizontal: 12 },
  input: { height: 44, fontSize: 13, fontWeight: '600' },
  sendBtn: { width: 44, height: 44, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
