/**
 * Stablecoin Swap — Buy, Sell, Swap stablecoins.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from "react-native";
import { request } from "../../services/api";

export function StablecoinSwap({ navigation }: any) {
  const [activeTab, setActiveTab] = useState("buy");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USDC");
  const [submitting, setSubmitting] = useState(false);

  const tabs = ["Buy", "Sell", "Swap", "Earn", "Portfolio"];
  const stablecoins = ["USDC", "USDT", "CNGN", "CUSD", "DAI"];

  const handleAction = async () => {
    if (!amount) { Alert.alert("Error", "Enter an amount"); return; }
    setSubmitting(true);
    try {
      await request("stablecoin." + activeTab, { method: "POST", body: { amount: parseFloat(amount), currency } });
      Alert.alert("Success", `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} order placed!`);
      setAmount("");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Stablecoin</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === tab.toLowerCase() && s.tabActive]} onPress={() => setActiveTab(tab.toLowerCase())}>
            <Text style={[s.tabText, activeTab === tab.toLowerCase() && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView style={s.content}>
        <View style={s.form}>
          <Text style={s.label}>Select Stablecoin</Text>
          <View style={s.coinRow}>
            {stablecoins.map(c => (
              <TouchableOpacity key={c} style={[s.coinChip, currency === c && s.coinChipActive]} onPress={() => setCurrency(c)}>
                <Text style={[s.coinText, currency === c && s.coinTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>Amount</Text>
          <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#666" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <TouchableOpacity style={[s.btn, submitting && s.disabledBtn]} onPress={handleAction} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>{tabs.find(t => t.toLowerCase() === activeTab)} {currency}</Text>}
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", padding: 16, paddingBottom: 8 },
  tabScroll: { paddingHorizontal: 16, marginBottom: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1a1a2e", marginRight: 8, borderWidth: 1, borderColor: "#2d2d44" },
  tabActive: { backgroundColor: "#6c63ff20", borderColor: "#6c63ff" },
  tabText: { color: "#888", fontSize: 13, fontWeight: "500" },
  tabTextActive: { color: "#6c63ff" },
  content: { flex: 1, padding: 16 },
  form: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 16, gap: 12 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500" },
  coinRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  coinChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#0f0f1a", borderWidth: 1, borderColor: "#2d2d44" },
  coinChipActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff20" },
  coinText: { color: "#888", fontSize: 12 },
  coinTextActive: { color: "#6c63ff" },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2d2d44" },
  btn: { backgroundColor: "#6c63ff", borderRadius: 10, padding: 14, alignItems: "center" },
  disabledBtn: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "600" },
});
