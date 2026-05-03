import React, { useState, useRef } from "react";
import {
  View, Text, SafeAreaView, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const SUGGESTIONS = [
  "Best restaurants in Lagos",
  "Visa requirements for Kenya",
  "Safari tours near Nairobi",
  "Currency exchange tips",
  "Safety tips for solo travelers",
];

export default function CopilotScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await api.getCopilotResponse(text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.message,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I'm unable to respond right now. Please check your connection and try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {messages.length === 0 ? (
          <View style={styles.welcomeContainer}>
            <Ionicons name="chatbubble-ellipses" size={64} color={colors.primary} />
            <Text style={styles.welcomeTitle}>AI Travel Co-Pilot</Text>
            <Text style={styles.welcomeSubtitle}>Ask me anything about your trip</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} style={styles.suggestionChip} onPress={() => sendMessage(s)}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            renderItem={({ item }) => (
              <View style={[styles.messageBubble, item.role === "user" ? styles.userBubble : styles.botBubble]}>
                <Text style={[styles.messageText, item.role === "user" && styles.userText]}>{item.content}</Text>
              </View>
            )}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your trip..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => sendMessage(input)} disabled={loading || !input.trim()}>
            <Ionicons name={loading ? "hourglass" : "send"} size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  welcomeContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  welcomeTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginTop: spacing.md },
  welcomeSubtitle: { color: colors.textSecondary, fontSize: fontSize.md, marginTop: spacing.xs },
  suggestions: { marginTop: spacing.xl, gap: spacing.sm, width: "100%" },
  suggestionChip: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  suggestionText: { color: colors.text, fontSize: fontSize.md },
  messageList: { padding: spacing.md },
  messageBubble: { maxWidth: "80%", padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.sm },
  userBubble: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  botBubble: { backgroundColor: colors.surface, alignSelf: "flex-start" },
  messageText: { color: colors.text, fontSize: fontSize.md },
  userText: { color: colors.white },
  inputRow: { flexDirection: "row", alignItems: "flex-end", padding: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, color: colors.text, maxHeight: 100, borderWidth: 1, borderColor: colors.border },
  sendBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.full, width: 44, height: 44, justifyContent: "center", alignItems: "center" },
});
