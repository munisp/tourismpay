/**
 * J01 — BNPL Hotel Booking (Mobile)
 */
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { request } from "../../services/api";

export default function BnplHotelBookingScreen({ navigation }: any) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ hotelId: "", checkIn: "", checkOut: "", totalAmountNgn: "", instalments: "3" });

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const res = await request<any>("bnpl.myPlans", { method: "GET" });
      setPlans(Array.isArray(res?.result?.data) ? res.result.data : []);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!form.hotelId || !form.totalAmountNgn || !form.checkIn || !form.checkOut) {
      Alert.alert("Validation", "Please fill all required fields");
      return;
    }
    try {
      setSubmitting(true);
      const res = await request<any>("journeyV2.startBnplHotelBooking", {
        method: "POST",
        body: { hotelId: form.hotelId, checkIn: form.checkIn, checkOut: form.checkOut, totalAmountNgn: parseFloat(form.totalAmountNgn), instalments: parseInt(form.instalments), currency: "NGN" },
      });
      Alert.alert("Success!", res?.result?.data?.message ?? "BNPL booking confirmed!");
      setForm({ hotelId: "", checkIn: "", checkOut: "", totalAmountNgn: "", instalments: "3" });
      loadPlans();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BNPL Hotel Booking</Text>
        <Text style={styles.subtitle}>Split hotel payments into easy instalments</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>New Booking</Text>
        {[
          { key: "hotelId", label: "Hotel ID", placeholder: "hotel_123" },
          { key: "checkIn", label: "Check-In (YYYY-MM-DD)", placeholder: "2025-12-01" },
          { key: "checkOut", label: "Check-Out (YYYY-MM-DD)", placeholder: "2025-12-05" },
          { key: "totalAmountNgn", label: "Total Amount (NGN)", placeholder: "250000", numeric: true },
        ].map(({ key, label, placeholder, numeric }) => (
          <View key={key} style={styles.inputGroup}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              value={(form as any)[key]}
              onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
              placeholder={placeholder}
              keyboardType={numeric ? "numeric" : "default"}
            />
          </View>
        ))}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Instalments</Text>
          <View style={styles.row}>
            {["2", "3", "4", "6", "12"].map(n => (
              <TouchableOpacity key={n} style={[styles.chip, form.instalments === n && styles.chipActive]} onPress={() => setForm(f => ({ ...f, instalments: n }))}>
                <Text style={[styles.chipText, form.instalments === n && styles.chipTextActive]}>{n}x</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={styles.button} onPress={handleBook} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Book with BNPL</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My BNPL Plans</Text>
        {loading ? <ActivityIndicator color="#6c63ff" /> : plans.length === 0 ? (
          <Text style={styles.empty}>No BNPL plans yet.</Text>
        ) : plans.map((p: any) => (
          <View key={p.id} style={styles.planCard}>
            <Text style={styles.planId}>{p.id}</Text>
            <Text style={styles.planDetail}>₦{Number(p.instalment_amount).toLocaleString()} × {p.instalments} instalments</Text>
            <View style={[styles.badge, { backgroundColor: p.status === "active" ? "#d1fae5" : "#f3f4f6" }]}>
              <Text style={{ color: p.status === "active" ? "#065f46" : "#374151", fontSize: 12 }}>{p.status}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: { padding: 20, backgroundColor: "#6c63ff" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff" },
  subtitle: { fontSize: 14, color: "#e0e7ff", marginTop: 4 },
  card: { margin: 16, backgroundColor: "#fff", borderRadius: 12, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12, color: "#111827" },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 13, color: "#374151", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: "#f9fafb" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#f9fafb" },
  chipActive: { backgroundColor: "#6c63ff", borderColor: "#6c63ff" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff" },
  button: { backgroundColor: "#6c63ff", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  section: { margin: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12, color: "#111827" },
  empty: { color: "#9ca3af", textAlign: "center", padding: 20 },
  planCard: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  planId: { fontSize: 13, fontWeight: "600", color: "#111827" },
  planDetail: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginTop: 6 },
});
