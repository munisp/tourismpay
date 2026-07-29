/**
 * J06 — Group MICE BNPL — Mobile Screen (Production)
 * Endpoint: journeyV2.startGroupMiceBnpl
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function GroupMiceBnplScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ "groupName": "", "paxCount": "", "totalAmountNgn": "", "eventDate": "" });
  const [selectedInstalments, setSelectedInstalments] = useState("2");

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const body: Record<string, any> = { ...form };
      if (form.paxCount) body.paxCount = parseFloat(form.paxCount);
      if (form.totalAmountNgn) body.totalAmountNgn = parseFloat(form.totalAmountNgn);
      body.instalments = selectedInstalments;
      const res = await request<any>("journeyV2.startGroupMiceBnpl", { method: "POST", body });
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
      <View style={[styles.header, { backgroundColor: "#ec4899" }]}>
        <Text style={styles.title}>J06 — Group MICE BNPL</Text>
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
          <Text style={styles.label}>Group Name</Text>
          <TextInput
            style={styles.input}
            value={form.groupName}
            onChangeText={v => setForm(f => ({ ...f, groupName: v }))}
            placeholder="Acme Corp Conference"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Number of Pax</Text>
          <TextInput
            style={styles.input}
            value={form.paxCount}
            onChangeText={v => setForm(f => ({ ...f, paxCount: v }))}
            placeholder="50"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Total Amount (NGN)</Text>
          <TextInput
            style={styles.input}
            value={form.totalAmountNgn}
            onChangeText={v => setForm(f => ({ ...f, totalAmountNgn: v }))}
            placeholder="5000000"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Event Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={form.eventDate}
            onChangeText={v => setForm(f => ({ ...f, eventDate: v }))}
            placeholder="2025-12-15"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Instalments</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity key="2" style={[styles.chip, selectedInstalments==="2"&&styles.chipActive]} onPress={()=>setSelectedInstalments("2")}><Text style={[styles.chipText, selectedInstalments==="2"&&styles.chipTextActive]}>2</Text></TouchableOpacity>
          <TouchableOpacity key="3" style={[styles.chip, selectedInstalments==="3"&&styles.chipActive]} onPress={()=>setSelectedInstalments("3")}><Text style={[styles.chipText, selectedInstalments==="3"&&styles.chipTextActive]}>3</Text></TouchableOpacity>
          <TouchableOpacity key="4" style={[styles.chip, selectedInstalments==="4"&&styles.chipActive]} onPress={()=>setSelectedInstalments("4")}><Text style={[styles.chipText, selectedInstalments==="4"&&styles.chipTextActive]}>4</Text></TouchableOpacity>
          <TouchableOpacity key="6" style={[styles.chip, selectedInstalments==="6"&&styles.chipActive]} onPress={()=>setSelectedInstalments("6")}><Text style={[styles.chipText, selectedInstalments==="6"&&styles.chipTextActive]}>6</Text></TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#ec4899" }]}
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
  chipActive: { borderColor: "#ec4899", backgroundColor: "#ec4899" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  button: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
