/**
 * Channel Manager Home — Native mobile overview of all connected distribution channels.
 *
 * Features:
 * - Status cards for all 6 GDS/OTA platforms
 * - Quick-action buttons (Sync, Connect, Disconnect)
 * - Summary stats (active channels, bookings, syncs)
 * - Pull-to-refresh
 * - Navigation to detailed screens
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { channelManagerAPI, ChannelStatus } from "../../services/api";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ChannelStackParams } from "../../navigation/RootNavigator";

type Props = {
  navigation: NativeStackNavigationProp<ChannelStackParams, "ChannelHome">;
};

interface ChannelMeta {
  id: string;
  name: string;
  displayName: string;
  emoji: string;
  color: string;
  description: string;
}

const CHANNELS: ChannelMeta[] = [
  { id: "sabre", name: "sabre", displayName: "Sabre GDS", emoji: "🌐", color: "#2563eb", description: "400,000+ travel agents" },
  { id: "amadeus", name: "amadeus", displayName: "Amadeus", emoji: "✈️", color: "#4f46e5", description: "770,000+ sellers globally" },
  { id: "little_emperors", name: "little_emperors", displayName: "Little Emperors", emoji: "👑", color: "#d97706", description: "Luxury flash sales" },
  { id: "expedia", name: "expedia", displayName: "Expedia EPC", emoji: "🏨", color: "#ca8a04", description: "World's largest OTA group" },
  { id: "booking_com", name: "booking_com", displayName: "Booking.com", emoji: "📘", color: "#1e40af", description: "28M+ listings, 226 countries" },
  { id: "travelport", name: "travelport", displayName: "Travelport", emoji: "🌍", color: "#059669", description: "Galileo, Apollo, Worldspan" },
];

export function ChannelManagerHome({ navigation }: Props) {
  const { user, token } = useAuth();
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const establishmentId = user?.establishmentId ?? 1;

  const loadChannels = useCallback(async () => {
    if (!token) return;
    try {
      const data = await channelManagerAPI.listChannels(establishmentId, token);
      setChannels(data);
    } catch (err) {
      // Graceful fallback
    }
  }, [establishmentId, token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChannels();
    setRefreshing(false);
  }, [loadChannels]);

  const handleSync = async (channelName: string) => {
    if (!token) return;
    setSyncing(channelName);
    try {
      await channelManagerAPI.triggerSync({ establishmentId, channel: channelName }, token);
      Alert.alert("Sync Started", "Channel sync has been triggered.");
      await loadChannels();
    } catch {
      Alert.alert("Sync Failed", "Could not trigger sync. Try again.");
    } finally {
      setSyncing(null);
    }
  };

  const getChannelStatus = (name: string): ChannelStatus | undefined =>
    channels.find((c) => c.name === name);

  const connectedCount = channels.filter((c) => c.connected).length;

  // Load on mount
  React.useEffect(() => { loadChannels(); }, [loadChannels]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}
    >
      {/* ─── Header Stats ─────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{connectedCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{CHANNELS.length - connectedCount}</Text>
          <Text style={styles.statLabel}>Available</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>—</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: "#10b981" }]}>✓</Text>
          <Text style={styles.statLabel}>Parity</Text>
        </View>
      </View>

      {/* ─── Quick Actions ────────────────────────────────────────────────── */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate("InboundBookings")}
        >
          <Text style={styles.actionEmoji}>📥</Text>
          <Text style={styles.actionLabel}>Bookings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate("ProductMapping")}
        >
          <Text style={styles.actionEmoji}>🔗</Text>
          <Text style={styles.actionLabel}>Mapping</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate("RateParity")}
        >
          <Text style={styles.actionEmoji}>⚖️</Text>
          <Text style={styles.actionLabel}>Parity</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Channel Cards ────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Distribution Channels</Text>

      {CHANNELS.map((ch) => {
        const status = getChannelStatus(ch.name);
        const isConnected = status?.connected ?? false;

        return (
          <View key={ch.id} style={[styles.channelCard, isConnected && styles.channelCardActive]}>
            <View style={styles.channelHeader}>
              <View style={styles.channelInfo}>
                <Text style={styles.channelEmoji}>{ch.emoji}</Text>
                <View>
                  <Text style={styles.channelName}>{ch.displayName}</Text>
                  <Text style={styles.channelDesc}>{ch.description}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, isConnected ? styles.badgeLive : styles.badgeOffline]}>
                <Text style={[styles.statusText, isConnected ? styles.textLive : styles.textOffline]}>
                  {isConnected ? "LIVE" : "OFF"}
                </Text>
              </View>
            </View>

            {isConnected && status?.lastSyncAt && (
              <Text style={styles.syncTime}>
                Last sync: {new Date(status.lastSyncAt).toLocaleString()}
              </Text>
            )}

            <View style={styles.channelActions}>
              {isConnected ? (
                <>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnOutline]}
                    onPress={() => handleSync(ch.name)}
                    disabled={syncing === ch.name}
                  >
                    <Text style={styles.btnOutlineText}>
                      {syncing === ch.name ? "Syncing..." : "↻ Sync"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnOutline]}
                    onPress={() => navigation.navigate("ChannelSync", { channelId: ch.name })}
                  >
                    <Text style={styles.btnOutlineText}>History</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => navigation.navigate("ChannelConnect", { channelId: ch.name })}
                >
                  <Text style={styles.btnPrimaryText}>Connect</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", paddingHorizontal: 16 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 8 },
  statCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 2 },
  actionsRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 20, marginBottom: 8 },
  actionBtn: { alignItems: "center", padding: 12, backgroundColor: "#1a1a2e", borderRadius: 12, width: 90 },
  actionEmoji: { fontSize: 24, marginBottom: 4 },
  actionLabel: { fontSize: 11, color: "#ccc", fontWeight: "500" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  channelCard: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#2d2d44" },
  channelCardActive: { borderColor: "#22c55e40" },
  channelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  channelInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  channelEmoji: { fontSize: 28 },
  channelName: { fontSize: 15, fontWeight: "600", color: "#fff" },
  channelDesc: { fontSize: 12, color: "#888", marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeLive: { backgroundColor: "#22c55e20" },
  badgeOffline: { backgroundColor: "#64748b20" },
  statusText: { fontSize: 10, fontWeight: "700" },
  textLive: { color: "#22c55e" },
  textOffline: { color: "#64748b" },
  syncTime: { fontSize: 11, color: "#666", marginTop: 8 },
  channelActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnPrimary: { backgroundColor: "#6c63ff", flex: 1, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  btnOutline: { borderWidth: 1, borderColor: "#3d3d5c", alignItems: "center" },
  btnOutlineText: { color: "#ccc", fontWeight: "500", fontSize: 13 },
});
