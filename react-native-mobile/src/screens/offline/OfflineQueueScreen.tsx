import React, { useState, useEffect } from "react";
import {
  View, Text, SafeAreaView, FlatList, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { offlineStore } from "../../services/offlineStore";
import { useConnectivity } from "../../hooks/useConnectivity";
import type { OfflineAction } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function OfflineQueueScreen() {
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const { isConnected } = useConnectivity();

  const load = async () => { setQueue(await offlineStore.getQueue()); };
  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    if (!isConnected) { Alert.alert("Offline", "Cannot sync while offline"); return; }
    setSyncing(true);
    const result = await offlineStore.attemptSync();
    setSyncing(false);
    if (result) {
      Alert.alert("Sync Complete", `Synced: ${result.synced}, Failed: ${result.failed}`);
    }
    load();
  };

  const handleClear = () => {
    Alert.alert("Clear Queue", "Remove all pending actions?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => { await offlineStore.clearQueue(); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{queue.length} Pending</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={syncing || !isConnected}>
            {syncing ? <ActivityIndicator color={colors.white} size="small" /> :
              <Ionicons name="sync" size={18} color={colors.white} />}
            <Text style={styles.syncText}>Sync Now</Text>
          </TouchableOpacity>
          {queue.length > 0 && (
            <TouchableOpacity onPress={handleClear}>
              <Ionicons name="trash" size={22} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color={colors.error} />
          <Text style={styles.offlineText}>You're offline. Queue will sync when connected.</Text>
        </View>
      )}

      <FlatList data={queue} keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <Ionicons name={item.type === "payment" ? "send" : "sync"} size={20} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.actionType}>{item.type}</Text>
                <Text style={styles.actionTime}>{new Date(item.timestamp).toLocaleString()}</Text>
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={styles.emptyText}>All synced! No pending actions.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  syncBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  syncText: { color: colors.white, fontWeight: "600" },
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, marginHorizontal: spacing.md, backgroundColor: colors.error + "20", borderRadius: 8 },
  offlineText: { color: colors.error, fontSize: fontSize.sm },
  list: { padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center" },
  actionType: { color: colors.text, fontSize: fontSize.md, fontWeight: "600", textTransform: "capitalize" },
  actionTime: { color: colors.textMuted, fontSize: fontSize.sm },
  emptyContainer: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md },
});
