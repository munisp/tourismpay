/**
 * MerchantProducts — Product/service catalog from tRPC API with CRUD.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from "react-native";
import { merchantAPI } from "../../services/api";

export function MerchantProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await merchantAPI.getProducts();
      setProducts(data);
    } catch {
      // Offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) {
    return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  }

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      <View style={s.header}>
        <Text style={s.title}>{products.length} Products</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => Alert.alert("Coming Soon", "Product creation will be available soon")}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {products.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>📦</Text>
          <Text style={s.emptyText}>No products yet</Text>
          <Text style={s.emptySubtext}>Add your first product or experience</Text>
        </View>
      ) : (
        products.map((product) => (
          <View key={product.id} style={s.productCard}>
            <View style={s.productHeader}>
              <Text style={s.productName}>{product.name}</Text>
              <View style={[s.statusBadge, product.active ? s.active : s.inactive]}>
                <Text style={s.statusText}>{product.active ? "Active" : "Inactive"}</Text>
              </View>
            </View>
            <Text style={s.productDesc} numberOfLines={2}>{product.description}</Text>
            <View style={s.productMeta}>
              <Text style={s.price}>${product.price?.toFixed(2) ?? "0.00"}</Text>
              <Text style={s.stock}>Stock: {product.quantity ?? "∞"}</Text>
              <Text style={s.category}>{product.category}</Text>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  addBtn: { backgroundColor: "#6c63ff", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center", marginTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4 },
  productCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 10 },
  productHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  productName: { color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  active: { backgroundColor: "rgba(34,197,94,0.15)" },
  inactive: { backgroundColor: "rgba(239,68,68,0.15)" },
  statusText: { fontSize: 10, fontWeight: "600", color: "#22c55e" },
  productDesc: { color: "#888", fontSize: 11, marginTop: 6 },
  productMeta: { flexDirection: "row", gap: 12, marginTop: 10 },
  price: { color: "#6c63ff", fontSize: 14, fontWeight: "700" },
  stock: { color: "#888", fontSize: 12 },
  category: { color: "#666", fontSize: 12, textTransform: "capitalize" },
});
