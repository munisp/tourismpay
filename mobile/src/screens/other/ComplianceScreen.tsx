/**
 * ComplianceScreen — Full compliance dashboard matching PWA parity.
 * Covers: KYB stats, compliance score distribution, audit log stream,
 * pending applications quick-actions, and PDF report generation.
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl, ActivityIndicator } from "react-native";
import { adminAPI } from "../../services/api";

export function ComplianceScreen({ navigation }: any) {
  const [stats, setStats] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [distribution, setDistribution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, audit, pend, dist] = await Promise.all([
        adminAPI.getKYBStats?.() ?? {},
        adminAPI.getAuditLog?.({ limit: 20 }) ?? { logs: [] },
        adminAPI.getPendingKYB?.({ status: "submitted", limit: 5 }) ?? { items: [] },
        adminAPI.getComplianceScoreDistribution?.() ?? [],
      ]);
      setStats(s);
      setAuditLog((audit as any)?.logs ?? (Array.isArray(audit) ? audit : []));
      setPending((pend as any)?.items ?? (Array.isArray(pend) ? pend : []));
      setDistribution(Array.isArray(dist) ? dist : []);
    } catch { /* empty state */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGeneratePDF = async () => {
    setGeneratingPdf(true);
    try {
      await adminAPI.generateCompliancePDF?.();
      Alert.alert("✅ PDF Generated", "Your compliance report PDF will be emailed to you.");
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setGeneratingPdf(false); }
  };

  const handleApproveKYB = async (id: number) => {
    try {
      await adminAPI.reviewKYBApplication?.({ id, action: "approve" });
      Alert.alert("✅ Approved");
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleRejectKYB = async (id: number) => {
    try {
      await adminAPI.reviewKYBApplication?.({ id, action: "reject" });
      Alert.alert("Rejected");
      load();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;

  const maxDist = Math.max(...distribution.map((d: any) => d.count ?? 0), 1);

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6c63ff" />}>
      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statNum}>{stats?.total ?? 0}</Text><Text style={s.statLabel}>Total</Text></View>
        <View style={s.stat}><Text style={[s.statNum, { color: "#10b981" }]}>{stats?.approved ?? 0}</Text><Text style={s.statLabel}>Approved</Text></View>
        <View style={s.stat}><Text style={[s.statNum, { color: "#f59e0b" }]}>{stats?.pending ?? 0}</Text><Text style={s.statLabel}>Pending</Text></View>
        <View style={s.stat}><Text style={[s.statNum, { color: "#ef4444" }]}>{stats?.rejected ?? 0}</Text><Text style={s.statLabel}>Rejected</Text></View>
      </View>

      {/* PDF Report */}
      <TouchableOpacity style={s.pdfBtn} onPress={handleGeneratePDF} disabled={generatingPdf}>
        {generatingPdf ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.pdfBtnText}>📄 Generate PDF Compliance Report</Text>}
      </TouchableOpacity>

      {/* Score Distribution */}
      {distribution.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Compliance Score Distribution</Text>
          <View style={s.card}>
            {distribution.map((d: any, i: number) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: "#888", fontSize: 10, width: 50 }}>{d.range ?? d.bucket}</Text>
                  <View style={{ flex: 1, height: 16, backgroundColor: "#2a2a3e", borderRadius: 3, overflow: "hidden" }}>
                    <View style={{ width: `${(d.count / maxDist) * 100}%`, height: 16, backgroundColor: "#6c63ff", borderRadius: 3 }} />
                  </View>
                  <Text style={{ color: "#fff", fontSize: 10, width: 30, textAlign: "right" }}>{d.count}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Pending KYB Quick-Actions */}
      {pending.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Pending Review ({pending.length})</Text>
          {pending.map((app: any, i: number) => (
            <View key={app.id ?? i} style={s.card}>
              <Text style={s.cardTitle}>{app.businessName ?? app.name ?? "Application"}</Text>
              <Text style={s.cardSub}>{app.businessType ?? ""} · {app.country ?? ""}</Text>
              <Text style={[s.cardSub, { marginTop: 4 }]}>Score: {app.complianceScore ?? "—"}</Text>
              <View style={s.actionRow}>
                <TouchableOpacity style={s.approveBtn} onPress={() => handleApproveKYB(app.id)}>
                  <Text style={s.approveBtnText}>✓ Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => handleRejectKYB(app.id)}>
                  <Text style={s.rejectBtnText}>✗ Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Audit Log */}
      <Text style={s.sectionTitle}>Recent Audit Events</Text>
      {auditLog.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyText}>No recent audit events</Text></View>
      ) : (
        auditLog.map((log: any, i: number) => (
          <View key={log.id ?? i} style={s.logRow}>
            <View style={[s.logDot, { backgroundColor: log.severity === "high" ? "#ef4444" : log.severity === "medium" ? "#f59e0b" : "#10b981" }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.logAction}>{log.action ?? log.event}</Text>
              <Text style={s.logMeta}>{log.actor ?? log.userId} · {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}</Text>
            </View>
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  center: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, alignItems: "center" },
  statNum: { color: "#fff", fontSize: 18, fontWeight: "700" },
  statLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  pdfBtn: { backgroundColor: "#6c63ff", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 16 },
  pdfBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 10, marginTop: 4 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  cardTitle: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" },
  cardSub: { color: "#888", fontSize: 11, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: "#10b98120", borderRadius: 8, padding: 8, alignItems: "center", borderWidth: 1, borderColor: "#10b98140" },
  approveBtnText: { color: "#10b981", fontWeight: "600", fontSize: 12 },
  rejectBtn: { flex: 1, backgroundColor: "#ef444420", borderRadius: 8, padding: 8, alignItems: "center", borderWidth: 1, borderColor: "#ef444440" },
  rejectBtnText: { color: "#ef4444", fontWeight: "600", fontSize: 12 },
  logRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, marginBottom: 6 },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  logAction: { color: "#e5e7eb", fontSize: 12, fontWeight: "500" },
  logMeta: { color: "#666", fontSize: 10, marginTop: 2 },
  empty: { alignItems: "center", padding: 30 },
  emptyText: { color: "#888", fontSize: 14 },
});
