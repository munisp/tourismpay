import React, { useState } from "react";
import {
  View, Text, SafeAreaView, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import Card from "../../components/Card";
import { api } from "../../services/api";
import { offlineStore } from "../../services/offlineStore";
import { useConnectivity } from "../../hooks/useConnectivity";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const CURRENCIES = ["USD", "NGN", "KES", "GHS", "ZAR", "XOF", "TZS", "UGX"];

export default function PaymentScreen({ navigation }: { navigation: any }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { isConnected } = useConnectivity();

  const handleSend = async () => {
    if (!recipient || !amount) { Alert.alert("Error", "Enter recipient and amount"); return; }
    setLoading(true);
    try {
      if (isConnected) {
        const result = await api.sendPayment({
          recipientId: recipient,
          amount: parseFloat(amount),
          currency,
          note,
        });
        Alert.alert("Payment Sent", `Transaction ${result.transactionId}\nFee: ${result.fee} ${currency}`);
        navigation.goBack();
      } else {
        await offlineStore.enqueue({
          type: "payment",
          payload: { recipientId: recipient, amount: parseFloat(amount), currency, note },
        });
        Alert.alert("Queued Offline", "Payment will be sent when connection is restored.");
        navigation.goBack();
      }
    } catch {
      Alert.alert("Error", "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Card>
          <Text style={styles.label}>Recipient</Text>
          <TextInput style={styles.input} placeholder="Phone, email, or wallet ID"
            placeholderTextColor={colors.textMuted} value={recipient} onChangeText={setRecipient} />

          <Text style={styles.label}>Amount</Text>
          <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.textMuted}
            value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

          <Text style={styles.label}>Currency</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity key={c}
                style={[styles.currencyChip, currency === c && styles.currencyActive]}
                onPress={() => setCurrency(c)}>
                <Text style={[styles.currencyText, currency === c && styles.currencyTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput style={[styles.input, { height: 60 }]} placeholder="What's this for?"
            placeholderTextColor={colors.textMuted} value={note} onChangeText={setNote} multiline />
        </Card>

        {!isConnected && (
          <Card style={{ borderColor: colors.warning }}>
            <Text style={styles.offlineNote}>You're offline. Payment will be queued and sent automatically.</Text>
          </Card>
        )}

        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.white} /> : (
            <Text style={styles.sendText}>{isConnected ? "Send Payment" : "Queue Payment"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginTop: spacing.md, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  currencyRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  currencyChip: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.border },
  currencyActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  currencyText: { color: colors.textSecondary, fontSize: fontSize.sm },
  currencyTextActive: { color: colors.white },
  offlineNote: { color: colors.warning, fontSize: fontSize.sm },
  sendBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, padding: spacing.md, alignItems: "center", marginTop: spacing.lg },
  sendText: { color: colors.white, fontSize: fontSize.lg, fontWeight: "bold" },
});
