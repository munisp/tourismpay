import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { trpc } from '../../lib/trpc';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function ConciergeScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm your TourismPay AI Concierge 🌍\n\nI can help you with:\n• Finding the best deals and experiences\n• Booking recommendations\n• Travel tips across Africa\n• Currency and payment questions\n\nHow can I help you today?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const sendMutation = trpc.touristPortal.sendConciergeMessage.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply ?? 'I apologize, I could not process your request. Please try again.',
          timestamp: Date.now(),
        },
      ]);
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${err.message}. Please try again.`,
          timestamp: Date.now(),
        },
      ]);
    },
  });

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;

    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    sendMutation.mutate({ message: text });
  };

  const quickPrompts = [
    'Best safari packages this month',
    'Cheapest flights to Nairobi',
    'Top-rated restaurants in Accra',
    'How do I pay with TourismPay?',
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
      >
        {messages.map((msg, i) => (
          <View key={i} style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            {msg.role === 'assistant' && (
              <Text style={styles.aiLabel}>🤖 Concierge</Text>
            )}
            <Text style={[styles.messageText, msg.role === 'user' ? styles.userText : styles.aiText]}>
              {msg.content}
            </Text>
            <Text style={[styles.timestamp, msg.role === 'user' ? styles.userTimestamp : styles.aiTimestamp]}>
              {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ))}
        {sendMutation.isPending && (
          <View style={[styles.messageBubble, styles.aiBubble]}>
            <Text style={styles.aiLabel}>🤖 Concierge</Text>
            <View style={styles.typingIndicator}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.typingText}>Thinking...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickPrompts}>
          {quickPrompts.map((prompt) => (
            <TouchableOpacity
              key={prompt}
              style={styles.quickPromptChip}
              onPress={() => { setInput(prompt); }}
            >
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask your concierge..."
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sendMutation.isPending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  messageList: { flex: 1 },
  messageListContent: { padding: 16, paddingBottom: 8 },
  messageBubble: { maxWidth: '85%', marginBottom: 12, borderRadius: 16, padding: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  aiLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 4 },
  messageText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff' },
  aiText: { color: '#1e293b' },
  timestamp: { fontSize: 10, marginTop: 4 },
  userTimestamp: { color: '#bfdbfe', textAlign: 'right' },
  aiTimestamp: { color: '#94a3b8' },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  quickPrompts: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 0 },
  quickPromptChip: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
  quickPromptText: { fontSize: 12, color: '#2563eb', fontWeight: '500' },
  inputRow: { flexDirection: 'row', padding: 12, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#1e293b', maxHeight: 100, backgroundColor: '#f8fafc' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#93c5fd' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 24 },
});
