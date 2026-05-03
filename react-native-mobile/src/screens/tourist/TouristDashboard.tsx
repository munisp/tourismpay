import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import ConnectivityBanner from "../../components/ConnectivityBanner";
import { api, type WalletData, type ExchangeRate } from "../../services/api";
import { offlineStore } from "../../services/offlineStore";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const QUICK_ACTIONS = [
  { key: "payment", icon: "send", label: "Send", screen: "Payment" },
  { key: "qr", icon: "qr-code", label: "Scan QR", screen: "QRScan" },
  { key: "remit", icon: "swap-horizontal", label: "Remit", screen: "Remittance" },
  { key: "copilot", icon: "chatbubble-ellipses", label: "AI Guide", screen: "Copilot" },
  { key: "experiences", icon: "compass", label: "Explore", screen: "Experiences" },
] as const;

export default function TouristDashboard({ navigation }: { navigation: any }) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [w, r, qSize] = await Promise.all([
        api.getWallet().catch(() => null),
        api.getExchangeRates().catch(() => []),
        offlineStore.getQueueSize(),
      ]);
      if (w) setWallet(w);
      if (Array.isArray(r)) setRates(r);
      setOfflineCount(qSize);
    } catch { /* offline fallback */ }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ConnectivityBanner />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.greeting}>Welcome, Traveler</Text>

        {/* Wallet summary */}
        <Card>
          <Text style={styles.sectionTitle}>Digital Wallet</Text>
          {wallet ? (
            <>
              <Text style={styles.balance}>${wallet.totalUSD.toFixed(2)} USD</Text>
              <View style={styles.currencyRow}>
                {wallet.balances.slice(0, 4).map((b) => (
                  <View key={b.currency} style={styles.currencyChip}>
                    <Text style={styles.chipLabel}>{b.symbol}{b.amount.toFixed(2)}</Text>
                    <Text style={styles.chipCurrency}>{b.currency}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.placeholder}>Loading wallet...</Text>
          )}
        </Card>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity key={a.key} style={styles.actionBtn} onPress={() => navigation.navigate(a.screen)}>
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon as never} size={22} color={colors.primary} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Exchange rates */}
        <Card>
          <Text style={styles.sectionTitle}>Live Exchange Rates</Text>
          {rates.slice(0, 5).map((r) => (
            <View key={`${r.from}-${r.to}`} style={styles.rateRow}>
              <Text style={styles.ratePair}>{r.from}/{r.to}</Text>
              <Text style={styles.rateValue}>{r.rate.toFixed(4)}</Text>
            </View>
          ))}
          {rates.length === 0 && <Text style={styles.placeholder}>Rates unavailable offline</Text>}
        </Card>

        {/* Offline queue */}
        {offlineCount > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate("OfflineQueue")}>
            <Card style={{ borderColor: colors.warning }}>
              <View style={styles.offlineRow}>
                <Ionicons name="cloud-upload" size={20} color={colors.warning} />
                <Text style={styles.offlineText}>{offlineCount} pending offline action{offlineCount > 1 ? "s" : ""}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  greeting: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.md },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 1 },
  balance: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: "bold" },
  currencyRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  currencyChip: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.sm, minWidth: 70, alignItems: "center" },
  chipLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: "600" },
  chipCurrency: { color: colors.textMuted, fontSize: fontSize.xs },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md },
  actionBtn: { alignItems: "center", flex: 1 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border },
  actionLabel: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: spacing.xs },
  rateRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  ratePair: { color: colors.text, fontSize: fontSize.md },
  rateValue: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
  placeholder: { color: colors.textMuted, fontSize: fontSize.sm },
  offlineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  offlineText: { color: colors.warning, fontSize: fontSize.md, flex: 1 },
});
