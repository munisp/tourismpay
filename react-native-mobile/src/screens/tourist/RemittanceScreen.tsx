import React, { useState, useEffect } from "react";
import {
  View, Text, SafeAreaView, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api, type ExchangeRate } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const CORRIDORS = [
  { from: "USD", to: "NGN", label: "US → Nigeria" },
  { from: "GBP", to: "KES", label: "UK → Kenya" },
  { from: "EUR", to: "GHS", label: "EU → Ghana" },
  { from: "USD", to: "ZAR", label: "US → South Africa" },
  { from: "USD", to: "TZS", label: "US → Tanzania" },
  { from: "USD", to: "UGX", label: "US → Uganda" },
];

export default function RemittanceScreen({ navigation }: { navigation: any }) {
  const [selectedCorridor, setSelectedCorridor] = useState(0);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getExchangeRates().then((r) => Array.isArray(r) && setRates(r)).catch(() => {});
  }, []);

  const corridor = CORRIDORS[selectedCorridor];
  const rate = rates.find((r) => r.from === corridor.from && r.to === corridor.to);
  const converted = amount ? (parseFloat(amount) * (rate?.rate ?? 1)).toFixed(2) : "0.00";
  const fee = amount ? (parseFloat(amount) * 0.015).toFixed(2) : "0.00";

  const handleSend = async () => {
    if (!amount || !recipient) { Alert.alert("Error", "Fill in all fields"); return; }
    setLoading(true);
    try {
      await api.sendPayment({ recipientId: recipient, amount: parseFloat(amount), currency: corridor.from });
      Alert.alert("Sent", `${corridor.from} ${amount} sent to ${recipient}`);
      navigation.goBack();
    } catch { Alert.alert("Error", "Transfer failed"); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Send Money</Text>

        <Card>
          <Text style={styles.label}>Select Corridor</Text>
          <View style={styles.corridorGrid}>
            {CORRIDORS.map((c, i) => (
              <TouchableOpacity key={c.label}
                style={[styles.corridorChip, i === selectedCorridor && styles.corridorActive]}
                onPress={() => setSelectedCorridor(i)}>
                <Text style={[styles.corridorText, i === selectedCorridor && styles.corridorTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <Text style={styles.label}>You Send ({corridor.from})</Text>
          <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.textMuted}
            value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

          <View style={styles.rateInfo}>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Exchange Rate</Text>
              <Text style={styles.rateValue}>1 {corridor.from} = {rate?.rate.toFixed(4) ?? "—"} {corridor.to}</Text>
            </View>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Fee (1.5%)</Text>
              <Text style={styles.rateValue}>{corridor.from} {fee}</Text>
            </View>
            <View style={[styles.rateRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }]}>
              <Text style={styles.recipientGets}>Recipient Gets</Text>
              <Text style={styles.recipientAmount}>{corridor.to} {converted}</Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.label}>Recipient Phone / Wallet ID</Text>
          <TextInput style={styles.input} placeholder="+234 XXX XXX XXXX"
            placeholderTextColor={colors.textMuted} value={recipient} onChangeText={setRecipient} />
        </Card>

        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.white} /> :
            <Text style={styles.sendText}>Send {corridor.from} {amount || "0.00"}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.xs },
  corridorGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  corridorChip: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border },
  corridorActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  corridorText: { color: colors.textSecondary, fontSize: fontSize.sm },
  corridorTextActive: { color: colors.white },
  input: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border, fontSize: fontSize.xl },
  rateInfo: { marginTop: spacing.md },
  rateRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs },
  rateLabel: { color: colors.textMuted, fontSize: fontSize.md },
  rateValue: { color: colors.text, fontSize: fontSize.md },
  recipientGets: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  recipientAmount: { color: colors.secondary, fontSize: fontSize.lg, fontWeight: "bold" },
  sendBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, padding: spacing.md, alignItems: "center", marginTop: spacing.lg },
  sendText: { color: colors.white, fontSize: fontSize.lg, fontWeight: "bold" },
});
