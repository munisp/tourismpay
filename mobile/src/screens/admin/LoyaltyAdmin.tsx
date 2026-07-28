/**
 * LoyaltyAdmin — Loyalty programme management with create/edit (PWA parity).
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, RefreshControl, ActivityIndicator } from "react-native";
import { useApiData } from "../../hooks/useApiData";
import { adminAPI } from "../../services/api";

export function LoyaltyAdmin({ navigation }: any) {
  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "loyaltyAdmin.getPrograms",
    defaultValue: { items: [] },
  });
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [progName, setProgName] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [bronzeThreshold, setBronzeThreshold] = useState("0");
  const [silverThreshold, setSilverThreshold] = useState("1000");
  const [goldThreshold, setGoldThreshold] = useState("5000");
  const [platThreshold, setPlatThreshold] = useState("20000");
  const [submitting, setSubmitting] = useState(false);

  const items: any[] = data?.items ?? (Array.isArray(data) ? data : []);

  const openCreate = () => { setProgName(""); setMultiplier("1"); setBronzeThreshold("0"); setSilverThreshold("1000"); setGoldThreshold("5000"); setPlatThreshold("20000"); setEditItem(null); setShowCreate(true); };
  const openEdit = (item: any) => { setProgName(item.name); setMultiplier(String(item.multiplier ?? 1)); setEditItem(item); setShowCreate(true); };

  const handleSave = async () => {
    if (!progName) return Alert.alert("Error", "Enter programme name");
    setSubmitting(true);
    try {
      if (editItem) {
        await adminAPI.updateLoyaltyProgram?.({ id: editItem.id, name: progName, multiplier: parseFloat(multiplier) });
      } else {
        await adminAPI.createLoyaltyProgram?.({
          name: progName, multiplier: parseFloat(multiplier),
          tiers: { bronze: parseFloat(bronzeThreshold), silver: parseFloat(silverThreshold), gold: parseFloat(goldThreshold), platinum: parseFloat(platThreshold) }
        });
      }
      Alert.alert("✅ Saved");
      setShowCreate(false);
      refresh();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setSubmitting(false); }
  };

  const handleDeactivate = async (id: number) => {
    try {
      await adminAPI.deactivateLoyaltyProgram?.({ id });
      Alert.alert("Deactivated");
      refresh();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  if (loading && !error) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (error) return <View style={s.center}><Text style={s.errorText}>{error}</Text></View>;

  return (
    <View style={s.root}>
      <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6c63ff" />}>
        <View style={s.headerRow}>
          <Text style={s.sectionTitle}>Loyalty Programmes ({items.length})</Text>
          <TouchableOpacity style={s.addBtn} onPress={openCreate}><Text style={s.addBtnText}>+ New</Text></TouchableOpacity>
        </View>
        {items.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyEmoji}>🏆</Text><Text style={s.emptyText}>No loyalty programmes configured</Text></View>
        ) : (
          items.map((item: any, idx: number) => (
            <View key={item.id ?? idx} style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle}>{item.name}</Text>
                <View style={[s.badge, item.active !== false ? s.badgeGreen : s.badgeGray]}>
                  <Text style={[s.badgeText, { color: item.active !== false ? "#10b981" : "#888" }]}>{item.active !== false ? "Active" : "Inactive"}</Text>
                </View>
              </View>
              <Text style={s.cardSub}>Multiplier: {item.multiplier ?? 1}x · Members: {item.memberCount ?? 0}</Text>
              <Text style={s.cardSub}>Tiers: Bronze → Silver ({item.tiers?.silver ?? 1000}) → Gold ({item.tiers?.gold ?? 5000}) → Platinum ({item.tiers?.platinum ?? 20000})</Text>
              <View style={s.cardActions}>
                <TouchableOpacity onPress={() => openEdit(item)}><Text style={s.linkBtn}>Edit</Text></TouchableOpacity>
                {item.active !== false && <TouchableOpacity onPress={() => handleDeactivate(item.id)}><Text style={[s.linkBtn, { color: "#f59e0b" }]}>Deactivate</Text></TouchableOpacity>}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{editItem ? "Edit Programme" : "New Loyalty Programme"}</Text>
            <TextInput style={s.input} placeholder="Programme name" placeholderTextColor="#666" value={progName} onChangeText={setProgName} />
            <TextInput style={s.input} placeholder="Points multiplier (e.g. 1.5)" placeholderTextColor="#666" keyboardType="decimal-pad" value={multiplier} onChangeText={setMultiplier} />
            {!editItem && (
              <>
                <Text style={s.inputLabel}>Tier Thresholds (points)</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Silver" placeholderTextColor="#666" keyboardType="numeric" value={silverThreshold} onChangeText={setSilverThreshold} />
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Gold" placeholderTextColor="#666" keyboardType="numeric" value={goldThreshold} onChangeText={setGoldThreshold} />
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Plat." placeholderTextColor="#666" keyboardType="numeric" value={platThreshold} onChangeText={setPlatThreshold} />
                </View>
              </>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowCreate(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleSave} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnPrimaryText}>Save</Text>}
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  addBtn: { backgroundColor: "#6c63ff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#e5e7eb", fontSize: 13, fontWeight: "600", flex: 1 },
  cardSub: { color: "#888", fontSize: 11, marginTop: 4 },
  cardActions: { flexDirection: "row", gap: 16, marginTop: 10 },
  linkBtn: { color: "#6c63ff", fontSize: 12, fontWeight: "600" },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeGreen: { backgroundColor: "#10b98120" },
  badgeGray: { backgroundColor: "#88888820" },
  badgeText: { fontSize: 10, fontWeight: "600" },
  empty: { alignItems: "center", padding: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  errorText: { color: "#ef4444", textAlign: "center", padding: 16 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10, borderWidth: 1, borderColor: "#2a2a3e" },
  inputLabel: { color: "#888", fontSize: 11, fontWeight: "600", marginBottom: 6, textTransform: "uppercase" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnPrimary: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 12, padding: 14, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: "#2a2a3e", borderRadius: 12, padding: 14, alignItems: "center" },
  btnSecondaryText: { color: "#aaa", fontWeight: "600", fontSize: 14 },
});
