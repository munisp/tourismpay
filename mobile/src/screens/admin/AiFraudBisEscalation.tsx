/**
 * J19 — AI Fraud + BIS Escalation — Mobile Screen (Production)
 * Endpoint: journeyV2.startAiFraudBisEscalation
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function AiFraudBisEscalationScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ "suspectUserId": "", "transactionRef": "", "riskScore": "" });
  const [selectedTriggertype, setSelectedTriggertype] = useState("velocity_spike");

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const body: Record<string, any> = { ...form };
      if (form.riskScore) body.riskScore = parseFloat(form.riskScore);
      body.triggerType = selectedTriggertype;
      const res = await request<any>("journeyV2.startAiFraudBisEscalation", { method: "POST", body });
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
      <View style={[styles.header, { backgroundColor: "#dc2626" }]}>
        <Text style={styles.title}>J19 — AI Fraud + BIS Escalation</Text>
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
          <Text style={styles.label}>Suspect User ID</Text>
          <TextInput
            style={styles.input}
            value={form.suspectUserId}
            onChangeText={v => setForm(f => ({ ...f, suspectUserId: v }))}
            placeholder="user_123"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Transaction Reference</Text>
          <TextInput
            style={styles.input}
            value={form.transactionRef}
            onChangeText={v => setForm(f => ({ ...f, transactionRef: v }))}
            placeholder="TXN-ABC123"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Risk Score (0–100)</Text>
          <TextInput
            style={styles.input}
            value={form.riskScore}
            onChangeText={v => setForm(f => ({ ...f, riskScore: v }))}
            placeholder="75"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Triggertype</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity key="velocity_spike" style={[styles.chip, selectedTriggertype==="velocity_spike"&&styles.chipActive]} onPress={()=>setSelectedTriggertype("velocity_spike")}><Text style={[styles.chipText, selectedTriggertype==="velocity_spike"&&styles.chipTextActive]}>velocity_spike</Text></TouchableOpacity>
          <TouchableOpacity key="large_transaction" style={[styles.chip, selectedTriggertype==="large_transaction"&&styles.chipActive]} onPress={()=>setSelectedTriggertype("large_transaction")}><Text style={[styles.chipText, selectedTriggertype==="large_transaction"&&styles.chipTextActive]}>large_transaction</Text></TouchableOpacity>
          <TouchableOpacity key="geo_anomaly" style={[styles.chip, selectedTriggertype==="geo_anomaly"&&styles.chipActive]} onPress={()=>setSelectedTriggertype("geo_anomaly")}><Text style={[styles.chipText, selectedTriggertype==="geo_anomaly"&&styles.chipTextActive]}>geo_anomaly</Text></TouchableOpacity>
          <TouchableOpacity key="device_fingerprint" style={[styles.chip, selectedTriggertype==="device_fingerprint"&&styles.chipActive]} onPress={()=>setSelectedTriggertype("device_fingerprint")}><Text style={[styles.chipText, selectedTriggertype==="device_fingerprint"&&styles.chipTextActive]}>device_fingerprint</Text></TouchableOpacity>
          <TouchableOpacity key="account_takeover" style={[styles.chip, selectedTriggertype==="account_takeover"&&styles.chipActive]} onPress={()=>setSelectedTriggertype("account_takeover")}><Text style={[styles.chipText, selectedTriggertype==="account_takeover"&&styles.chipTextActive]}>account_takeover</Text></TouchableOpacity>
          <TouchableOpacity key="money_laundering" style={[styles.chip, selectedTriggertype==="money_laundering"&&styles.chipActive]} onPress={()=>setSelectedTriggertype("money_laundering")}><Text style={[styles.chipText, selectedTriggertype==="money_laundering"&&styles.chipTextActive]}>money_laundering</Text></TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#dc2626" }]}
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
  chipActive: { borderColor: "#dc2626", backgroundColor: "#dc2626" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  button: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
