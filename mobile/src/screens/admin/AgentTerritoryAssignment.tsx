/**
 * J17 — Agent Territory Assignment — Mobile Screen (Production)
 * Endpoint: journeyV2.startAgentTerritoryAssignment
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function AgentTerritoryAssignmentScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ "agentId": "", "city": "", "centerLat": "", "centerLng": "", "radiusKm": "" });
  const [selectedAgenttype, setSelectedAgenttype] = useState("field_agent");

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const body: Record<string, any> = { ...form };
      if (form.centerLat) body.centerLat = parseFloat(form.centerLat);
      if (form.centerLng) body.centerLng = parseFloat(form.centerLng);
      if (form.radiusKm) body.radiusKm = parseFloat(form.radiusKm);
      body.agentType = selectedAgenttype;
      const res = await request<any>("journeyV2.startAgentTerritoryAssignment", { method: "POST", body });
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
      <View style={[styles.header, { backgroundColor: "#b45309" }]}>
        <Text style={styles.title}>J17 — Agent Territory Assignment</Text>
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
          <Text style={styles.label}>Agent ID</Text>
          <TextInput
            style={styles.input}
            value={form.agentId}
            onChangeText={v => setForm(f => ({ ...f, agentId: v }))}
            placeholder="agent_123"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={form.city}
            onChangeText={v => setForm(f => ({ ...f, city: v }))}
            placeholder="Lagos"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Center Latitude</Text>
          <TextInput
            style={styles.input}
            value={form.centerLat}
            onChangeText={v => setForm(f => ({ ...f, centerLat: v }))}
            placeholder="6.5244"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Center Longitude</Text>
          <TextInput
            style={styles.input}
            value={form.centerLng}
            onChangeText={v => setForm(f => ({ ...f, centerLng: v }))}
            placeholder="3.3792"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Radius (km)</Text>
          <TextInput
            style={styles.input}
            value={form.radiusKm}
            onChangeText={v => setForm(f => ({ ...f, radiusKm: v }))}
            placeholder="10"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Agenttype</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity key="field_agent" style={[styles.chip, selectedAgenttype==="field_agent"&&styles.chipActive]} onPress={()=>setSelectedAgenttype("field_agent")}><Text style={[styles.chipText, selectedAgenttype==="field_agent"&&styles.chipTextActive]}>field_agent</Text></TouchableOpacity>
          <TouchableOpacity key="senior_agent" style={[styles.chip, selectedAgenttype==="senior_agent"&&styles.chipActive]} onPress={()=>setSelectedAgenttype("senior_agent")}><Text style={[styles.chipText, selectedAgenttype==="senior_agent"&&styles.chipTextActive]}>senior_agent</Text></TouchableOpacity>
          <TouchableOpacity key="regional_manager" style={[styles.chip, selectedAgenttype==="regional_manager"&&styles.chipActive]} onPress={()=>setSelectedAgenttype("regional_manager")}><Text style={[styles.chipText, selectedAgenttype==="regional_manager"&&styles.chipTextActive]}>regional_manager</Text></TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#b45309" }]}
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
  chipActive: { borderColor: "#b45309", backgroundColor: "#b45309" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  button: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
