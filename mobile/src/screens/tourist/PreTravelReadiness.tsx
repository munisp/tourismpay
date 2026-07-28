/**
 * Pre-Travel Readiness — Checklist, bank notification, eSIM, risk assessment.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from "react-native";
import { request } from "../../services/api";

export function PreTravelReadiness({ navigation }: any) {
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [checklist, setChecklist] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  const handleGenerate = async () => {
    if (!destination || !departureDate) {
      Alert.alert("Error", "Please enter destination and departure date");
      return;
    }
    setGenerating(true);
    try {
      const data = await request<any>("travelReadiness.checklist.generate", {
        method: "POST",
        body: { destinationCountry: destination, departureDate },
      });
      setChecklist(data);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to generate checklist");
    } finally {
      setGenerating(false);
    }
  };

  const toggleItem = (id: string) => {
    setCompletedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const items: any[] = checklist?.items ?? [];
  const progress = items.length > 0 ? Math.round((completedItems.size / items.length) * 100) : 0;

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>Pre-Travel Readiness</Text>
      <View style={s.form}>
        <Text style={s.label}>Destination Country</Text>
        <TextInput style={s.input} placeholder="e.g. Nigeria, Kenya, Ghana" placeholderTextColor="#666" value={destination} onChangeText={setDestination} />
        <Text style={s.label}>Departure Date</Text>
        <TextInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor="#666" value={departureDate} onChangeText={setDepartureDate} />
        <TouchableOpacity style={[s.btn, generating && s.disabledBtn]} onPress={handleGenerate} disabled={generating}>
          {generating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Generate Checklist</Text>}
        </TouchableOpacity>
      </View>
      {checklist && (
        <View style={s.checklistSection}>
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>Progress: {progress}%</Text>
            <Text style={s.progressCount}>{completedItems.size}/{items.length} items</Text>
          </View>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${progress}%` as any }]} />
          </View>
          {items.map((item: any) => (
            <TouchableOpacity key={item.id} style={[s.checkItem, completedItems.has(item.id) && s.checkItemDone]} onPress={() => toggleItem(item.id)}>
              <View style={[s.checkbox, completedItems.has(item.id) && s.checkboxDone]}>
                {completedItems.has(item.id) && <Text style={s.checkmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.checkTitle, completedItems.has(item.id) && s.checkTitleDone]}>{item.title}</Text>
                {item.description && <Text style={s.checkDesc}>{item.description}</Text>}
              </View>
              <View style={[s.priorityBadge, item.priority === "high" && s.priorityHigh]}>
                <Text style={s.priorityText}>{item.priority ?? "medium"}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 8, marginBottom: 16 },
  form: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 16, gap: 12, marginBottom: 16 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500" },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2d2d44" },
  btn: { backgroundColor: "#6c63ff", borderRadius: 10, padding: 14, alignItems: "center" },
  disabledBtn: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "600" },
  checklistSection: { gap: 8 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  progressLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },
  progressCount: { color: "#888", fontSize: 12 },
  progressBar: { height: 6, backgroundColor: "#1a1a2e", borderRadius: 3, marginBottom: 12 },
  progressFill: { height: 6, backgroundColor: "#6c63ff", borderRadius: 3 },
  checkItem: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, gap: 12 },
  checkItemDone: { opacity: 0.6 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#6c63ff", alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: "#6c63ff" },
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "700" },
  checkTitle: { color: "#fff", fontSize: 14, fontWeight: "500" },
  checkTitleDone: { textDecorationLine: "line-through", color: "#888" },
  checkDesc: { color: "#888", fontSize: 12, marginTop: 2 },
  priorityBadge: { backgroundColor: "#f59e0b20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  priorityHigh: { backgroundColor: "#ef444420" },
  priorityText: { color: "#f59e0b", fontSize: 10, fontWeight: "600" },
});
