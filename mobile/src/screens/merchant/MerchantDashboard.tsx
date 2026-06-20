/**
 * Merchant Dashboard — real-time stats, revenue, and quick actions from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { merchantAPI, MerchantStats } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MerchantStackParams } from "../../navigation/RootNavigator";

type Props = { navigation: NativeStackNavigationProp<MerchantStackParams, "MerchantHome"> };

export function MerchantDashboard({ navigation }: Props) {
  const { user } = useAuth();
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await merchantAPI.getDashboardStats();
      setStats(data);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  const currency = stats?.currency ?? "USD";

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <Text style={s.greeting}>Welcome, {user?.name ?? "Merchant"}</Text>

      {/* Stats Grid */}
      <View style={s.statsGrid}>
        <View style={s.statCard}>
          <Text style={s.statNum}>{currency} {(stats?.todayRevenue ?? 0).toLocaleString()}</Text>
          <Text style={s.statLabel}>Today's Revenue</Text>
          {stats?.revenueChange !== undefined && (
            <Text style={[s.change, stats.revenueChange >= 0 ? s.positive : s.negative]}>
              {stats.revenueChange >= 0 ? "+" : ""}{stats.revenueChange.toFixed(1)}%
            </Text>
          )}
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>{stats?.todayTransactions ?? 0}</Text>
          <Text style={s.statLabel}>Transactions</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>{stats?.activeBookings ?? 0}</Text>
          <Text style={s.statLabel}>Active Bookings</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>{stats?.channelSync ?? 0}</Text>
          <Text style={s.statLabel}>Channel Syncs</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <Text style={s.section}>Quick Actions</Text>
      <View style={s.actionsGrid}>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Revenue")}>
          <Text style={s.actionEmoji}>📊</Text>
          <Text style={s.actionText}>Revenue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("QRCodes")}>
          <Text style={s.actionEmoji}>📱</Text>
          <Text style={s.actionText}>QR Pay</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Products")}>
          <Text style={s.actionEmoji}>🛍️</Text>
          <Text style={s.actionText}>Products</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Bookings")}>
          <Text style={s.actionEmoji}>📅</Text>
          <Text style={s.actionText}>Bookings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Cashier")}>
          <Text style={s.actionEmoji}>💳</Text>
          <Text style={s.actionText}>Cashier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Payouts")}>
          <Text style={s.actionEmoji}>💰</Text>
          <Text style={s.actionText}>Payouts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Staff")}>
          <Text style={s.actionEmoji}>👥</Text>
          <Text style={s.actionText}>Staff</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => navigation.navigate("Channels")}>
          <Text style={s.actionEmoji}>🌐</Text>
          <Text style={s.actionText}>Channels</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  greeting: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 16, marginBottom: 20 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "48%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, alignItems: "center" },
  statNum: { fontSize: 18, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 4 },
  change: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  positive: { color: "#22c55e" },
  negative: { color: "#ef4444" },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { width: "23%", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14 },
  actionEmoji: { fontSize: 24, marginBottom: 6 },
  actionText: { fontSize: 10, color: "#ccc", textAlign: "center" },
});
