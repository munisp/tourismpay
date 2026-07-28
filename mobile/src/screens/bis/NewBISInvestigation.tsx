/**
 * New BIS Investigation — multi-step form to submit a new investigation.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from "react-native";
import { request } from "../../services/api";

export function NewBISInvestigation({ navigation }: any) {
  const [step, setStep] = useState(1);
  const [subjectName, setSubjectName] = useState("");
  const [investigationType, setInvestigationType] = useState("employment_verification");
  const [priority, setPriority] = useState("medium");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const types = ["employment_verification", "criminal_record", "financial_check", "identity_verification", "reference_check"];
  const priorities = ["low", "medium", "high", "critical"];

  const handleSubmit = async () => {
    if (!subjectName) { Alert.alert("Error", "Enter subject name"); return; }
    setSubmitting(true);
    try {
      const result = await request<any>("bis.create", {
        method: "POST",
        body: { subjectName, investigationType, priority, notes },
      });
      Alert.alert("Success", `Investigation ${result.referenceNumber ?? "created"} submitted!`, [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>New Investigation</Text>
      <View style={s.stepBar}>
        {[1, 2, 3].map(n => (
          <View key={n} style={[s.stepDot, step >= n && s.stepDotActive]}>
            <Text style={[s.stepNum, step >= n && s.stepNumActive]}>{n}</Text>
          </View>
        ))}
      </View>
      {step === 1 && (
        <View style={s.form}>
          <Text style={s.sectionTitle}>Subject Details</Text>
          <Text style={s.label}>Subject Name *</Text>
          <TextInput style={s.input} placeholder="Full name" placeholderTextColor="#666" value={subjectName} onChangeText={setSubjectName} />
          <Text style={s.label}>Investigation Type</Text>
          {types.map(t => (
            <TouchableOpacity key={t} style={[s.optionRow, investigationType === t && s.optionRowActive]} onPress={() => setInvestigationType(t)}>
              <Text style={[s.optionText, investigationType === t && s.optionTextActive]}>{t.replace(/_/g, " ").replace(/\w/g, c => c.toUpperCase())}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.nextBtn} onPress={() => setStep(2)}>
            <Text style={s.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        </View>
      )}
      {step === 2 && (
        <View style={s.form}>
          <Text style={s.sectionTitle}>Priority & Notes</Text>
          <Text style={s.label}>Priority</Text>
          <View style={s.priorityRow}>
            {priorities.map(p => (
              <TouchableOpacity key={p} style={[s.priorityChip, priority === p && s.priorityChipActive]} onPress={() => setPriority(p)}>
                <Text style={[s.priorityText, priority === p && s.priorityTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>Additional Notes</Text>
          <TextInput style={[s.input, { height: 100, textAlignVertical: "top" }]} placeholder="Any additional context..." placeholderTextColor="#666" value={notes} onChangeText={setNotes} multiline />
          <View style={s.btnRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => setStep(1)}><Text style={s.backBtnText}>← Back</Text></TouchableOpacity>
            <TouchableOpacity style={s.nextBtn} onPress={() => setStep(3)}><Text style={s.nextBtnText}>Next →</Text></TouchableOpacity>
          </View>
        </View>
      )}
      {step === 3 && (
        <View style={s.form}>
          <Text style={s.sectionTitle}>Review & Submit</Text>
          <View style={s.reviewCard}>
            <Text style={s.reviewRow}><Text style={s.reviewLabel}>Subject: </Text>{subjectName}</Text>
            <Text style={s.reviewRow}><Text style={s.reviewLabel}>Type: </Text>{investigationType.replace(/_/g, " ")}</Text>
            <Text style={s.reviewRow}><Text style={s.reviewLabel}>Priority: </Text>{priority}</Text>
            {notes ? <Text style={s.reviewRow}><Text style={s.reviewLabel}>Notes: </Text>{notes}</Text> : null}
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => setStep(2)}><Text style={s.backBtnText}>← Back</Text></TouchableOpacity>
            <TouchableOpacity style={[s.submitBtn, submitting && s.disabledBtn]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 8, marginBottom: 16 },
  stepBar: { flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 24 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#2d2d44" },
  stepDotActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff20" },
  stepNum: { color: "#666", fontWeight: "700" },
  stepNumActive: { color: "#6c63ff" },
  form: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 4 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500" },
  input: { backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2d2d44" },
  optionRow: { backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#2d2d44" },
  optionRowActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff10" },
  optionText: { color: "#888", fontSize: 13 },
  optionTextActive: { color: "#6c63ff" },
  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priorityChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1a1a2e", borderWidth: 1, borderColor: "#2d2d44" },
  priorityChipActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff20" },
  priorityText: { color: "#888", fontSize: 12 },
  priorityTextActive: { color: "#6c63ff" },
  btnRow: { flexDirection: "row", gap: 10 },
  backBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "#2d2d44" },
  backBtnText: { color: "#888" },
  nextBtn: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 10, padding: 14, alignItems: "center" },
  nextBtnText: { color: "#fff", fontWeight: "600" },
  submitBtn: { flex: 1, backgroundColor: "#22c55e", borderRadius: 10, padding: 14, alignItems: "center" },
  disabledBtn: { opacity: 0.6 },
  submitText: { color: "#fff", fontWeight: "600" },
  reviewCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, gap: 8 },
  reviewRow: { color: "#ccc", fontSize: 13 },
  reviewLabel: { color: "#fff", fontWeight: "600" },
});
