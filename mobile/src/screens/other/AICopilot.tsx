/**
 * AI Co-Pilot — Chat interface for travel assistance.
 */
import React, { useState, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { request } from "../../services/api";

interface Message { role: "user" | "assistant"; content: string; }

export function AICopilot({ navigation }: any) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I\'m TourismPay AI Co-Pilot. How can I help you plan your African adventure today?" }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setSending(true);
    try {
      const res = await request<any>("copilot.chat", {
        method: "POST",
        body: { message: userMsg, conversationHistory: messages.slice(-10) },
      });
      setMessages(prev => [...prev, { role: "assistant", content: res.response ?? res.message ?? "I\'m here to help!" }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I\'m having trouble connecting. Please try again." }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const suggestions = ["Best places to visit in Lagos?", "Currency exchange tips for Nigeria", "Safety tips for solo travelers", "Top tourist attractions in Nairobi"];

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={s.title}>AI Co-Pilot</Text>
      <ScrollView ref={scrollRef} style={s.messages} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.map((msg, idx) => (
          <View key={idx} style={[s.bubble, msg.role === "user" ? s.userBubble : s.aiBubble]}>
            <Text style={[s.bubbleText, msg.role === "user" ? s.userText : s.aiText]}>{msg.content}</Text>
          </View>
        ))}
        {sending && (
          <View style={s.aiBubble}>
            <ActivityIndicator size="small" color="#6c63ff" />
          </View>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
      {messages.length === 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.suggestions}>
          {suggestions.map((s_text, idx) => (
            <TouchableOpacity key={idx} style={s.suggestionChip} onPress={() => { setInput(s_text); }}>
              <Text style={s.suggestionText}>{s_text}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="Ask me anything about travel..."
          placeholderTextColor="#666"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity style={[s.sendBtn, (!input.trim() || sending) && s.disabledBtn]} onPress={handleSend} disabled={!input.trim() || sending}>
          <Text style={s.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", padding: 16, paddingBottom: 8 },
  messages: { flex: 1, padding: 16 },
  bubble: { maxWidth: "80%", borderRadius: 16, padding: 12, marginBottom: 8 },
  userBubble: { backgroundColor: "#6c63ff", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: "#1a1a2e", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: "#fff" },
  aiText: { color: "#e5e7eb" },
  suggestions: { paddingHorizontal: 16, marginBottom: 8 },
  suggestionChip: { backgroundColor: "#1a1a2e", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: "#2d2d44" },
  suggestionText: { color: "#888", fontSize: 12 },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#1a1a2e" },
  input: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#6c63ff", alignItems: "center", justifyContent: "center" },
  disabledBtn: { opacity: 0.5 },
  sendIcon: { color: "#fff", fontSize: 16 },
});
