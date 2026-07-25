/**
 * Wallet Screen — Multi-currency digital wallet with real-time balances,
 * send/receive, FX conversion, and transaction history from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, RefreshControl, ActivityIndicator,
} from "react-native";
import { walletAPI, WalletBalance, Transaction } from "../../services/api";
import { biometricService } from "../../services/biometrics";
import { offlineManager } from "../../services/offline";
import { useAuth } from "../../hooks/useAuth";

export function WalletScreen() {
  const { isAuthenticated } = useAuth();
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeBalance, setActiveBalance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Send modal state
  const [showSend, setShowSend] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sending, setSending] = useState(false);

  // Convert modal state
  const [showConvert, setShowConvert] = useState(false);
  const [convertTo, setConvertTo] = useState("NGN");
  const [convertAmount, setConvertAmount] = useState("");
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [balanceData, txData] = await Promise.all([
        walletAPI.getBalances(),
        walletAPI.getTransactions({ limit: 20 }),
      ]);
      setBalances(balanceData);
      setTransactions(txData.transactions);
    } catch (err) {
      if (!offlineManager.getConnectionStatus()) {
        // Offline — show cached data
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadData();
  }, [isAuthenticated, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSend = async () => {
    if (!sendTo || !sendAmount) {
      Alert.alert("Error", "Please fill in recipient and amount");
      return;
    }

    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

    // Biometric confirmation for transactions over threshold
    if (amount >= 50) {
      const currency = balances[activeBalance]?.currency ?? "USD";
      const auth = await biometricService.authenticateForTransaction(amount, currency);
      if (!auth.success) {
        Alert.alert("Authentication Required", "Please authenticate to complete this transaction");
        return;
      }
    }

    setSending(true);
    try {
      const currency = balances[activeBalance]?.currency ?? "USD";
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (offlineManager.getConnectionStatus()) {
        await walletAPI.send({ to: sendTo, amount, currency, note: sendNote, idempotencyKey });
        Alert.alert("Success", `Sent ${currency} ${amount.toFixed(2)} to ${sendTo}`);
      } else {
        await offlineManager.enqueue("wallet.send", "POST", { to: sendTo, amount, currency, note: sendNote, idempotencyKey });
        Alert.alert("Queued", "Transaction will be sent when you're back online");
      }

      setShowSend(false);
      setSendTo("");
      setSendAmount("");
      setSendNote("");
      await loadData();
    } catch (err) {
      Alert.alert("Failed", err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setSending(false);
    }
  };

  const handleConvert = async () => {
    if (!convertAmount) return;
    const amount = parseFloat(convertAmount);
    if (isNaN(amount) || amount <= 0) return;

    setConverting(true);
    try {
      const from = balances[activeBalance]?.currency ?? "USD";
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await walletAPI.swap({ fromCurrency: from, toCurrency: convertTo, amount, idempotencyKey });
      Alert.alert("Converted", `Rate: ${result.rate.toFixed(4)}\nReceived: ${convertTo} ${result.received.toFixed(2)}`);
      setShowConvert(false);
      setConvertAmount("");
      await loadData();
    } catch (err) {
      Alert.alert("Failed", err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setConverting(false);
    }
  };

  const fetchFxRate = async (toCurrency: string) => {
    const from = balances[activeBalance]?.currency ?? "USD";
    try {
      const data = await walletAPI.getFxRate(from, toCurrency);
      setFxRate(data.rate);
    } catch {
      setFxRate(null);
    }
  };

  const current = balances[activeBalance] ?? { currency: "USD", symbol: "$", amount: 0, flag: "🇺🇸", availableBalance: 0, pendingBalance: 0 };
  const queueSize = offlineManager.getQueueSize();

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#6c63ff" />
        <Text style={s.loadingText}>Loading wallet...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
        {/* Offline indicator */}
        {queueSize > 0 && (
          <View style={s.offlineBanner}>
            <Text style={s.offlineText}>⏳ {queueSize} pending transaction{queueSize > 1 ? "s" : ""}</Text>
          </View>
        )}

        {/* Main Balance */}
        <View style={s.balanceCard}>
          <Text style={s.balFlag}>{current.flag}</Text>
          <Text style={s.balAmount}>{current.symbol}{current.availableBalance.toFixed(2)}</Text>
          <Text style={s.balCurrency}>{current.currency} Available</Text>
          {current.pendingBalance > 0 && (
            <Text style={s.pendingText}>{current.symbol}{current.pendingBalance.toFixed(2)} pending</Text>
          )}
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
              <Text style={[s.currencyText, i === activeBalance && s.currencyTextActive]}>
                {b.currency} {b.symbol}{b.availableBalance.toFixed(0)}
              </Text>
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
          <TouchableOpacity style={s.actionBtn} onPress={() => { setShowConvert(true); fetchFxRate(convertTo); }}>
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
        {transactions.length === 0 ? (
          <View style={s.emptyTx}>
            <Text style={s.emptyEmoji}>💸</Text>
            <Text style={s.emptyText}>No transactions yet</Text>
            <Text style={s.emptySubtext}>Your payment history will appear here</Text>
          </View>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={s.txRow}>
              <View style={s.txIcon}>
                <Text style={s.txIconText}>
                  {tx.type === "send" ? "↑" : tx.type === "receive" ? "↓" : tx.type === "swap" ? "↔" : "+"}
                </Text>
              </View>
              <View style={s.txInfo}>
                <Text style={s.txTitle}>{tx.counterparty || tx.type}</Text>
                <Text style={s.txDate}>{new Date(tx.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={s.txAmountCol}>
                <Text style={[s.txAmount, tx.type === "receive" ? s.txPositive : s.txNegative]}>
                  {tx.type === "receive" ? "+" : "-"}{tx.currency} {tx.amount.toFixed(2)}
                </Text>
                <Text style={[s.txStatus, tx.status === "completed" ? s.statusDone : s.statusPending]}>
                  {tx.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Send Money Modal */}
      <Modal visible={showSend} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Send {current.currency}</Text>
            <Text style={s.label}>Recipient</Text>
            <TextInput style={s.input} placeholder="Email or wallet ID" placeholderTextColor="#666" value={sendTo} onChangeText={setSendTo} autoCapitalize="none" />
            <Text style={s.label}>Amount ({current.currency})</Text>
            <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#666" keyboardType="decimal-pad" value={sendAmount} onChangeText={setSendAmount} />
            <Text style={s.label}>Note (optional)</Text>
            <TextInput style={s.input} placeholder="What's this for?" placeholderTextColor="#666" value={sendNote} onChangeText={setSendNote} />
            <Text style={s.balanceHint}>Available: {current.symbol}{current.availableBalance.toFixed(2)}</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSend(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.sendBtn, sending && s.disabledBtn]} onPress={handleSend} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Convert Modal */}
      <Modal visible={showConvert} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Convert {current.currency}</Text>
            <Text style={s.label}>Amount ({current.currency})</Text>
            <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#666" keyboardType="decimal-pad" value={convertAmount} onChangeText={setConvertAmount} />
            <Text style={s.label}>To Currency</Text>
            <View style={s.currencyPickerRow}>
              {["NGN", "USD", "EUR", "GBP", "KES", "ZAR"].filter(c => c !== current.currency).map(c => (
                <TouchableOpacity key={c} style={[s.currencyChip, convertTo === c && s.currencyChipActive]} onPress={() => { setConvertTo(c); fetchFxRate(c); }}>
                  <Text style={[s.currencyChipText, convertTo === c && s.currencyChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {fxRate && <Text style={s.rateText}>Rate: 1 {current.currency} = {fxRate.toFixed(4)} {convertTo}</Text>}
            {fxRate && convertAmount && <Text style={s.receiveText}>You receive: ~{(parseFloat(convertAmount || "0") * fxRate).toFixed(2)} {convertTo}</Text>}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowConvert(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.sendBtn, converting && s.disabledBtn]} onPress={handleConvert} disabled={converting}>
                {converting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendText}>Convert</Text>}
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
  loadingText: { color: "#888", marginTop: 12, fontSize: 14 },
  offlineBanner: { backgroundColor: "#f59e0b20", borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#f59e0b40" },
  offlineText: { color: "#f59e0b", fontSize: 12, textAlign: "center" },
  balanceCard: { backgroundColor: "#1a1a2e", borderRadius: 20, padding: 32, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#6c63ff30" },
  balFlag: { fontSize: 36 },
  balAmount: { fontSize: 36, fontWeight: "700", color: "#fff", marginTop: 8 },
  balCurrency: { color: "#888", fontSize: 13, marginTop: 4 },
  pendingText: { color: "#f59e0b", fontSize: 11, marginTop: 4 },
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
  txRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  txIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#6c63ff20", alignItems: "center", justifyContent: "center" },
  txIconText: { color: "#6c63ff", fontSize: 18, fontWeight: "700" },
  txInfo: { flex: 1, marginLeft: 12 },
  txTitle: { color: "#fff", fontSize: 14, fontWeight: "500" },
  txDate: { color: "#888", fontSize: 11, marginTop: 2 },
  txAmountCol: { alignItems: "flex-end" },
  txAmount: { fontSize: 14, fontWeight: "600" },
  txPositive: { color: "#22c55e" },
  txNegative: { color: "#ef4444" },
  txStatus: { fontSize: 10, marginTop: 2 },
  statusDone: { color: "#22c55e" },
  statusPending: { color: "#f59e0b" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500", marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2d2d44" },
  balanceHint: { color: "#888", fontSize: 11, marginTop: 8 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "#2d2d44" },
  cancelText: { color: "#888" },
  sendBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, backgroundColor: "#6c63ff" },
  sendText: { color: "#fff", fontWeight: "600" },
  disabledBtn: { opacity: 0.6 },
  currencyPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  currencyChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: "#0f0f1a", borderWidth: 1, borderColor: "#2d2d44" },
  currencyChipActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff20" },
  currencyChipText: { color: "#888", fontSize: 12 },
  currencyChipTextActive: { color: "#6c63ff" },
  rateText: { color: "#888", fontSize: 12, marginTop: 12 },
  receiveText: { color: "#22c55e", fontSize: 14, fontWeight: "600", marginTop: 4 },
});
