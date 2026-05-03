import React, { useState, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView,
  TouchableOpacity, TextInput, Alert, Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type Product } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", price: "", currency: "USD", category: "Food" });

  const load = async () => {
    try { const data = await api.getMerchantProducts(); if (Array.isArray(data)) setProducts(data); } catch {}
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleCreate = async () => {
    if (!form.name || !form.price) { Alert.alert("Error", "Fill in name and price"); return; }
    try {
      await api.createProduct({ ...form, price: parseFloat(form.price) });
      setShowCreate(false);
      setForm({ name: "", description: "", price: "", currency: "USD", category: "Food" });
      load();
    } catch { Alert.alert("Error", "Could not create product"); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(!showCreate)}>
          <Ionicons name={showCreate ? "close" : "add"} size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showCreate && (
        <Card>
          {(["name", "description", "price", "category"] as const).map((field) => (
            <TextInput key={field} style={styles.input}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              placeholderTextColor={colors.textMuted}
              value={form[field]}
              onChangeText={(v) => setForm({ ...form, [field]: v })}
              keyboardType={field === "price" ? "decimal-pad" : "default"} />
          ))}
          <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
            <Text style={styles.createText}>Add Product</Text>
          </TouchableOpacity>
        </Card>
      )}

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prodName}>{item.name}</Text>
                <Text style={styles.prodDesc} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.prodCat}>{item.category}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.prodPrice}>{item.currency} {item.price.toFixed(2)}</Text>
                <StatusBadge status={item.available ? "Active" : "Inactive"} variant={item.available ? "success" : "default"} />
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No products. Add one to get started.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold" },
  addBtn: { backgroundColor: colors.primary, borderRadius: 20, width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  input: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  createBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center" },
  createText: { color: colors.white, fontWeight: "600" },
  list: { padding: spacing.md },
  row: { flexDirection: "row" },
  prodName: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  prodDesc: { color: colors.textSecondary, fontSize: fontSize.sm },
  prodCat: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  prodPrice: { color: colors.secondary, fontSize: fontSize.lg, fontWeight: "bold", marginBottom: 4 },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
