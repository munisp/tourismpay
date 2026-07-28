/**
 * KYBDocuments — KYB document review with approve/reject actions (PWA parity).
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl, ActivityIndicator, TextInput, Modal } from "react-native";
import { useApiData } from "../../hooks/useApiData";
import { adminAPI } from "../../services/api";

export function KYBDocuments({ navigation }: any) {
  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "kyb.listDocuments",
    defaultValue: { items: [] },
  });
  const [reviewModal, setReviewModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const items: any[] = (data?.items ?? (Array.isArray(data) ? data : [])).filter((d: any) =>
    filter === "all" || d.status === filter
  );

  const handleReview = (doc: any) => { setSelectedDoc(doc); setReviewNotes(""); setReviewModal(true); };

  const submitReview = async (action: "approve" | "reject") => {
    if (!selectedDoc) return;
    setSubmitting(true);
    try {
      await adminAPI.reviewKYBDocument?.({ documentId: selectedDoc.id, action, notes: reviewNotes });
      Alert.alert("✅ Done", `Document ${action === "approve" ? "approved" : "rejected"}`);
      setReviewModal(false);
      refresh();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setSubmitting(false); }
  };

  const submitBulkApprove = async () => {
    const pendingIds = items.filter(d => d.status === "pending").map(d => d.id);
    if (!pendingIds.length) return Alert.alert("No pending documents");
    Alert.alert("Bulk Approve", `Approve all ${pendingIds.length} pending documents?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Approve All", onPress: async () => {
        try {
          await adminAPI.bulkReviewKYBDocuments?.({ ids: pendingIds, action: "approve" });
          Alert.alert("✅ Done", `${pendingIds.length} documents approved`);
          refresh();
        } catch (e: any) { Alert.alert("Error", e.message); }
      }}
    ]);
  };

  if (loading && !error) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (error) return <View style={s.center}><Text style={s.errorText}>{error}</Text></View>;

  return (
    <View style={s.root}>
      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterChip, filter === f && s.filterChipActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6c63ff" />}>
        <View style={s.headerRow}>
          <Text style={s.sectionTitle}>KYB Documents ({items.length})</Text>
          <TouchableOpacity style={s.bulkBtn} onPress={submitBulkApprove}>
            <Text style={s.bulkBtnText}>Bulk Approve</Text>
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyEmoji}>📄</Text><Text style={s.emptyText}>No documents in this category</Text></View>
        ) : (
          items.map((item: any, idx: number) => (
            <View key={item.id ?? idx} style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle}>{item.documentType ?? item.type ?? "Document"}</Text>
                <View style={[s.badge, item.status === "approved" ? s.badgeGreen : item.status === "rejected" ? s.badgeRed : s.badgeYellow]}>
                  <Text style={[s.badgeText, item.status === "approved" ? { color: "#10b981" } : item.status === "rejected" ? { color: "#ef4444" } : { color: "#f59e0b" }]}>
                    {item.status ?? "pending"}
                  </Text>
                </View>
              </View>
              <Text style={s.cardSub}>{item.businessName ?? item.applicantName ?? ""}</Text>
              <Text style={s.cardSub}>Submitted: {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "—"}</Text>
              {item.status === "pending" && (
                <TouchableOpacity style={s.reviewBtn} onPress={() => handleReview(item)}>
                  <Text style={s.reviewBtnText}>Review Document</Text>
                </TouchableOpacity>
              )}
              {item.reviewNotes && <Text style={[s.cardSub, { marginTop: 6, fontStyle: "italic" }]}>Notes: {item.reviewNotes}</Text>}
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Review Modal */}
      <Modal visible={reviewModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Review: {selectedDoc?.documentType ?? "Document"}</Text>
            <Text style={s.cardSub}>{selectedDoc?.businessName ?? ""}</Text>
            <TextInput
              style={[s.input, { marginTop: 16, height: 80, textAlignVertical: "top" }]}
              placeholder="Review notes (optional)..."
              placeholderTextColor="#666"
              multiline
              value={reviewNotes}
              onChangeText={setReviewNotes}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setReviewModal(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.rejectActionBtn} onPress={() => submitReview("reject")} disabled={submitting}>
                <Text style={s.rejectActionText}>✗ Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.approveActionBtn} onPress={() => submitReview("approve")} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.approveActionText}>✓ Approve</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f0f1a" },
  center: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  container: { flex: 1, padding: 16 },
  filterBar: { backgroundColor: "#1a1a2e", borderBottomWidth: 1, borderBottomColor: "#2a2a3e" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#2a2a3e" },
  filterChipActive: { backgroundColor: "#6c63ff" },
  filterText: { color: "#888", fontSize: 12, fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  bulkBtn: { backgroundColor: "#10b98120", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#10b98140" },
  bulkBtnText: { color: "#10b981", fontSize: 12, fontWeight: "600" },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#e5e7eb", fontSize: 13, fontWeight: "600", flex: 1 },
  cardSub: { color: "#888", fontSize: 11, marginTop: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeGreen: { backgroundColor: "#10b98120" },
  badgeRed: { backgroundColor: "#ef444420" },
  badgeYellow: { backgroundColor: "#f59e0b20" },
  badgeText: { fontSize: 10, fontWeight: "600" },
  reviewBtn: { backgroundColor: "#6c63ff20", borderRadius: 8, padding: 8, marginTop: 10, alignItems: "center", borderWidth: 1, borderColor: "#6c63ff40" },
  reviewBtnText: { color: "#6c63ff", fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", padding: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  errorText: { color: "#ef4444", textAlign: "center", padding: 16 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2a2a3e" },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, backgroundColor: "#2a2a3e", borderRadius: 12, padding: 12, alignItems: "center" },
  cancelText: { color: "#aaa", fontWeight: "600" },
  rejectActionBtn: { flex: 1, backgroundColor: "#ef444420", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#ef444440" },
  rejectActionText: { color: "#ef4444", fontWeight: "700" },
  approveActionBtn: { flex: 1, backgroundColor: "#10b981", borderRadius: 12, padding: 12, alignItems: "center" },
  approveActionText: { color: "#fff", fontWeight: "700" },
});
