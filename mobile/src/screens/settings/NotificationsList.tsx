/**
 * NotificationsList — displays all notifications from tRPC API with mark-read support.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { notificationsAPI, AppNotification } from "../../services/api";

export function NotificationsList() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationsAPI.getAll({ limit: 50 });
      setNotifications(data);
    } catch {
      // Offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      // Ignore
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // Ignore
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <View style={s.header}>
        <Text style={s.title}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={s.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>🔔</Text>
          <Text style={s.emptyText}>No notifications</Text>
          <Text style={s.emptySubtext}>You're all caught up!</Text>
        </View>
      ) : (
        notifications.map((notif) => (
          <TouchableOpacity
            key={notif.id}
            style={[s.notifCard, !notif.read && s.unread]}
            onPress={() => markRead(notif.id)}
          >
            <View style={s.notifIcon}>
              <Text style={s.notifEmoji}>
                {notif.type === "transaction" ? "💸" :
                 notif.type === "booking" ? "📅" :
                 notif.type === "security" ? "🔒" :
                 notif.type === "promotion" ? "🎁" : "🔔"}
              </Text>
            </View>
            <View style={s.notifContent}>
              <Text style={[s.notifTitle, !notif.read && s.unreadText]}>{notif.title}</Text>
              <Text style={s.notifBody} numberOfLines={2}>{notif.body}</Text>
              <Text style={s.notifTime}>{new Date(notif.createdAt).toLocaleDateString()}</Text>
            </View>
            {!notif.read && <View style={s.unreadDot} />}
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff" },
  markAll: { color: "#6c63ff", fontSize: 12, fontWeight: "500" },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center", marginTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4 },
  notifCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  unread: { borderLeftWidth: 3, borderLeftColor: "#6c63ff" },
  notifIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0f0f1a", alignItems: "center", justifyContent: "center" },
  notifEmoji: { fontSize: 18 },
  notifContent: { flex: 1 },
  notifTitle: { color: "#ccc", fontSize: 13, fontWeight: "500" },
  unreadText: { color: "#fff", fontWeight: "600" },
  notifBody: { color: "#888", fontSize: 11, marginTop: 2 },
  notifTime: { color: "#666", fontSize: 10, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#6c63ff" },
});
