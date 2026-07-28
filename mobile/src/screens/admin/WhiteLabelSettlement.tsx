/**
 * J18 — White Label Settlement (Mobile)
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function WhiteLabelSettlementScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const res = await request<any>("journeyV2.startWhiteLabelSettlement", {
        method: "POST",
        body: fields,
      });
      const data = res?.result?.data;
      setResult(data);
      Alert.alert("Success!", data?.message ?? "Action completed successfully.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>J18 — White Label Settlement</Text>
        <Text style={styles.subtitle}>TourismPay Journey V2</Text>
      </View>

      {result && (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>✓ Success!</Text>
          <Text style={styles.successText}>{JSON.stringify(result, null, 2).slice(0, 300)}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Enter Details</Text>
        {["field1", "field2", "field3"].map(key => (
          <View key={key} style={styles.inputGroup}>
            <Text style={styles.label}>{key.replace("field", "Field ")}</Text>
            <TextInput
              style={styles.input}
              value={fields[key] ?? ""}
              onChangeText={v => setFields(f => ({ ...f, [key]: v }))}
              placeholder={`Enter ${key}`}
            />
          </View>
        ))}
        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: { padding: 20, backgroundColor: "#6c63ff" },
  title: { fontSize: 20, fontWeight: "700", color: "#fff" },
  subtitle: { fontSize: 13, color: "#e0e7ff", marginTop: 4 },
  successCard: { margin: 16, backgroundColor: "#d1fae5", borderRadius: 12, padding: 14 },
  successTitle: { fontSize: 15, fontWeight: "700", color: "#065f46", marginBottom: 4 },
  successText: { fontSize: 12, color: "#065f46", fontFamily: "monospace" },
  card: { margin: 16, backgroundColor: "#fff", borderRadius: 12, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12, color: "#111827" },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 13, color: "#374151", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: "#f9fafb" },
  button: { backgroundColor: "#6c63ff", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
