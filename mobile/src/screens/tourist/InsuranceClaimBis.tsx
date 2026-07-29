/**
 * J13 — Insurance Claim + BIS — Mobile Screen (Production)
 * Endpoint: journeyV2.startInsuranceClaim
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function InsuranceClaimBisScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ "policyId": "", "claimAmountNgn": "", "description": "" });
  const [selectedClaimtype, setSelectedClaimtype] = useState("medical");

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const body: Record<string, any> = { ...form };
      if (form.claimAmountNgn) body.claimAmountNgn = parseFloat(form.claimAmountNgn);
      body.claimType = selectedClaimtype;
      const res = await request<any>("journeyV2.startInsuranceClaim", { method: "POST", body });
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
      <View style={[styles.header, { backgroundColor: "#0369a1" }]}>
        <Text style={styles.title}>J13 — Insurance Claim + BIS</Text>
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
          <Text style={styles.label}>Policy ID</Text>
          <TextInput
            style={styles.input}
            value={form.policyId}
            onChangeText={v => setForm(f => ({ ...f, policyId: v }))}
            placeholder="POL-ABC123"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Claim Amount (NGN)</Text>
          <TextInput
            style={styles.input}
            value={form.claimAmountNgn}
            onChangeText={v => setForm(f => ({ ...f, claimAmountNgn: v }))}
            placeholder="50000"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={form.description}
            onChangeText={v => setForm(f => ({ ...f, description: v }))}
            placeholder="Medical emergency during trip"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Claimtype</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity key="medical" style={[styles.chip, selectedClaimtype==="medical"&&styles.chipActive]} onPress={()=>setSelectedClaimtype("medical")}><Text style={[styles.chipText, selectedClaimtype==="medical"&&styles.chipTextActive]}>medical</Text></TouchableOpacity>
          <TouchableOpacity key="trip_cancellation" style={[styles.chip, selectedClaimtype==="trip_cancellation"&&styles.chipActive]} onPress={()=>setSelectedClaimtype("trip_cancellation")}><Text style={[styles.chipText, selectedClaimtype==="trip_cancellation"&&styles.chipTextActive]}>trip_cancellation</Text></TouchableOpacity>
          <TouchableOpacity key="baggage_loss" style={[styles.chip, selectedClaimtype==="baggage_loss"&&styles.chipActive]} onPress={()=>setSelectedClaimtype("baggage_loss")}><Text style={[styles.chipText, selectedClaimtype==="baggage_loss"&&styles.chipTextActive]}>baggage_loss</Text></TouchableOpacity>
          <TouchableOpacity key="flight_delay" style={[styles.chip, selectedClaimtype==="flight_delay"&&styles.chipActive]} onPress={()=>setSelectedClaimtype("flight_delay")}><Text style={[styles.chipText, selectedClaimtype==="flight_delay"&&styles.chipTextActive]}>flight_delay</Text></TouchableOpacity>
          <TouchableOpacity key="emergency" style={[styles.chip, selectedClaimtype==="emergency"&&styles.chipActive]} onPress={()=>setSelectedClaimtype("emergency")}><Text style={[styles.chipText, selectedClaimtype==="emergency"&&styles.chipTextActive]}>emergency</Text></TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#0369a1" }]}
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
  chipActive: { borderColor: "#0369a1", backgroundColor: "#0369a1" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  button: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
