/**
 * MerchantQRCodes — QR code management from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from "react-native";
import { merchantAPI } from "../../services/api";

export function MerchantQRCodes() {
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await merchantAPI.getQRCodes(); setQrCodes(data); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await merchantAPI.generateQR({ amount: 0, currency: "USD", description: "Payment" });
      Alert.alert("QR Generated", "New payment QR code created");
      await loadData();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to generate QR");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <View style={s.header}>
        <Text style={s.title}>{qrCodes.length} QR Codes</Text>
        <TouchableOpacity style={s.genBtn} onPress={handleGenerate} disabled={generating}>
          <Text style={s.genBtnText}>{generating ? "Generating..." : "+ New QR"}</Text>
        </TouchableOpacity>
      </View>

      {qrCodes.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyEmoji}>📱</Text><Text style={s.emptyText}>No QR codes yet</Text></View>
      ) : (
        qrCodes.map((qr) => (
          <View key={qr.id} style={s.qrCard}>
            <View style={s.qrPreview}><Text style={s.qrIcon}>◻</Text></View>
            <View style={s.qrInfo}>
              <Text style={s.qrId}>QR #{qr.id?.slice(0, 8)}</Text>
              <Text style={s.qrAmount}>{qr.amount ? `$${qr.amount.toFixed(2)}` : "Any amount"}</Text>
              <Text style={s.qrDate}>{new Date(qr.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={[s.qrStatus, { backgroundColor: qr.paid ? "#22c55e22" : "#f59e0b22" }]}>
              <Text style={[s.qrStatusText, { color: qr.paid ? "#22c55e" : "#f59e0b" }]}>{qr.paid ? "Paid" : "Active"}</Text>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  genBtn: { backgroundColor: "#6c63ff", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  genBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  empty: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center", marginTop: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  qrCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  qrPreview: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  qrIcon: { fontSize: 24 },
  qrInfo: { flex: 1 },
  qrId: { color: "#fff", fontSize: 13, fontWeight: "500" },
  qrAmount: { color: "#6c63ff", fontSize: 12, marginTop: 2 },
  qrDate: { color: "#666", fontSize: 10, marginTop: 2 },
  qrStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  qrStatusText: { fontSize: 10, fontWeight: "600" },
});
