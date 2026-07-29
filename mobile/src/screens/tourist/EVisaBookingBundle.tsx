/**
 * J05 — eVisa + Hotel Bundle — Mobile Screen (Production)
 * Endpoint: journeyV2.startEVisaDirectBooking
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function EVisaBookingBundleScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ "passportNumber": "", "nationality": "", "hotelId": "", "checkIn": "", "checkOut": "" });
  const [selectedVisatype, setSelectedVisatype] = useState("tourist");

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const body: Record<string, any> = { ...form };
      
      body.visaType = selectedVisatype;
      const res = await request<any>("journeyV2.startEVisaDirectBooking", { method: "POST", body });
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
      <View style={[styles.header, { backgroundColor: "#8b5cf6" }]}>
        <Text style={styles.title}>J05 — eVisa + Hotel Bundle</Text>
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
          <Text style={styles.label}>Passport Number</Text>
          <TextInput
            style={styles.input}
            value={form.passportNumber}
            onChangeText={v => setForm(f => ({ ...f, passportNumber: v }))}
            placeholder="A12345678"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nationality (2-letter)</Text>
          <TextInput
            style={styles.input}
            value={form.nationality}
            onChangeText={v => setForm(f => ({ ...f, nationality: v }))}
            placeholder="US"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Hotel ID</Text>
          <TextInput
            style={styles.input}
            value={form.hotelId}
            onChangeText={v => setForm(f => ({ ...f, hotelId: v }))}
            placeholder="hotel_123"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Check-In (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={form.checkIn}
            onChangeText={v => setForm(f => ({ ...f, checkIn: v }))}
            placeholder="2025-12-01"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Check-Out (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={form.checkOut}
            onChangeText={v => setForm(f => ({ ...f, checkOut: v }))}
            placeholder="2025-12-05"
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Visatype</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity key="tourist" style={[styles.chip, selectedVisatype==="tourist"&&styles.chipActive]} onPress={()=>setSelectedVisatype("tourist")}><Text style={[styles.chipText, selectedVisatype==="tourist"&&styles.chipTextActive]}>tourist</Text></TouchableOpacity>
          <TouchableOpacity key="business" style={[styles.chip, selectedVisatype==="business"&&styles.chipActive]} onPress={()=>setSelectedVisatype("business")}><Text style={[styles.chipText, selectedVisatype==="business"&&styles.chipTextActive]}>business</Text></TouchableOpacity>
          <TouchableOpacity key="transit" style={[styles.chip, selectedVisatype==="transit"&&styles.chipActive]} onPress={()=>setSelectedVisatype("transit")}><Text style={[styles.chipText, selectedVisatype==="transit"&&styles.chipTextActive]}>transit</Text></TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#8b5cf6" }]}
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
  chipActive: { borderColor: "#8b5cf6", backgroundColor: "#8b5cf6" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  button: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
