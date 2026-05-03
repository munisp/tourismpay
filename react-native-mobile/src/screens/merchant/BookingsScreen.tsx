import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView } from "react-native";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type Booking } from "../../services/api";
import { colors, spacing, fontSize } from "../../theme";

const statusVariant = (s: string) => {
  if (s === "confirmed") return "success";
  if (s === "pending") return "warning";
  if (s === "cancelled") return "error";
  return "default";
};

export default function BookingsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { const data = await api.getMerchantBookings(); if (Array.isArray(data)) setBookings(data); } catch {}
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Bookings</Text>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.customerName}</Text>
                <Text style={styles.date}>{item.date}</Text>
                <Text style={styles.items}>{item.items.join(", ")}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amount}>{item.currency} {item.amount.toFixed(2)}</Text>
                <StatusBadge status={item.status} variant={statusVariant(item.status)} />
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No bookings yet</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", padding: spacing.md },
  list: { padding: spacing.md },
  row: { flexDirection: "row" },
  name: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  date: { color: colors.textSecondary, fontSize: fontSize.sm },
  items: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  amount: { color: colors.secondary, fontSize: fontSize.lg, fontWeight: "bold", marginBottom: 4 },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
