/**
 * Wallet Screen — Multi-currency digital wallet with send/receive, FX, and transaction history.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput } from "react-native";

interface Balance {
  currency: string;
  symbol: string;
  amount: number;
  flag: string;
}

export function WalletScreen() {
  const [showSend, setShowSend] = useState(false);
  const [activeBalance, setActiveBalance] = useState(0);

  const balances: Balance[] = [
    { currency: "USD", symbol: "$", amount: 0, flag: "🇺🇸" },
    { currency: "EUR", symbol: "€", amount: 0, flag: "🇪🇺" },
    { currency: "GBP", symbol: "£", amount: 0, flag: "🇬🇧" },
    { currency: "NGN", symbol: "₦", amount: 0, flag: "🇳🇬" },
    { currency: "KES", symbol: "KSh", amount: 0, flag: "🇰🇪" },
    { currency: "ZAR", symbol: "R", amount: 0, flag: "🇿🇦" },
  ];

  const current = balances[activeBalance];

  return (
    <View style={s.container}>
      <ScrollView>
        {/* Main Balance */}
        <View style={s.balanceCard}>
          <Text style={s.balFlag}>{current.flag}</Text>
          <Text style={s.balAmount}>{current.symbol}{current.amount.toFixed(2)}</Text>
          <Text style={s.balCurrency}>{current.currency} Balance</Text>
        </View>

        {/* Currency Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.currencyScroll}>
          {balances.map((b, i) => (
            <TouchableOpacity
              key={b.currency}
              style={[s.currencyPill, i === activeBalance && s.currencyActive]}
              onPress={() => setActiveBalance(i)}
            >
              <Text style={s.currencyFlag}>{b.flag}</Text>
              <Text style={[s.currencyText, i === activeBalance && s.currencyTextActive]}>{b.currency}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quick Actions */}
        <View style={s.actionsRow}>
          <TouchableOpacity style={s.actionBtn} onPress={() => setShowSend(true)}>
            <Text style={s.actionIcon}>↑</Text>
            <Text style={s.actionLabel}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn}>
            <Text style={s.actionIcon}>↓</Text>
            <Text style={s.actionLabel}>Receive</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn}>
            <Text style={s.actionIcon}>↔</Text>
            <Text style={s.actionLabel}>Convert</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn}>
            <Text style={s.actionIcon}>+</Text>
            <Text style={s.actionLabel}>Top Up</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction History */}
        <Text style={s.section}>Recent Transactions</Text>
        <View style={s.emptyTx}>
          <Text style={s.emptyEmoji}>💸</Text>
          <Text style={s.emptyText}>No transactions yet</Text>
          <Text style={s.emptySubtext}>Your payment history will appear here</Text>
        </View>

        {/* Sparkline Placeholder */}
        <Text style={s.section}>7-Day Balance Trend</Text>
        <View style={s.sparkline}>
          {[20, 35, 28, 45, 38, 52, 48].map((v, i) => (
            <View key={i} style={[s.sparkBar, { height: v }]} />
          ))}
        </View>
      </ScrollView>

      {/* Send Money Modal */}
      <Modal visible={showSend} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Send Money</Text>
            <Text style={s.label}>Recipient</Text>
            <TextInput style={s.input} placeholder="Email or wallet ID" placeholderTextColor="#666" />
            <Text style={s.label}>Amount ({current.currency})</Text>
            <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#666" keyboardType="decimal-pad" />
            <Text style={s.label}>Note (optional)</Text>
            <TextInput style={s.input} placeholder="What's this for?" placeholderTextColor="#666" />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSend(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.sendBtn}>
                <Text style={s.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  balanceCard: { backgroundColor: "#1a1a2e", borderRadius: 20, padding: 32, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#6c63ff30" },
  balFlag: { fontSize: 36 },
  balAmount: { fontSize: 36, fontWeight: "700", color: "#fff", marginTop: 8 },
  balCurrency: { color: "#888", fontSize: 13, marginTop: 4 },
  currencyScroll: { marginTop: 16, maxHeight: 44 },
  currencyPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, gap: 6 },
  currencyActive: { backgroundColor: "#6c63ff20", borderWidth: 1, borderColor: "#6c63ff" },
  currencyFlag: { fontSize: 16 },
  currencyText: { color: "#888", fontSize: 12, fontWeight: "500" },
  currencyTextActive: { color: "#6c63ff" },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, gap: 10 },
  actionBtn: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  actionIcon: { fontSize: 20, color: "#6c63ff", fontWeight: "700" },
  actionLabel: { color: "#ccc", fontSize: 11, marginTop: 4 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  emptyTx: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4 },
  sparkline: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 60, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, gap: 4 },
  sparkBar: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500", marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2d2d44" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "#2d2d44" },
  cancelText: { color: "#888" },
  sendBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, backgroundColor: "#6c63ff" },
  sendText: { color: "#fff", fontWeight: "600" },
});
