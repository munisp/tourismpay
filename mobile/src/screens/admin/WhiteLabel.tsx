import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { apiRequest } from "../../services/api";

export default function WhiteLabelScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest("/admin/whitelabel");
      setData(result);
    } catch (e: any) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !error) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#1a56db" />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Text style={styles.errorText}>⚠️ {error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>WhiteLabel</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.bodyText}>
          {data ? JSON.stringify(data, null, 2) : "No data available"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  header: { padding: 20, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  content: { padding: 16 },
  bodyText: { fontSize: 12, color: "#374151", fontFamily: "monospace" },
  loadingText: { marginTop: 12, color: "#6b7280" },
  errorText: { color: "#dc2626", textAlign: "center", marginBottom: 16 },
  retryBtn: { backgroundColor: "#1a56db", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});
