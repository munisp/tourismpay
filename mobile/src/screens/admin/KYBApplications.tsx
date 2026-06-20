/**
 * KYBApplications — KYB review queue from tRPC API with approve/reject.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from "react-native";
import { adminAPI } from "../../services/api";
import { biometricService } from "../../services/biometrics";

export function KYBApplications() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try { const data = await adminAPI.getKYBApplications(); setApplications(data); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleApprove = async (id: string, businessName: string) => {
    const auth = await biometricService.authenticate(`Approve KYB for ${businessName}`);
    if (!auth.success) { Alert.alert("Auth Required"); return; }

    try {
      await adminAPI.approveKYB(Number(id));
      Alert.alert("Approved", `${businessName} KYB approved`);
      await loadData();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed");
    }
  };

  const handleReject = async (id: string, businessName: string) => {
    Alert.alert("Reject KYB", `Reject ${businessName}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: async () => {
        try { await adminAPI.rejectKYB(Number(id), "Rejected via mobile"); await loadData(); } catch {}
      }},
    ]);
  };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  const pending = applications.filter(a => a.status === "pending");
  const reviewed = applications.filter(a => a.status !== "pending");

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <View style={s.stats}>
        <View style={s.statCard}><Text style={s.statNum}>{pending.length}</Text><Text style={s.statLabel}>Pending</Text></View>
        <View style={s.statCard}><Text style={[s.statNum, { color: "#22c55e" }]}>{reviewed.filter(a => a.status === "approved").length}</Text><Text style={s.statLabel}>Approved</Text></View>
        <View style={s.statCard}><Text style={[s.statNum, { color: "#ef4444" }]}>{reviewed.filter(a => a.status === "rejected").length}</Text><Text style={s.statLabel}>Rejected</Text></View>
      </View>

      {pending.length > 0 && <Text style={s.section}>Pending Review</Text>}
      {pending.map((app) => (
        <View key={app.id} style={s.appCard}>
          <Text style={s.appName}>{app.businessName}</Text>
          <Text style={s.appDetail}>{app.businessType} | {app.country ?? "Nigeria"}</Text>
          <Text style={s.appDate}>Submitted {new Date(app.createdAt).toLocaleDateString()}</Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(app.id, app.businessName)}>
              <Text style={s.approveBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.rejectBtn} onPress={() => handleReject(app.id, app.businessName)}>
              <Text style={s.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {reviewed.length > 0 && <Text style={s.section}>Reviewed</Text>}
      {reviewed.slice(0, 10).map((app) => (
        <View key={app.id} style={s.reviewedCard}>
          <Text style={s.appName}>{app.businessName}</Text>
          <View style={[s.statusBadge, { backgroundColor: app.status === "approved" ? "#22c55e22" : "#ef444422" }]}>
            <Text style={[s.statusText, { color: app.status === "approved" ? "#22c55e" : "#ef4444" }]}>{app.status}</Text>
          </View>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  stats: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statNum: { color: "#fff", fontSize: 20, fontWeight: "700" },
  statLabel: { color: "#888", fontSize: 10, marginTop: 4 },
  section: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 10 },
  appCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 10 },
  appName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  appDetail: { color: "#888", fontSize: 11, marginTop: 4 },
  appDate: { color: "#666", fontSize: 10, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: "#22c55e", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  approveBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  rejectBtn: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#ef4444" },
  rejectBtnText: { color: "#ef4444", fontSize: 12, fontWeight: "600" },
  reviewedCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
});
