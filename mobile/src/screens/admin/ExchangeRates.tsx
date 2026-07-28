/**
 * ExchangeRates — Exchange rate overrides with full CRUD (PWA parity).
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, RefreshControl, ActivityIndicator } from "react-native";
import { useApiData } from "../../hooks/useApiData";
import { adminAPI } from "../../services/api";

export function ExchangeRates({ navigation }: any) {
  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "exchangeRateOverrides.list",
    defaultValue: { rates: [] },
  });
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [pair, setPair] = useState("");
  const [rate, setRate] = useState("");
  const [spread, setSpread] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deviationResult, setDeviationResult] = useState<any>(null);

  const items: any[] = data?.rates ?? (Array.isArray(data) ? data : []);

  const openCreate = () => { setPair(""); setRate(""); setSpread(""); setEditItem(null); setDeviationResult(null); setShowCreate(true); };
  const openEdit = (item: any) => { setPair(item.pair); setRate(String(item.rate)); setSpread(String(item.spread ?? "")); setEditItem(item); setDeviationResult(null); setShowCreate(true); };

  const handleCheckDeviation = async () => {
    if (!pair || !rate) return;
    try {
      const d = await adminAPI.checkRateDeviation?.({ pair, proposedRate: parseFloat(rate) });
      setDeviationResult(d);
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleSave = async () => {
    if (!pair || !rate) return Alert.alert("Error", "Fill in currency pair and rate");
    setSubmitting(true);
    try {
      await adminAPI.upsertExchangeRateOverride?.({ id: editItem?.id, pair, rate: parseFloat(rate), spread: spread ? parseFloat(spread) : undefined });
      Alert.alert("✅ Saved", `Override for ${pair} saved`);
      setShowCreate(false);
      refresh();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setSubmitting(false); }
  };

  const handleDeactivate = async (id: number) => {
    try {
      await adminAPI.deactivateExchangeRateOverride?.({ id });
      Alert.alert("Deactivated");
      refresh();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleDelete = async (id: number) => {
    Alert.alert("Delete Override", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await adminAPI.deleteExchangeRateOverride?.({ id });
          refresh();
        } catch (e: any) { Alert.alert("Error", e.message); }
      }}
    ]);
  };

  if (loading && !error) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (error) return <View style={s.center}><Text style={s.errorText}>{error}</Text></View>;

  return (
    <View style={s.root}>
      <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6c63ff" />}>
        <View style={s.headerRow}>
          <Text style={s.sectionTitle}>Exchange Rate Overrides</Text>
          <TouchableOpacity style={s.addBtn} onPress={openCreate}><Text style={s.addBtnText}>+ New Override</Text></TouchableOpacity>
        </View>
        {items.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No rate overrides configured</Text></View>
        ) : (
          items.map((item: any, i: number) => (
            <View key={item.id ?? i} style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle}>{item.pair}</Text>
                <View style={[s.badge, item.active ? s.badgeGreen : s.badgeGray]}>
                  <Text style={[s.badgeText, { color: item.active ? "#10b981" : "#888" }]}>{item.active ? "Active" : "Inactive"}</Text>
                </View>
              </View>
              <Text style={s.cardSub}>Rate: {Number(item.rate).toFixed(4)} {item.spread ? `· Spread: ${item.spread}%` : ""}</Text>
              <Text style={s.cardSub}>Updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</Text>
              <View style={s.cardActions}>
                <TouchableOpacity onPress={() => openEdit(item)}><Text style={s.linkBtn}>Edit</Text></TouchableOpacity>
                {item.active && <TouchableOpacity onPress={() => handleDeactivate(item.id)}><Text style={[s.linkBtn, { color: "#f59e0b" }]}>Deactivate</Text></TouchableOpacity>}
                <TouchableOpacity onPress={() => handleDelete(item.id)}><Text style={[s.linkBtn, { color: "#ef4444" }]}>Delete</Text></TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{editItem ? "Edit Override" : "New Rate Override"}</Text>
            <TextInput style={s.input} placeholder="Currency pair (e.g. USD/NGN)" placeholderTextColor="#666" value={pair} onChangeText={setPair} autoCapitalize="characters" />
            <TextInput style={s.input} placeholder="Override rate" placeholderTextColor="#666" keyboardType="decimal-pad" value={rate} onChangeText={setRate} />
            <TextInput style={s.input} placeholder="Spread % (optional)" placeholderTextColor="#666" keyboardType="decimal-pad" value={spread} onChangeText={setSpread} />
            {deviationResult && (
              <View style={[s.deviationBox, { borderColor: deviationResult.withinThreshold ? "#10b98140" : "#ef444440" }]}>
                <Text style={{ color: deviationResult.withinThreshold ? "#10b981" : "#ef4444", fontSize: 12 }}>
                  {deviationResult.withinThreshold ? "✅ Within acceptable range" : "⚠️ Significant deviation from market rate"}
                </Text>
                <Text style={{ color: "#888", fontSize: 11, marginTop: 2 }}>Market rate: {deviationResult.marketRate?.toFixed(4)} · Deviation: {deviationResult.deviationPct?.toFixed(2)}%</Text>
              </View>
            )}
            <TouchableOpacity style={s.checkBtn} onPress={handleCheckDeviation}>
              <Text style={s.checkBtnText}>Check Market Deviation</Text>
            </TouchableOpacity>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowCreate(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleSave} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnPrimaryText}>Save Override</Text>}
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
  emptyText: { color: "#888", fontSize: 14 },
  errorText: { color: "#ef4444", textAlign: "center", padding: 16 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10, borderWidth: 1, borderColor: "#2a2a3e" },
  deviationBox: { backgroundColor: "#1a1a2e", borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1 },
  checkBtn: { backgroundColor: "#2a2a3e", borderRadius: 10, padding: 10, alignItems: "center", marginBottom: 10 },
  checkBtnText: { color: "#6c63ff", fontSize: 12, fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnPrimary: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 12, padding: 14, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: "#2a2a3e", borderRadius: 12, padding: 14, alignItems: "center" },
  btnSecondaryText: { color: "#aaa", fontWeight: "600", fontSize: 14 },
});
