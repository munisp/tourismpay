/**
 * J04 — Open Banking Top-Up — Mobile Screen (Production)
 * Endpoint: journeyV2.startOpenBankingTopUp
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function OpenBankingTopUpScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ "bankConnectionId": "", "amountNgn": "", "bankCode": "", "accountNumber": "" });

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const body: Record<string, any> = { ...form };
      if (form.amountNgn) body.amountNgn = parseFloat(form.amountNgn);
      if (form.accountNumber) body.accountNumber = parseFloat(form.accountNumber);
      const res = await request<any>("journeyV2.startOpenBankingTopUp", { method: "POST", body });
      const data = res?.result?.data;
      setResult(data);
      Alert.alert("Success!", data?.message ?? "Submitted successfully.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.header, { backgroundColor: "#1a56db" }]}>
        <Text style={styles.title}>J04 — Open Banking Top-Up</Text>
        <Text style={styles.subtitle}>TourismPay · Journey V2</Text>
      </View>

      {result && (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>✓ Success!</Text>
          <Text style={styles.successText}>{result.message ?? JSON.stringify(result, null, 2).slice(0, 250)}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Enter Details</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bank Connection ID</Text>
          <TextInput
            style={styles.input}
            value={form.bankConnectionId}
            onChangeText={v => setForm(f => ({ ...f, bankConnectionId: v }))}
            placeholder="OBC-123"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Amount (NGN)</Text>
          <TextInput
            style={styles.input}
            value={form.amountNgn}
            onChangeText={v => setForm(f => ({ ...f, amountNgn: v }))}
            placeholder="50000"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bank Code</Text>
          <TextInput
            style={styles.input}
            value={form.bankCode}
            onChangeText={v => setForm(f => ({ ...f, bankCode: v }))}
            placeholder="058"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Account Number</Text>
          <TextInput
            style={styles.input}
            value={form.accountNumber}
            onChangeText={v => setForm(f => ({ ...f, accountNumber: v }))}
            placeholder="0123456789"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#1a56db" }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: { padding: 20, paddingTop: 28 },
  title: { fontSize: 20, fontWeight: "700", color: "#fff" },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  successCard: { margin: 16, backgroundColor: "#d1fae5", borderRadius: 12, padding: 14 },
  successTitle: { fontSize: 15, fontWeight: "700", color: "#065f46", marginBottom: 4 },
  successText: { fontSize: 12, color: "#065f46" },
  card: { margin: 16, backgroundColor: "#fff", borderRadius: 12, padding: 16, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 14, color: "#111827" },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "500", color: "#374151", marginBottom: 5 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 11, fontSize: 14, backgroundColor: "#f9fafb", color: "#111827" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#f9fafb" },
  chipActive: { borderColor: "#1a56db", backgroundColor: "#1a56db" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  button: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
