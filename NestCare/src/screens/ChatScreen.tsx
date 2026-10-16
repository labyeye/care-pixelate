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
import { Send } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Header from '../components/Header';

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
}

// Mock chat — no messaging backend exists yet; sent messages append locally only.
const INITIAL: Message[] = [
  { id: '1', text: 'Hi Doctor, I wanted to follow up on my last visit.', fromMe: true },
  { id: '2', text: 'Hello! Sure, how are you feeling now?', fromMe: false },
  { id: '3', text: 'Much better, the fever has gone down.', fromMe: true },
  { id: '4', text: 'Great, please continue the current dosage for a week.', fromMe: false },
];

export default function ChatScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const name = route.params?.name || 'Chat';
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [text, setText] = useState('');

  const send = () => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { id: String(Date.now()), text: text.trim(), fromMe: true }]);
    setText('');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title={name} onBack={() => navigation.goBack()} />
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
            <Text style={[styles.bubbleText, { color: item.fromMe ? colors.white : colors.text }]}>{item.text}</Text>
          </View>
        )}
      />
      <View style={[styles.inputRow, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <View style={[styles.inputBorder, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Type a message"
            placeholderTextColor={colors.mutedText}
            value={text}
            onChangeText={setText}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, { borderColor: colors.border, backgroundColor: colors.primary }]}
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
  bubble: { maxWidth: '78%', borderWidth: 2, borderRadius: 8, padding: 10, marginBottom: 4 },
  bubbleText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 2 },
  inputBorder: { flex: 1, borderWidth: 2, borderRadius: 8, paddingHorizontal: 12 },
  input: { height: 44, fontSize: 13, fontWeight: '600' },
  sendBtn: { width: 44, height: 44, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
