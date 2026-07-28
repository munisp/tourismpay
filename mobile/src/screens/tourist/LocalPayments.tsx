/**
 * Local Payments — Bill pay, bank transfer, split bill.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from "react-native";
import { request } from "../../services/api";

export function LocalPayments({ navigation }: any) {
  const [activeTab, setActiveTab] = useState("billpay");
  const [provider, setProvider] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const tabs = [
    { id: "billpay", label: "Bill Pay" },
    { id: "transfer", label: "Transfer" },
    { id: "split", label: "Split Bill" },
    { id: "links", label: "Pay Links" },
  ];

  const handleBillPay = async () => {
    if (!provider || !accountNumber || !amount) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    setSubmitting(true);
    try {
      await request("billPayments.payBill", {
        method: "POST",
        body: { billerId: provider, customerIdentifier: accountNumber, amount: parseFloat(amount), currency: "NGN" },
      });
      Alert.alert("Success", "Bill payment submitted!");
      setProvider(""); setAccountNumber(""); setAmount("");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  const providers = ["MTN Nigeria", "Airtel Nigeria", "EKEDC (Eko)", "DStv Nigeria", "GOtv Nigeria", "Spectranet"];

  return (
    <View style={s.container}>
      <Text style={s.title}>Local Payments</Text>
      <View style={s.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab.id} style={[s.tab, activeTab === tab.id && s.tabActive]} onPress={() => setActiveTab(tab.id)}>
            <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={s.content}>
        {activeTab === "billpay" && (
          <View style={s.form}>
            <Text style={s.label}>Select Provider</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.providerScroll}>
              {providers.map(p => (
                <TouchableOpacity key={p} style={[s.providerChip, provider === p && s.providerChipActive]} onPress={() => setProvider(p)}>
                  <Text style={[s.providerText, provider === p && s.providerTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={s.label}>Account / Phone Number</Text>
            <TextInput style={s.input} placeholder="Enter account number" placeholderTextColor="#666" value={accountNumber} onChangeText={setAccountNumber} />
            <Text style={s.label}>Amount (NGN)</Text>
            <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#666" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <TouchableOpacity style={[s.submitBtn, submitting && s.disabledBtn]} onPress={handleBillPay} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitText}>Pay ₦{parseFloat(amount || "0").toLocaleString()}</Text>}
            </TouchableOpacity>
          </View>
        )}
        {activeTab !== "billpay" && (
          <View style={s.center}>
            <Text style={s.comingSoon}>{tabs.find(t => t.id === activeTab)?.label} — coming soon</Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", padding: 16, paddingBottom: 8 },
  tabBar: { flexDirection: "row", backgroundColor: "#1a1a2e", marginHorizontal: 16, borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  tabActive: { backgroundColor: "#6c63ff" },
  tabText: { color: "#888", fontSize: 12, fontWeight: "500" },
  tabTextActive: { color: "#fff" },
  content: { flex: 1, padding: 16 },
  form: { gap: 12 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500", marginBottom: 4 },
  input: { backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2d2d44" },
  providerScroll: { marginBottom: 8 },
  providerChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1a1a2e", borderWidth: 1, borderColor: "#2d2d44", marginRight: 8 },
  providerChipActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff20" },
  providerText: { color: "#888", fontSize: 12 },
  providerTextActive: { color: "#6c63ff" },
  submitBtn: { backgroundColor: "#6c63ff", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  disabledBtn: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
  comingSoon: { color: "#888", fontSize: 14 },
});
