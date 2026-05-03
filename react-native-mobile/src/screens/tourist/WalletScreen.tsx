import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  SafeAreaView, TextInput, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api, type WalletData } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function WalletScreen({ navigation }: { navigation: any }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [sendAmount, setSendAmount] = useState("");
  const [sendRecipient, setSendRecipient] = useState("");

  const loadWallet = async () => {
    try {
      const data = await api.getWallet();
      setWallet(data);
    } catch { /* offline */ }
  };

  useEffect(() => { loadWallet(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWallet();
    setRefreshing(false);
  };

  const handleSend = async () => {
    if (!sendAmount || !sendRecipient) {
      Alert.alert("Error", "Enter recipient and amount");
      return;
    }
    try {
      await api.sendPayment({
        recipientId: sendRecipient,
        amount: parseFloat(sendAmount),
        currency: "USD",
      });
      Alert.alert("Success", "Payment sent!");
      setShowSend(false);
      setSendAmount("");
      setSendRecipient("");
      loadWallet();
    } catch {
      Alert.alert("Error", "Payment failed. Try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.title}>Digital Wallet</Text>

        <Card>
          <Text style={styles.totalLabel}>Total Balance</Text>
          <Text style={styles.totalAmount}>${wallet?.totalUSD.toFixed(2) ?? "0.00"}</Text>
        </Card>

        {/* Currency balances */}
        {wallet?.balances.map((b) => (
          <Card key={b.currency}>
            <View style={styles.balanceRow}>
              <View>
                <Text style={styles.currencyName}>{b.currency}</Text>
                <Text style={styles.currencySymbol}>{b.symbol}</Text>
              </View>
              <Text style={styles.currencyAmount}>{b.amount.toFixed(2)}</Text>
            </View>
          </Card>
        ))}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowSend(true)}>
            <Ionicons name="send" size={20} color={colors.white} />
            <Text style={styles.actionText}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
            onPress={() => navigation.navigate("QRScan")}>
            <Ionicons name="qr-code" size={20} color={colors.white} />
            <Text style={styles.actionText}>Receive</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.info }]}
            onPress={() => navigation.navigate("Remittance")}>
            <Ionicons name="swap-horizontal" size={20} color={colors.white} />
            <Text style={styles.actionText}>Swap</Text>
          </TouchableOpacity>
        </View>

        {/* Send form */}
        {showSend && (
          <Card>
            <Text style={styles.formLabel}>Send Payment</Text>
            <TextInput
              style={styles.input}
              placeholder="Recipient ID"
              placeholderTextColor={colors.textMuted}
              value={sendRecipient}
              onChangeText={setSendRecipient}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount (USD)"
              placeholderTextColor={colors.textMuted}
              value={sendAmount}
              onChangeText={setSendAmount}
              keyboardType="decimal-pad"
            />
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSend(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                <Text style={styles.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  totalLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  totalAmount: { color: colors.text, fontSize: 40, fontWeight: "bold" },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  currencyName: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  currencySymbol: { color: colors.textMuted, fontSize: fontSize.sm },
  currencyAmount: { color: colors.text, fontSize: fontSize.xl, fontWeight: "bold" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.md },
  actionBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: borderRadius.lg,
    padding: spacing.md, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm,
  },
  actionText: { color: colors.white, fontSize: fontSize.md, fontWeight: "600" },
  formLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600", marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md,
    color: colors.text, fontSize: fontSize.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: { padding: spacing.sm },
  cancelText: { color: colors.textMuted, fontSize: fontSize.md },
  sendBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sendText: { color: colors.white, fontSize: fontSize.md, fontWeight: "600" },
});
